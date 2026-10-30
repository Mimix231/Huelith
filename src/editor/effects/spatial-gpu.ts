/**
 * Project Fluidity: full-resolution WebGL2 point-spread rendering.
 *
 * This is the exact spatial sampling implementation used for native GPU
 * previews AND exports when GPU processing is available. It does not render a
 * reduced-resolution draft. Pixels/alpha use premultiplied accumulation, and
 * taps follow motion vectors, rotational paths, or aperture polygons.
 *
 * The retained input texture is only reused for explicitly immutable sources.
 * The engine never mutates the editor's artwork or stores effects in a project.
 */
import type { Effect } from '../types';

export type SpatialMode = 'motion' | 'radial' | 'lens';
let userAllowsGpu = true;
export function setSpatialGpuEnabled(value: boolean): void { userAllowsGpu = value; }

const VS = `#version 300 es
void main(){
  vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));
  gl_Position=vec4(p*2.0-1.0,0.0,1.0);
}`;
const FS = `#version 300 es
precision highp float;
uniform sampler2D uSource;
uniform vec2 uResolution;
uniform vec2 uCenter;
uniform float uRadius;
uniform float uAngle;
uniform float uFocus;
uniform float uBlades;
uniform int uMode;
out vec4 pixel;
#define PI 3.141592653589793
const int N = 25;
void main() {
  vec2 pos=gl_FragCoord.xy;
  vec4 original=texture(uSource,pos/uResolution);
  float focusMix=1.0;
  if(uMode==2){
    float d=distance(pos,uCenter);
    focusMix=smoothstep(uFocus*0.55,uFocus*1.35,d);
    if(focusMix<=0.0){pixel=vec4(original.rgb/max(original.a,0.00001),original.a);return;}
  }
  // Upload textures premultiplied so bilinear taps preserve transparent edges.
  vec4 sum=vec4(0.0);
  for(int i=0;i<N;i++){
    float t=(float(i)+0.5)/float(N);
    vec2 point=pos;
    if(uMode==0){
      float shift=(2.0*t-1.0)*uRadius*2.2;
      point+=vec2(cos(uAngle),sin(uAngle))*shift;
    }else if(uMode==1){
      float theta=(2.0*t-1.0)*radians(uRadius);
      vec2 d=pos-uCenter;
      point=uCenter+vec2(d.x*cos(theta)-d.y*sin(theta),d.x*sin(theta)+d.y*cos(theta));
    }else{
      float theta=float(i)*2.399963229728653;
      float radial=sqrt(t);
      float sector=2.0*PI/uBlades;
      float local=mod(theta,sector)-sector*0.5;
      float polygon=cos(PI/uBlades)/max(0.001,cos(local));
      point+=vec2(cos(theta),sin(theta))*radial*uRadius*polygon;
    }
    sum+=texture(uSource,clamp(point/uResolution,vec2(0.0),vec2(1.0)));
  }
  vec4 averaged=sum/float(N);
  vec4 mixed=mix(original,averaged,focusMix);
  pixel=vec4(mixed.a>0.00001?mixed.rgb/mixed.a:vec3(0.0),mixed.a);
}`;

interface RetainedTexture { texture: WebGLTexture; width: number; height: number }
class SpatialGpuProcessor {
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGL2RenderingContext;
  private readonly uniforms = new Map<string, WebGLUniformLocation|null>();
  private readonly program: WebGLProgram;
  private readonly retained = new Map<HTMLCanvasElement,RetainedTexture>();
  private readonly vao:WebGLVertexArrayObject;
  constructor() {
    const options={alpha:true,premultipliedAlpha:false,
      antialias:false,preserveDrawingBuffer:true,depth:false,stencil:false};
    let canvas=(typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(1,1) : document.createElement('canvas')) as HTMLCanvasElement;
    let gl=canvas.getContext('webgl2',options) as WebGL2RenderingContext|null;
    // Some desktop WebViews support WebGL2 on HTMLCanvasElement but not on
    // OffscreenCanvas. Exports on the UI thread can still accelerate there.
    if(!gl && typeof document!=='undefined'){
      canvas=document.createElement('canvas');
      gl=canvas.getContext('webgl2',options) as WebGL2RenderingContext|null;
    }
    if(!gl) throw Error('WebGL2 not supported');
    this.canvas=canvas; this.gl=gl;
    const compile=(type:number,code:string):WebGLShader=>{
      const shader=gl.createShader(type);
      if(!shader)throw Error('Cannot create shader');
      gl.shaderSource(shader,code);gl.compileShader(shader);
      if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){
        const message=gl.getShaderInfoLog(shader)??'Unknown WebGL shader error';
        gl.deleteShader(shader);throw Error(message);
      }
      return shader;
    };
    const program=gl.createProgram();if(!program)throw Error('Cannot create WebGL program');
    const v=compile(gl.VERTEX_SHADER,VS),f=compile(gl.FRAGMENT_SHADER,FS);
    gl.attachShader(program,v);gl.attachShader(program,f);gl.linkProgram(program);
    gl.deleteShader(v);gl.deleteShader(f);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program)??'WebGL link error');
    this.program=program;
    const vao=gl.createVertexArray();if(!vao)throw Error('Cannot create WebGL vertex array');
    this.vao=vao;
    gl.useProgram(program);gl.uniform1i(gl.getUniformLocation(program,'uSource'),0);
    gl.disable(gl.BLEND);gl.disable(gl.DITHER);gl.disable(gl.DEPTH_TEST);
  }
  private uniform(name:string):WebGLUniformLocation|null{
    if(!this.uniforms.has(name))this.uniforms.set(name,this.gl.getUniformLocation(this.program,name));
    return this.uniforms.get(name)??null;
  }
  render(source:HTMLCanvasElement,effect:Effect,mode:SpatialMode,immutable:boolean):HTMLCanvasElement|null {
    const gl=this.gl;
    if(gl.isContextLost())return null;
    const {width:w,height:h}=source;
    const max=gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    if(w===0||h===0||w>max||h>max)return null;
    if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}
    const old=this.retained.get(source);
    let entry=old;
    if(entry && (entry.width!==w||entry.height!==h)){
      gl.deleteTexture(entry.texture);this.retained.delete(source);entry=undefined;
    }
    if(!entry){
      const texture=gl.createTexture();if(!texture)return null;
      entry={texture,width:w,height:h};
      this.retained.set(source,entry);
    }
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,entry.texture);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    if(!immutable || !old){
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
    }
    // Bounded source cache. Avoid keeping one GPU texture per animation cel forever.
    this.retained.delete(source);this.retained.set(source,entry);
    while(this.retained.size>5){
      const [key,oldest]=this.retained.entries().next().value as [HTMLCanvasElement,RetainedTexture];
      gl.deleteTexture(oldest.texture);this.retained.delete(key);
    }
    const p=effect.parameters;
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,w,h);
    gl.useProgram(this.program);gl.bindVertexArray(this.vao);
    gl.uniform2f(this.uniform('uResolution'),w,h);
    // Canvas coordinates have their origin at the top; shader coordinates are bottom-up.
    gl.uniform2f(this.uniform('uCenter'),w*(p?.centerX??50)/100,h*(1-(p?.centerY??50)/100));
    gl.uniform1f(this.uniform('uRadius'),Math.max(0,Math.min(70,effect.amount))*.35);
    gl.uniform1f(this.uniform('uAngle'),-(p?.angle??0)*Math.PI/180);
    gl.uniform1f(this.uniform('uFocus'),Math.max(1,(p?.focusRadius??38)/100*Math.min(w,h)));
    gl.uniform1f(this.uniform('uBlades'),Math.max(3,Math.min(12,Math.round(p?.blades??6))));
    gl.uniform1i(this.uniform('uMode'),mode==='motion'?0:mode==='radial'?1:2);
    gl.drawArrays(gl.TRIANGLES,0,3);
    gl.bindVertexArray(null);
    const out=(typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(w,h):document.createElement('canvas')) as HTMLCanvasElement;
    out.width=w;out.height=h;
    const ctx=out.getContext('2d');if(!ctx)return null;
    ctx.drawImage(this.canvas,0,0);
    return out;
  }
}
let engine:SpatialGpuProcessor|null|undefined;
export function tryGpuSpatialBlur(source:HTMLCanvasElement,effect:Effect,mode:SpatialMode,immutable=false):HTMLCanvasElement|null {
  if(!userAllowsGpu || source.width*source.height<16000 || effect.amount<=0)return null;
  try {
    if(typeof window!=='undefined'&&typeof localStorage!=='undefined'){
      const raw=localStorage.getItem('huelith-aurora-preferences-v1');
      if(raw && JSON.parse(raw)?.gpuAcceleration===false)return null;
    }
    if(engine===undefined)engine=new SpatialGpuProcessor();
    return engine?.render(source,effect,mode,immutable)??null;
  } catch {
    // A lost or unsupported GPU must never prevent full-quality CPU fallback.
    engine=null;
    return null;
  }
}

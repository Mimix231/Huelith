/** Exact per-effect GPU kernels authored in the owning Rust effect modules.
 * No draft substitutions, LUT interpolation, reduced resolution or stack cap.
 * Export and dragging consume this same graph once an operation is qualified.
 */
import catalog from './effects/gpu-catalog.json';
import type { Effect } from './types';

const kernels = new Map(catalog.map(entry => [entry.kind, entry.body]));
const rejected = new Set<string>();
let engine: ExactGpuEngine | null | undefined;
const vertex = `#version 300 es
void main(){
  vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));
  gl_Position=vec4(p*2.0-1.0,0.0,1.0);
}`;
const fragment = (body:string) => `#version 300 es
precision highp float;
uniform sampler2D inputImage;
uniform float amount;
out vec4 outputPixel;
void main(){
  vec4 source=texelFetch(inputImage,ivec2(gl_FragCoord.xy),0);
  vec3 rgb=source.rgb;
  ${body}
  outputPixel=vec4(round(clamp(rgb,0.0,1.0)*255.0)/255.0,source.a);
}`;

interface SourceTexture { texture:WebGLTexture; width:number; height:number }
interface Pass { program:WebGLProgram; amount:WebGLUniformLocation|null }
class ExactGpuEngine {
  readonly canvas:HTMLCanvasElement;
  private readonly gl:WebGL2RenderingContext;
  private readonly programs=new Map<string,Pass>();
  private readonly sources=new Map<HTMLCanvasElement,SourceTexture>();
  private textures:WebGLTexture[]=[];
  private framebuffers:WebGLFramebuffer[]=[];
  private width=0;
  private height=0;

  constructor(){
    this.canvas=(typeof document!=='undefined'?document.createElement('canvas'):new OffscreenCanvas(1,1)) as HTMLCanvasElement;
    const gl=this.canvas.getContext('webgl2',{alpha:true,premultipliedAlpha:false,antialias:false,preserveDrawingBuffer:true}) as WebGL2RenderingContext|null;
    if(!gl || typeof gl.createShader!=='function')throw Error('WebGL2 unavailable');
    this.gl=gl;
    gl.disable(gl.BLEND);gl.disable(gl.DITHER);
  }
  private shader(kind:number,source:string):WebGLShader{
    const gl=this.gl;const shader=gl.createShader(kind);if(!shader)throw Error('Shader allocation failed');
    gl.shaderSource(shader,source);gl.compileShader(shader);
    if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){const error=gl.getShaderInfoLog(shader);gl.deleteShader(shader);throw Error(error??'Shader compilation failed');}
    return shader;
  }
  private pass(kind:string):Pass{
    const cached=this.programs.get(kind);if(cached)return cached;
    const body=kernels.get(kind);if(!body)throw Error(`No exact GPU kernel for ${kind}`);
    const gl=this.gl;const program=gl.createProgram();if(!program)throw Error('Program allocation failed');
    const vs=this.shader(gl.VERTEX_SHADER,vertex);const fs=this.shader(gl.FRAGMENT_SHADER,fragment(body));
    gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);gl.deleteShader(vs);gl.deleteShader(fs);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS)){const message=gl.getProgramInfoLog(program);gl.deleteProgram(program);throw Error(message??'GPU link failed');}
    gl.useProgram(program);gl.uniform1i(gl.getUniformLocation(program,'inputImage'),0);
    const pass={program,amount:gl.getUniformLocation(program,'amount')};this.programs.set(kind,pass);return pass;
  }
  private texture():WebGLTexture{
    const gl=this.gl;const texture=gl.createTexture();if(!texture)throw Error('Texture allocation failed');
    gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    return texture;
  }
  private resize(width:number,height:number):void{
    if(this.width===width&&this.height===height)return;
    const gl=this.gl;const max=gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    if(width<1||height<1||width>max||height>max)throw Error('Document exceeds GPU texture dimensions');
    for(const fbo of this.framebuffers)gl.deleteFramebuffer(fbo);
    for(const texture of this.textures)gl.deleteTexture(texture);
    this.framebuffers=[];this.textures=[];
    this.width=width;this.height=height;this.canvas.width=width;this.canvas.height=height;
    for(let i=0;i<2;i++){
      const texture=this.texture();gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
      const fbo=gl.createFramebuffer();if(!fbo)throw Error('Framebuffer allocation failed');
      gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);
      if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Incomplete GPU framebuffer');
      this.textures.push(texture);this.framebuffers.push(fbo);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,width,height);
  }
  render(source:HTMLCanvasElement,effects:readonly Effect[],immutable:boolean):HTMLCanvasElement{
    const gl=this.gl;if(gl.isContextLost())throw Error('GPU context lost');
    this.resize(source.width,source.height);
    let resident=this.sources.get(source);
    if(resident&&(resident.width!==source.width||resident.height!==source.height)){gl.deleteTexture(resident.texture);this.sources.delete(source);resident=undefined;}
    if(!resident){resident={texture:this.texture(),width:source.width,height:source.height};}
    if(!immutable||!this.sources.has(source)){
      gl.bindTexture(gl.TEXTURE_2D,resident.texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
    }
    this.sources.delete(source);this.sources.set(source,resident);
    let bytes=0;for(const item of this.sources.values())bytes+=item.width*item.height*4;
    while((bytes>192*1024*1024||this.sources.size>8)&&this.sources.size>1){
      const [key,item]=this.sources.entries().next().value as [HTMLCanvasElement,SourceTexture];
      gl.deleteTexture(item.texture);this.sources.delete(key);bytes-=item.width*item.height*4;
    }
    const active=effects.filter(e=>e.enabled);let input=resident.texture;
    gl.activeTexture(gl.TEXTURE0);
    for(let i=0;i<active.length;i++){
      const effect=active[i];let pass:Pass;
      try{pass=this.pass(effect.kind);}catch(error){rejected.add(effect.kind);throw error;}
      gl.bindFramebuffer(gl.FRAMEBUFFER,i===active.length-1?null:this.framebuffers[i%2]);
      gl.useProgram(pass.program);gl.uniform1f(pass.amount,effect.amount);gl.bindTexture(gl.TEXTURE_2D,input);
      gl.drawArrays(gl.TRIANGLES,0,3);input=this.textures[i%2];
    }
    return this.canvas;
  }
}
export function exactGpuSupports(effects:readonly Effect[]):boolean{
  return effects.some(e=>e.enabled)&&effects.every(e=>!e.enabled||(kernels.has(e.kind)&&!rejected.has(e.kind)));
}
export function exactGpuAvailable(effects:readonly Effect[]):boolean{
  if(!exactGpuSupports(effects))return false;
  try{if(engine===undefined)engine=new ExactGpuEngine();return engine!==null;}catch{engine=null;return false;}
}
export function renderExactGpuEffects(source:HTMLCanvasElement,effects:readonly Effect[],immutable=false):HTMLCanvasElement|null{
  if(!exactGpuAvailable(effects))return null;
  try{
    return engine?.render(source,effects,immutable)??null;
  }catch{
    engine=null;
    return null;
  }
}

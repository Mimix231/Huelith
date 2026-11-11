import {createSurface} from '../canvas-surface';
import {isImmutableEffectSource,markImmutableEffectSource} from '../immutable-effect-sources';

const vertex=`#version 300 es
void main() {
  vec2 corner=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));
  gl_Position=vec4(corner*2.0-1.0,0.0,1.0);
}`;
const fragment=`#version 300 es
precision highp float;
precision highp sampler3D;
uniform sampler2D image;
uniform sampler3D cube;
uniform sampler2D curve;
uniform vec2 resolution;
uniform float edge;
uniform float strength;
uniform bool redFirst;
uniform bool channelCurve;
out vec4 color;
void main() {
  vec4 pixel=texture(image,gl_FragCoord.xy/resolution);
  if(channelCurve) {
    ivec3 i=ivec3(round(pixel.rgb*255.0));
    color=vec4(texelFetch(curve,ivec2(i.r,0),0).r,texelFetch(curve,ivec2(i.g,0),0).r,
      texelFetch(curve,ivec2(i.b,0),0).r,pixel.a);
    return;
  }
  vec3 rgb=redFirst?pixel.rgb:pixel.bgr;
  vec3 index=(rgb*(edge-1.0)+0.5)/edge;
  color=vec4(mix(pixel.rgb,texture(cube,index).rgb,strength),pixel.a);
}`;

function compile(gl:WebGL2RenderingContext,type:number,source:string){
  const shader=gl.createShader(type)!;
  gl.shaderSource(shader,source);
  gl.compileShader(shader);
  if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader)??'Could not compile the LUT shader.');
  return shader;
}

class LutRenderer{
  private readonly surface=createSurface();
  private readonly gl:WebGL2RenderingContext;
  private readonly image:WebGLTexture;
  private readonly curve:WebGLTexture;
  private readonly emptyCube:WebGLTexture;
  private readonly locations:Record<string,WebGLUniformLocation|null>;
  private readonly textures=new Map<Float32Array,WebGLTexture>();
  private lastSource?:HTMLCanvasElement;

  constructor(){
    const gl=this.surface.getContext('webgl2',{alpha:true,premultipliedAlpha:false,antialias:false,depth:false,
      stencil:false,preserveDrawingBuffer:true}) as WebGL2RenderingContext|null;
    if(!gl)throw Error('WebGL2 is unavailable.');
    this.gl=gl;
    const program=gl.createProgram()!,vs=compile(gl,gl.VERTEX_SHADER,vertex),fs=compile(gl,gl.FRAGMENT_SHADER,fragment);
    gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);
    gl.deleteShader(vs);gl.deleteShader(fs);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program)??'Could not link the LUT shader.');
    gl.useProgram(program);
    gl.bindVertexArray(gl.createVertexArray());
    this.locations=Object.fromEntries(['image','cube','curve','resolution','edge','strength','redFirst','channelCurve'].map(name=>[name,gl.getUniformLocation(program,name)]));
    gl.uniform1i(this.locations.image,0);gl.uniform1i(this.locations.cube,1);gl.uniform1i(this.locations.curve,2);
    this.image=gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.image);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,gl.NONE);
    this.emptyCube=gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_3D,this.emptyCube);
    gl.texStorage3D(gl.TEXTURE_3D,1,gl.RGB8,1,1,1);
    gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
    this.curve=gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,this.curve);
    gl.texStorage2D(gl.TEXTURE_2D,1,gl.R8,256,1);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
  }

  render(source:HTMLCanvasElement,lookup:{values:Float32Array;size:number;strength:number;redFirst:boolean}|{curve:Uint8ClampedArray}){
    const gl=this.gl,{width,height}=source;
    if(gl.isContextLost())throw Error('The video LUT graphics context was lost.');
    if(this.surface.width!==width)this.surface.width=width;
    if(this.surface.height!==height)this.surface.height=height;
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.image);
    if(this.lastSource!==source){
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);
      this.lastSource=isImmutableEffectSource(source)?source:undefined;
    }
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
    if('curve' in lookup){
      gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_3D,this.emptyCube);
      gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,this.curve);
      gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,256,1,gl.RED,gl.UNSIGNED_BYTE,new Uint8Array(lookup.curve));
    }else this.bindCube(lookup.values,lookup.size);
    gl.viewport(0,0,width,height);
    gl.uniform2f(this.locations.resolution,width,height);
    gl.uniform1i(this.locations.channelCurve,'curve' in lookup?1:0);
    if('values' in lookup){
      gl.uniform1f(this.locations.edge,lookup.size);
      gl.uniform1f(this.locations.strength,lookup.strength);
      gl.uniform1i(this.locations.redFirst,lookup.redFirst?1:0);
    }
    gl.drawArrays(gl.TRIANGLES,0,3);
    if(gl.getError()!==gl.NO_ERROR)throw Error('Could not render the video LUT.');
    const result=createSurface();result.width=width;result.height=height;
    result.getContext('2d')!.drawImage(this.surface,0,0);
    markImmutableEffectSource(result);
    return result;
  }

  private bindCube(values:Float32Array,size:number){
    const gl=this.gl;
    gl.activeTexture(gl.TEXTURE1);
    let texture=this.textures.get(values);
    if(texture){this.textures.delete(values);gl.bindTexture(gl.TEXTURE_3D,texture);}
    else{
      texture=gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_3D,texture);
      gl.texImage3D(gl.TEXTURE_3D,0,gl.RGB8,size,size,size,0,gl.RGB,gl.UNSIGNED_BYTE,Uint8ClampedArray.from(values));
      gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_3D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      for(const axis of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T,gl.TEXTURE_WRAP_R])gl.texParameteri(gl.TEXTURE_3D,axis,gl.CLAMP_TO_EDGE);
    }
    this.textures.set(values,texture);
    if(this.textures.size>8){
      const oldest=this.textures.keys().next().value!;
      gl.deleteTexture(this.textures.get(oldest)!);this.textures.delete(oldest);
    }
  }
}

let renderer:LutRenderer|false|undefined;
function lookup(source:HTMLCanvasElement,settings:Parameters<LutRenderer['render']>[1]){
  if(renderer===false)return;
  try{
    renderer??=new LutRenderer();
    return renderer.render(source,settings);
  }catch{renderer=false;return undefined;}
}

export function renderGpuLut(source:HTMLCanvasElement,values:Float32Array,size:number,strength=1,redFirst=true){
  return lookup(source,{values,size,strength,redFirst});
}

export function renderGpuChannelLut(source:HTMLCanvasElement,curve:Uint8ClampedArray){
  if(source.width*source.height<512*512)return;
  return lookup(source,{curve});
}

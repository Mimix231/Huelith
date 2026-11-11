import {parseGIF,decompressFrame,type ParsedGif} from 'gifuct-js';
import {createSurface} from '../canvas-surface';
import {markImmutableEffectSource} from '../immutable-effect-sources';

/** True-color, indexed, grayscale and RLE TGA, with both origin flags honored. */
export function decodeTga(buffer:ArrayBuffer):{width:number;height:number;rgba:Uint8ClampedArray}{
  const data=new Uint8Array(buffer),view=new DataView(buffer);if(data.length<18)throw Error('TGA header is incomplete');
  const type=data[2],indexed=type===1||type===9,gray=type===3||type===11,rle=type>=9;
  if(![1,2,3,9,10,11].includes(type))throw Error('Unsupported TGA image type');
  const width=view.getUint16(12,true),height=view.getUint16(14,true),depth=data[16],attributes=data[17]&15;
  if(!width||!height||width>16384||height>16384||width*height>64_000_000)throw Error('TGA dimensions exceed the image limit');
  let cursor=18+data[0];const need=(n:number)=>{if(cursor+n>data.length)throw Error('TGA pixel data is incomplete');};
  const color=(bits:number,monochrome=false):number[]=>{
    const bytes=Math.ceil(bits/8);need(bytes);const start=cursor;cursor+=bytes;
    if(monochrome){if(bits!==8&&bits!==16)throw Error('Unsupported grayscale TGA depth');return [data[start],data[start],data[start],bits===16?data[start+1]:255];}
    if(bits===15||bits===16){const n=data[start]|data[start+1]<<8;return [((n>>10)&31)*255/31,((n>>5)&31)*255/31,(n&31)*255/31,attributes&&bits===16?(n&32768?255:0):255];}
    if(bits!==24&&bits!==32)throw Error('Unsupported TGA color depth');
    return [data[start+2],data[start+1],data[start],bits===32&&attributes?data[start+3]:255];
  };
  const palette:number[][]=[],origin=view.getUint16(3,true),length=view.getUint16(5,true);
  if(data[1])for(let i=0;i<length;i++)palette[origin+i]=color(data[7]);
  const pixel=()=>{if(indexed){if(depth!==8&&depth!==16)throw Error('Unsupported TGA palette index');need(depth/8);let index=data[cursor++];if(depth===16)index|=data[cursor++]<<8;const c=palette[index];if(!c)throw Error('Invalid TGA palette index');return c;}return color(depth,gray);};
  const rgba=new Uint8ClampedArray(width*height*4);let count=0;
  const write=(c:number[])=>{const sx=count%width,sy=Math.floor(count/width),x=data[17]&16?width-1-sx:sx,y=data[17]&32?sy:height-1-sy;
    rgba.set(c,(y*width+x)*4);count++;};
  while(count<width*height){
    if(!rle){write(pixel());continue;}need(1);const header=data[cursor++],n=(header&127)+1;
    if(count+n>width*height)throw Error('TGA RLE packet exceeds image dimensions');
    if(header&128){const c=pixel();for(let i=0;i<n;i++)write(c);}else for(let i=0;i<n;i++)write(pixel());
  }return {width,height,rgba};
}
type GifFrame=Parameters<typeof decompressFrame>[0];
/** Explicit clock-driven GIF compositing, including restore/clear disposal.
 * Frame patches are decompressed on demand; only a small snapshot LRU is kept. */
export class GifSource {
  readonly width:number;readonly height:number;readonly duration:number;
  private gif:ParsedGif;private frames:GifFrame[];private delays:number[];private surface:HTMLCanvasElement;
  private current=-1;private previous:ReturnType<typeof decompressFrame>|null=null;private restore:ImageData|null=null;
  private snapshots=new Map<number,HTMLCanvasElement>();private bytes=0;
  private clear(ctx:CanvasRenderingContext2D,left=0,top=0,width=this.width,height=this.height,transparent=this.frames[0].gce?.extras.transparentColorGiven):void{
    ctx.clearRect(left,top,width,height);
    const background=this.gif.gct?.[this.gif.lsd.backgroundColorIndex];
    if(!transparent&&background){ctx.fillStyle=`rgb(${background.join(',')})`;ctx.fillRect(left,top,width,height);}
  }
  constructor(buffer:ArrayBuffer){
    this.gif=parseGIF(buffer);this.width=this.gif.lsd.width;this.height=this.gif.lsd.height;
    if(!this.width||!this.height||this.width*this.height>64_000_000)throw Error('GIF dimensions exceed the image limit');
    this.frames=this.gif.frames.filter((f):f is GifFrame=>'image' in f);
    if(!this.frames.length)throw Error('GIF has no image frames');
    this.delays=this.frames.map(f=>(f.gce?.delay||10)*.01);this.duration=this.delays.reduce((sum,t)=>sum+t,0);
    this.surface=createSurface();this.surface.width=this.width;this.surface.height=this.height;
  }
  frame(time:number):HTMLCanvasElement{
    let clock=((time%this.duration)+this.duration)%this.duration,index=0;
    while(index<this.delays.length-1&&clock>=this.delays[index])clock-=this.delays[index++];
    const old=this.snapshots.get(index);if(old){this.snapshots.delete(index);this.snapshots.set(index,old);return old;}
    const ctx=this.surface.getContext('2d',{willReadFrequently:true})!;
    if(index<=this.current){this.clear(ctx);this.current=-1;this.previous=null;this.restore=null;}
    if(this.current===-1)this.clear(ctx);
    while(this.current<index){
      if(this.previous?.disposalType===2){const d=this.previous.dims;this.clear(ctx,d.left,d.top,d.width,d.height,this.previous.transparentIndex!==undefined);}
      else if(this.previous?.disposalType===3&&this.restore)ctx.putImageData(this.restore,0,0);
      const next=decompressFrame(this.frames[++this.current],this.gif.gct,true),d=next.dims;
      this.restore=next.disposalType===3?ctx.getImageData(0,0,this.width,this.height):null;
      const patch=createSurface();patch.width=d.width;patch.height=d.height;const pctx=patch.getContext('2d')!,image=pctx.createImageData(d.width,d.height);
      image.data.set(next.patch);pctx.putImageData(image,0,0);ctx.drawImage(patch,d.left,d.top);this.previous=next;
    }
    const result=createSurface();result.width=this.width;result.height=this.height;result.getContext('2d')!.drawImage(this.surface,0,0);markImmutableEffectSource(result);
    this.snapshots.set(index,result);this.bytes+=this.width*this.height*4;
    while(this.bytes>24*1024*1024&&this.snapshots.size>1){const key=this.snapshots.keys().next().value!;this.snapshots.delete(key);this.bytes-=this.width*this.height*4;}
    return result;
  }
}
export async function loadRasterMedia(url:string,name:string):Promise<GifSource|HTMLCanvasElement|null>{
  const extension=name.toLowerCase().split('.').pop();if(extension!=='gif'&&extension!=='tga')return null;
  const response=await fetch(url);if(!response.ok)throw Error(`Cannot read ${name}`);const buffer=await response.arrayBuffer();
  if(extension==='gif')return new GifSource(buffer);
  const decoded=decodeTga(buffer),canvas=createSurface();canvas.width=decoded.width;canvas.height=decoded.height;
  const ctx=canvas.getContext('2d')!,image=ctx.createImageData(decoded.width,decoded.height);image.data.set(decoded.rgba);ctx.putImageData(image,0,0);markImmutableEffectSource(canvas);return canvas;
}

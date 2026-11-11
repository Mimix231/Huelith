import type { MediaKind, VideoAsset } from './timeline';
import { isNativeMediaDesktop } from './native-media';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import {libraryMediaUrl} from './library';
import {loadRasterMedia,GifSource} from './raster-media';

const paths = new Map<string,string>();
const sourcePaths = new Map<string,string>();
const browserFiles = new Map<string,File>();

export function classifyMedia(name:string):MediaKind|null {
  const ext=name.toLowerCase().split('.').pop();
  if (['mp4','mov','m4v','webm','wmv','avi','mkv'].includes(ext??'')) return 'video';
  if (['mp3','wav','m4a','aac','ogg','flac'].includes(ext??'')) return 'audio';
  if (['png','jpg','jpeg','webp','bmp','gif','tga'].includes(ext??'')) return 'image';
  return null;
}
export function registerBrowserFile(assetId:string,file:File):void { browserFiles.set(assetId,file); }
function mimeOf(name:string,kind:MediaKind):string {
  const ext=name.toLowerCase().split('.').pop();
  return ({mp4:'video/mp4',m4v:'video/mp4',mov:'video/quicktime',webm:'video/webm',
    wav:'audio/wav',mp3:'audio/mpeg',m4a:'audio/mp4',aac:'audio/aac',ogg:'audio/ogg',flac:'audio/flac',
    png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',bmp:'image/bmp',gif:'image/gif'} as Record<string,string>)[ext??'']
    ?? (kind==='video'?'video/mp4':kind==='audio'?'audio/mpeg':'image/png');
}
/** Browser-backed media URLs are session-local. Native projects persist paths and reload on open. */
export async function mediaUrl(asset:VideoAsset):Promise<string> {
  if(asset.libraryId)return libraryMediaUrl(asset.libraryId);
  const identity=`${asset.path}:${asset.revision??0}`;
  const existing=paths.get(asset.id);if(existing&&sourcePaths.get(asset.id)===identity)return existing;
  if(existing)forgetMediaUrl(asset.id);
  let blob:Blob;
  const browserFile=browserFiles.get(asset.id);
  if(browserFile) blob=browserFile;
  else {
    if (!isNativeMediaDesktop() || asset.path.startsWith('browser:')) throw Error(`Re-import ${asset.name} to use it in this session.`);
    const canonical=await invoke<string>('media_authorize_source',{path:asset.path});
    const url=`${convertFileSrc(canonical)}?revision=${asset.revision??0}`;paths.set(asset.id,url);sourcePaths.set(asset.id,identity);return url;
  }
  const url=URL.createObjectURL(blob.type?blob:new Blob([blob],{type:mimeOf(asset.name,asset.kind)}));
  paths.set(asset.id,url);sourcePaths.set(asset.id,identity);return url;
}
export async function mediaMetadata(url:string,kind:MediaKind,name=''):Promise<{duration:number;width?:number;height?:number;animated?:boolean;animationDuration?:number}> {
  if(kind==='image'){
    const raster=await loadRasterMedia(url,name);
    if(raster)return {duration:5,width:raster.width,height:raster.height,animated:raster instanceof GifSource,animationDuration:raster instanceof GifSource?raster.duration:undefined};
  }
  if (kind==='image') return new Promise((resolve,reject)=>{
    const image=new Image();image.onload=()=>resolve({duration:5,width:image.naturalWidth,height:image.naturalHeight});
    image.onerror=()=>reject(Error('Cannot decode this image'));image.src=url;
  });
  return new Promise((resolve,reject)=>{
    const element=document.createElement(kind==='video'?'video':'audio');
    let finished=false;
    const done=(err?:Error)=>{if(finished)return;finished=true;clearTimeout(timer);
      const metadata={duration:Number.isFinite(element.duration)?element.duration:0,
        width:kind==='video'?(element as HTMLVideoElement).videoWidth:undefined,
        height:kind==='video'?(element as HTMLVideoElement).videoHeight:undefined};
      element.removeAttribute('src');element.load();if(err)reject(err);else resolve(metadata);};
    element.preload='metadata';element.onloadedmetadata=()=>done();element.onerror=()=>done(Error('This media codec cannot be previewed by the system WebView.'));
    const timer=setTimeout(()=>done(Error('Timed out reading media metadata')),15000);element.src=url;
  });
}
export function forgetMediaUrl(id:string):void {const url=paths.get(id);if(url?.startsWith('blob:'))URL.revokeObjectURL(url);paths.delete(id);sourcePaths.delete(id);browserFiles.delete(id);}
export function clearMediaUrls():void { for(const id of [...paths.keys()])forgetMediaUrl(id);browserFiles.clear(); }

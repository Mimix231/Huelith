import {invoke,convertFileSrc} from '@tauri-apps/api/core';
import {isNativeMediaDesktop} from './native-media';
import type {VideoAsset} from './timeline';
export const VIDEO_LIBRARY_ROOT='/video-library/';
const nativePaths=new Map<string,Promise<string>>();
export function libraryFilePath(id:string):Promise<string>{
  if(!/^[a-z0-9/_\-.]+$/i.test(id)||id.includes('..'))return Promise.reject(Error('Invalid library item'));
  if(!isNativeMediaDesktop())return Promise.resolve(VIDEO_LIBRARY_ROOT+id);
  let path=nativePaths.get(id);if(!path){path=invoke<string>('video_library_file',{file:id});nativePaths.set(id,path);path.catch(()=>nativePaths.delete(id));}return path;
}
export async function libraryMediaUrl(id:string):Promise<string>{
  const path=await libraryFilePath(id);return isNativeMediaDesktop()?convertFileSrc(path):path;
}
export async function resolvedAssetPath(asset:VideoAsset):Promise<string>{return asset.libraryId?libraryFilePath(asset.libraryId):asset.path;}
export const STICKERS=[
  ['black-cat','Black cat','Animals'],['crescent-moon','Lavender moon','Space'],['purple-planet','Cozy planet','Space'],['golden-stars','Golden sparkles','Sparkles'],
  ['purple-ghost','Friendly ghost','Characters'],['paper-airplane','Paper flight','Travel'],['purple-heart','Violet heart','Love'],['origami-butterfly','Origami butterfly','Nature'],
  ['violet-coffee','Cozy coffee','Everyday'],['teal-headphones','Music headphones','Music'],['lightning-bolt','Purple lightning','Sparkles'],['friendly-bat','Little bat','Animals'],
  ['galaxy-potion','Galaxy potion','Magic'],['teal-cloud','Happy cloud','Nature'],['shooting-comet','Shooting comet','Space'],['flower-sprig','Violet flowers','Nature'],
].map(([id,name,category],index)=>({id,name,category,file:'stickers/huelith-sticker-atlas.png',crop:{x:index%4/4,y:Math.floor(index/4)/4,width:.25,height:.25}}));

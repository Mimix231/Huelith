/** Round 9: native D3D11 GPU source ownership for the native scene graph.
 * These calls return timing/format information, NEVER decoded RGBA arrays.
 * The textures themselves live on the Windows native decode worker; future
 * compositor/encoder interop must operate on that worker and synchronize GPU
 * access explicitly. This module is not a WebView frame-transfer path.
 */
import {invoke} from '@tauri-apps/api/core';
import type {GpuFrameGraph} from './render-graph';

export type NativeGpuVideoSource={id:string;path:string};
export type NativeGpuFrameRequest={sourceId:string;timeSeconds:number};
export type NativeGpuFrameInfo={sourceId:string;presentationTime100ns:number;
  width:number;height:number;subresource:number;pixelFormat:string};

const validTime=(value:number)=>Number.isFinite(value)&&value>=0&&value<=21600;
export function nativeGpuVideoSources(graph:GpuFrameGraph):NativeGpuVideoSource[]{
  const identities=new Map<string,NativeGpuVideoSource>();
  for(const layer of graph.layers){
    if(layer.asset?.kind==='video'&&!layer.asset.missing){
      const path=layer.asset.path;
      if(!path)throw Error(`Video clip ${layer.id} is missing its source path`);
      identities.set(layer.identity,{id:layer.identity,path});
    }
  }
  return [...identities.values()];
}
export function nativeGpuFrameRequests(graph:GpuFrameGraph):NativeGpuFrameRequest[]{
  return graph.layers.filter(layer=>layer.asset?.kind==='video'&&!layer.asset.missing)
    .map(layer=>{
      if(!validTime(layer.sourceTime))throw Error(`Invalid native video timestamp for ${layer.id}`);
      return {sourceId:layer.identity,timeSeconds:layer.sourceTime};
    });
}
export async function openNativeGpuVideoSources(sources:NativeGpuVideoSource[]):Promise<void>{
  if(sources.length>24||new Set(sources.map(source=>source.id)).size!==sources.length)
    throw Error('Native GPU source tracks must be unique (maximum 24)');
  await invoke('media_gpu_open_sources',{sources});
}
export async function acquireNativeGpuVideoFrames(requests:NativeGpuFrameRequest[]):Promise<NativeGpuFrameInfo[]>{
  if(requests.length>144||requests.some(request=>!validTime(request.timeSeconds)))
    throw Error('Invalid native GPU source-time request');
  return invoke<NativeGpuFrameInfo[]>('media_gpu_acquire_frames',{requests});
}
export async function closeNativeGpuVideoSources():Promise<void>{
  await invoke('media_gpu_close_sources');
}

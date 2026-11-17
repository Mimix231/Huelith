/** The native side receives the *same authored* graph v1 geometry and source
 * order as WebGPU. Round 8's boundary is available for source-code tests and
 * native compositor parity checks. It is not used in the hot preview/export
 * loop: Round 9 will provide native source GPU textures, not JSON RGBA arrays.
 */
import {invoke} from '@tauri-apps/api/core';
import {gpuLayerGeometry,type GpuFrameGraph,type GpuLayerGeometry} from './render-graph';

export type NativeGpuSource={width:number;height:number;rgba:Uint8Array};
export type NativeGpuLayer={id:string;sourceWidth:number;sourceHeight:number;
  rgba:number[];geometry:GpuLayerGeometry};
export type NativeGpuScene={version:1;width:number;height:number;
  background:[number,number,number,number];layers:NativeGpuLayer[]};

export function buildNativeGpuScene(graph:GpuFrameGraph,images:ReadonlyMap<string,NativeGpuSource>):NativeGpuScene{
  const layers:NativeGpuLayer[]=graph.layers.map(layer=>{
    const frame=images.get(layer.identity);
    if(!frame||frame.width<1||frame.height<1||frame.rgba.byteLength!==frame.width*frame.height*4)
      throw Error(`GPU scene is missing complete RGBA pixels for ${layer.id}`);
    return {id:layer.id,sourceWidth:frame.width,sourceHeight:frame.height,
      rgba:Array.from(frame.rgba),geometry:gpuLayerGeometry(layer,graph.width,graph.height,frame.width,frame.height)};
  });
  return {version:graph.version,width:graph.width,height:graph.height,background:graph.background,layers};
}

/** Explicit parity fixture only. Native frame sources must not cross the
 * WebView IPC boundary frame-by-frame in the production render pipeline. */
export async function renderNativeGpuFixture(scene:NativeGpuScene):Promise<Uint8Array>{
  const bytes=await invoke<number[]>('media_render_gpu_scene',{scene});
  if(bytes.length!==scene.width*scene.height*4)throw Error('Native GPU compositor returned incomplete frame pixels');
  return Uint8Array.from(bytes);
}

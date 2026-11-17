/** Round 8 WebGPU compositor. Draws decoded textures directly to a WebGPU
 * presentation surface; no Canvas2D layer composition or CPU readback.
 * Browser hardware-decoded videos can be imported as GPUExternalTexture.
 * Native D3D11 source surfaces remain within Rust's GPU decode worker until
 * explicit D3D11/D3D12 synchronization is implemented for native exports.
 */
import shader from './composite.wgsl?raw';
import filterShader from './color-filter.wgsl?raw';
import {gpuLayerGeometry,gpuUniformBytes,gpuColorFilter,type GpuFrameGraph,type GpuPreparedScene} from './render-graph';
import {filterLut} from '../filters/render';
import {evaluateVideoEffect} from '../effects/types';
import type {PreviewMediaSources} from '../preview-media-sources';
import {GpuOverlayRasterCache} from './overlay-raster';

// WebGPU TS definitions are not in all DOM libraries shipped with Tauri.
// Isolate this evolving browser API boundary rather than polluting app types.
type GpuApi=any; // eslint-disable-line @typescript-eslint/no-explicit-any
const TEXTURE_BINDING=0x04,COPY_DST=0x02,RENDER_ATTACHMENT=0x10;
const BUFFER_UNIFORM=0x40,BUFFER_COPY_DST=0x08;

export async function prepareGpuScene(graph:GpuFrameGraph,sources:PreviewMediaSources,
  playing:boolean,signal?:AbortSignal,overlays?:GpuOverlayRasterCache,
  designWidth=graph.width):Promise<GpuPreparedScene>{
  const identities=new Set(graph.layers.filter(layer=>layer.kind==='media').map(layer=>layer.identity));
  sources.pauseUnused(identities);
  const layers=[];
  try{
    for(const layer of graph.layers){
      signal?.throwIfAborted();
      const image=layer.kind==='media'
        ?await sources.frameGpu(layer.asset!,layer.sourceTime,
          playing&&layer.playbackRate>0,signal,layer.playbackRate,layer.identity)
        :await (overlays??new GpuOverlayRasterCache()).getProcessed(layer,graph,designWidth,signal);
      signal?.throwIfAborted();
      const sourceWidth=image instanceof HTMLVideoElement?image.videoWidth:
        image instanceof HTMLImageElement?image.naturalWidth:image.width;
      const sourceHeight=image instanceof HTMLVideoElement?image.videoHeight:
        image instanceof HTMLImageElement?image.naturalHeight:image.height;
      layers.push({...layer,image,stableTexture:layer.kind!=='media'||image instanceof HTMLImageElement,
        geometry:gpuLayerGeometry(layer,graph.width,graph.height,sourceWidth,sourceHeight)});
    }
    return {graph,layers};
  }finally{sources.pauseUnused(identities);}
}

/** Separate canvas is intentional: switching to GPU must not invalidate the
 * existing 2D inspector/capture canvas or force WebGPU support on every PC. */
export class WebGpuVideoScene{
  private static owners=new WeakMap<HTMLCanvasElement,symbol>();
  private device:GpuApi;
  private context:GpuApi;
  private pipeline:GpuApi;
  private videoPipeline:GpuApi|null;
  private sampler:GpuApi;
  private disposed=false;
  private frameNumber=0;
  private cubes=new Map<string,GpuApi>();
  private retained=new Map<string,{width:number;height:number;texture:GpuApi|null;
    uniform:GpuApi;bind:GpuApi|null;external:boolean;lastUsed:number;uploadedImage?:object;look:string}>();
  private constructor(private readonly canvas:HTMLCanvasElement,device:GpuApi,context:GpuApi,
    pipeline:GpuApi,videoPipeline:GpuApi|null,sampler:GpuApi,private readonly owner:symbol){
    this.device=device;this.context=context;this.pipeline=pipeline;
    this.videoPipeline=videoPipeline;this.sampler=sampler;
  }
  static async create(canvas:HTMLCanvasElement,onLost?:()=>void):Promise<WebGpuVideoScene|null>{
    const gpu=(navigator as Navigator&{gpu?:GpuApi}).gpu;
    if(!gpu)return null;
    const owner=Symbol('Huelith GPU surface');WebGpuVideoScene.owners.set(canvas,owner);
    const adapter=await gpu.requestAdapter({powerPreference:'high-performance'});
    if(!adapter)return null;
    const device=await adapter.requestDevice();
    if(WebGpuVideoScene.owners.get(canvas)!==owner){device.destroy();return null;}
    const context=canvas.getContext('webgpu') as GpuApi;
    if(!context){device.destroy();return null;}
    const format=gpu.getPreferredCanvasFormat();
    context.configure({device,format,alphaMode:'premultiplied'});
    device.pushErrorScope('validation');
    const materialShader=shader.replace('mask_flags: vec4<f32>,','mask_flags: vec4<f32>,\n    material: vec4<f32>,')
      .replace('let color = textureSample(layer_texture, layer_sampler, uv);',
        'let color = native_filter(textureSample(layer_texture, layer_sampler, uv));')+'\n'+filterShader;
    const bindEntries=[
      {binding:0,visibility:2,texture:{sampleType:'float',viewDimension:'2d'}},
      {binding:1,visibility:2,sampler:{type:'filtering'}},
      {binding:2,visibility:3,buffer:{type:'uniform'}},
      {binding:3,visibility:2,texture:{sampleType:'unfilterable-float',viewDimension:'3d'}},
    ];
    const layout=device.createBindGroupLayout({entries:bindEntries});
    const module=device.createShaderModule({code:materialShader,label:'Huelith composition and float color LUT'});
    const pipeline=device.createRenderPipeline({
      label:'Huelith GPU source-over compositor',layout:device.createPipelineLayout({bindGroupLayouts:[layout]}),
      vertex:{module,entryPoint:'vertex_main'},fragment:{module,entryPoint:'fragment_main',targets:[{
        format,blend:{color:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'},
          alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'}},
      }]},primitive:{topology:'triangle-list'},
    });
    // WebGPU supports sampling decoded video as GPUExternalTexture. This
    // bypasses the extra GPU texture upload from copyExternalImageToTexture.
    // Keep the exact same shared shader geometry, color and blending math;
    // only the texture type and sampler builtin differ for video surfaces.
    let videoPipeline:GpuApi|null=null;
    if(typeof device.importExternalTexture==='function'){
      try{
        const externalShader=materialShader.replace('layer_texture: texture_2d<f32>',
          'layer_texture: texture_external').replace(
          'textureSample(layer_texture, layer_sampler, uv)',
          'textureSampleBaseClampToEdge(layer_texture, layer_sampler, uv)');
        const videoModule=device.createShaderModule({code:externalShader,label:'Huelith native video external texture shader'});
        videoPipeline=device.createRenderPipeline({
          label:'Huelith GPU decoded video compositor',layout:device.createPipelineLayout({bindGroupLayouts:[
            device.createBindGroupLayout({entries:[{binding:0,visibility:2,externalTexture:{}},...bindEntries.slice(1)]}),
          ]}),
          vertex:{module:videoModule,entryPoint:'vertex_main'},
          fragment:{module:videoModule,entryPoint:'fragment_main',targets:[{format,
            blend:{color:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'},
              alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'}},
          }]},primitive:{topology:'triangle-list'},
        });
      }catch{videoPipeline=null;}
    }
    const sampler=device.createSampler({minFilter:'linear',magFilter:'linear',addressModeU:'clamp-to-edge',addressModeV:'clamp-to-edge'});
    const validation=await device.popErrorScope();
    if(validation){
      if(WebGpuVideoScene.owners.get(canvas)===owner)context.unconfigure();
      device.destroy();throw Error(`GPU composition unavailable: ${validation.message}`);
    }
    const renderer=new WebGpuVideoScene(canvas,device,context,pipeline,videoPipeline,sampler,owner);
    if(WebGpuVideoScene.owners.get(canvas)!==owner){renderer.close();return null;}
    // Device loss is asynchronous. A paused video must not stay black until
    // the next user interaction before the editor repaints it.
    void device.lost?.then(()=>{if(!renderer.disposed)onLost?.();});
    return renderer;
  }
  private cube(id:string){
    const old=this.cubes.get(id);if(old)return old;
    const lut=id?filterLut(id):null,size=lut?33:1;
    const data=new Float32Array(size**3*4);
    if(lut)for(let i=0;i<lut.length/3;i++){
      data[i*4]=lut[i*3]/255;data[i*4+1]=lut[i*3+1]/255;data[i*4+2]=lut[i*3+2]/255;data[i*4+3]=1;
    }
    const texture=this.device.createTexture({size:[size,size,size],dimension:'3d',format:'rgba32float',usage:TEXTURE_BINDING|COPY_DST});
    this.device.queue.writeTexture({texture},data,{bytesPerRow:size*16,rowsPerImage:size},[size,size,size]);
    this.cubes.set(id,texture);return texture;
  }
  render(scene:GpuPreparedScene):void{
    if(this.disposed)throw Error('GPU video compositor is closed.');
    const {width,height,background}=scene.graph;
    if(this.canvas.width!==width)this.canvas.width=width;
    if(this.canvas.height!==height)this.canvas.height=height;
    const dev=this.device;
    const encoder=dev.createCommandEncoder({label:'Huelith GPU frame'});
    const output=this.context.getCurrentTexture().createView();
    const frameNumber=++this.frameNumber;
    const pass=encoder.beginRenderPass({colorAttachments:[{
      view:output,clearValue:{r:background[0],g:background[1],b:background[2],a:background[3]},
      loadOp:'clear',storeOp:'store',
    }]});
    pass.setPipeline(this.pipeline);
    for(const layer of scene.layers){
      const img=layer.image;
      const w=img instanceof HTMLVideoElement?img.videoWidth:img instanceof HTMLImageElement?img.naturalWidth:img.width;
      const h=img instanceof HTMLVideoElement?img.videoHeight:img instanceof HTMLImageElement?img.naturalHeight:img.height;
      const external=this.videoPipeline!==null&&img instanceof HTMLVideoElement;
      const effect=layer.kind==='media'?gpuColorFilter(layer.clip):undefined;
      const look=effect?.parameters?.lookId??'';
      const cube=this.cube(look);
      const old=this.retained.get(layer.identity);
      if(old&&(old.width!==w||old.height!==h||old.external!==external||old.look!==look)){
        old.texture?.destroy();old.uniform.destroy();this.retained.delete(layer.identity);
      }
      let entry=this.retained.get(layer.identity);
      if(!entry){
        const texture=external?null:dev.createTexture({size:[w,h,1],format:'rgba8unorm',
          usage:TEXTURE_BINDING|COPY_DST|RENDER_ATTACHMENT,label:`Huelith source ${layer.id}`});
        const uniform=dev.createBuffer({size:96,usage:BUFFER_UNIFORM|BUFFER_COPY_DST});
        const bind=texture?dev.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries:[
          {binding:0,resource:texture.createView()},{binding:1,resource:this.sampler},
          {binding:2,resource:{buffer:uniform}},
          {binding:3,resource:cube.createView({dimension:'3d'})},
        ]}):null;
        entry={width:w,height:h,texture,uniform,bind,external,lastUsed:frameNumber,look};
        this.retained.set(layer.identity,entry);
      }
      entry.lastUsed=frameNumber;
      const parameters=new Float32Array(24);parameters.set(gpuUniformBytes(layer.geometry));
      parameters[20]=effect?Math.max(0,Math.min(1,evaluateVideoEffect(effect,layer.localTime).amount/100)):0;
      dev.queue.writeBuffer(entry.uniform,0,parameters);
      if(external){
        // External video textures expire after use. Reimport each decoded
        // frame, but reuse its transform/material buffer and avoid RGBA copy.
        const videoTexture=dev.importExternalTexture({source:img,colorSpace:'srgb'});
        const bind=dev.createBindGroup({layout:this.videoPipeline!.getBindGroupLayout(0),entries:[
          {binding:0,resource:videoTexture},{binding:1,resource:this.sampler},
          {binding:2,resource:{buffer:entry.uniform}},
          {binding:3,resource:cube.createView({dimension:'3d'})},
        ]});
        pass.setPipeline(this.videoPipeline);pass.setBindGroup(0,bind);
      }else{
        // Static typography and still-image textures are retained across
        // frames; reupload only when a new raster replaces the old object.
        // Dynamic Canvas/GIF sources still upload every frame.
        if(!layer.stableTexture||entry.uploadedImage!==img){
          dev.queue.copyExternalImageToTexture({source:img,flipY:false},
            {texture:entry.texture!,premultipliedAlpha:false},[w,h]);
          entry.uploadedImage=layer.stableTexture?img:undefined;
        }
        pass.setPipeline(this.pipeline);pass.setBindGroup(0,entry.bind);
      }
      pass.draw(6,1,0,0);
    }
    pass.end();
    dev.queue.submit([encoder.finish()]);
    // The submitted commands retain their resources until GPU completion.
    // Keep commonly used footage on the GPU without an unbounded texture pool.
    if(this.retained.size>24){
      const idle=[...this.retained].filter(([,entry])=>entry.lastUsed!==frameNumber);
      idle.sort((a,b)=>a[1].lastUsed-b[1].lastUsed);
      for(const [id,entry] of idle){
        if(this.retained.size<=24)break;
        entry.texture?.destroy();entry.uniform.destroy();this.retained.delete(id);
      }
    }
    if(this.cubes.size>9){
      const active=new Set(scene.layers.map(layer=>gpuColorFilter(layer.clip)?.parameters?.lookId??''));
      for(const [id,cube] of this.cubes)if(!active.has(id)){cube.destroy();this.cubes.delete(id);}
    }
  }
  close(){
    if(this.disposed)return;this.disposed=true;
    for(const entry of this.retained.values()){entry.texture?.destroy();entry.uniform.destroy();}
    this.retained.clear();
    for(const cube of this.cubes.values())cube.destroy();this.cubes.clear();
    if(WebGpuVideoScene.owners.get(this.canvas)===this.owner){
      this.context.unconfigure();WebGpuVideoScene.owners.delete(this.canvas);
    }
    this.device.destroy();
  }
}

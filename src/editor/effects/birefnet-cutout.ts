/** Offline full BiRefNet (FP32) segmentation adapter for the existing Cutout workspace.
 * No silent color-distance fallback is used: missing or failed AI inference is
 * an explicit error, and the original image layer is never modified here.
 * Model files must be prepared separately for the redistributable installer.
 */
import {clampPredictedMatte} from './birefnet-matte';

let sessionPromise:Promise<{model:any;processor:any;RawImage:any}>|undefined;
const MODEL='birefnet';
export async function runBirefnetCutout(image:HTMLImageElement,
  status:(text:string)=>void=()=>{}):Promise<Uint8ClampedArray>{
  const width=image.naturalWidth,height=image.naturalHeight;
  if(!width||!height||width*height>64_000_000)throw Error('BiRefNet supports images up to 64 megapixels.');
  status('Checking bundled full BiRefNet model');
  // A missing JSON asset in a Vite/Tauri SPA can return index.html with 200.
  // Inspect the payload before Transformers.js tries to JSON.parse('<!doctype').
  const configURL=`/models/${MODEL}/config.json`;
  let configResponse:Response;
  try{configResponse=await fetch(configURL,{cache:'no-store'});}catch{
    throw Error('Cannot access bundled BiRefNet configuration. Manual Cutout is still available.');
  }
  if(!configResponse.ok)throw Error(`BiRefNet configuration missing (${configResponse.status}). Check the model resource setup in BIREFNET-README.md.`);
  const rawConfig=await configResponse.text();
  if(!rawConfig.trimStart().startsWith('{'))
    throw Error('BiRefNet config.json was replaced by an HTML page. Check the Vite/Tauri model resource path; do not parse it as JSON.');
  let config: {model_type?:string};
  try{config=JSON.parse(rawConfig) as {model_type?:string};}
  catch{throw Error('BiRefNet config.json contains invalid JSON. Restore the published model configuration.');}
  if(config.model_type!=='birefnet')throw Error('The bundled config is not for full BiRefNet.');
  if(!sessionPromise){
    sessionPromise=(async()=>{
      const {AutoModel,AutoProcessor,RawImage,env}=await import('@huggingface/transformers');
      env.allowRemoteModels=false;
      env.allowLocalModels=true;
      env.localModelPath='/models/';
      const wasmBackend=env.backends.onnx.wasm;
      if(wasmBackend)wasmBackend.wasmPaths='/models/runtime/';
      status('Initializing full-resolution BiRefNet model');
      // Try accelerated inference where supported; keep a real WASM fallback.
      let model;
      try{
        if(!('gpu' in navigator))throw Error('WebGPU is unavailable');
        model=await AutoModel.from_pretrained(MODEL,{dtype:'fp32',device:'webgpu',local_files_only:true});
      }catch{
        model=await AutoModel.from_pretrained(MODEL,{dtype:'fp32',device:'wasm',local_files_only:true});
      }
      const processor=await AutoProcessor.from_pretrained(MODEL,{local_files_only:true});
      return {model,processor,RawImage};
    })().catch(error=>{sessionPromise=undefined;throw error;});
  }
  const {model,processor,RawImage}=await sessionPromise;
  const source=document.createElement('canvas');source.width=width;source.height=height;
  const context=source.getContext('2d',{willReadFrequently:true});
  if(!context)throw Error('Canvas pixels unavailable for segmentation.');
  context.drawImage(image,0,0);
  const original=context.getImageData(0,0,width,height).data;
  status('Segmenting subject locally');
  const raw=RawImage.fromCanvas(source);
  const {pixel_values}=await processor(raw);
  const output=await model({input_image:pixel_values});
  const tensor=output?.output_image?.[0];
  if(!tensor)throw Error('BiRefNet returned no alpha matte.');
  const matte=await RawImage.fromTensor(tensor.sigmoid().mul(255).to('uint8')).resize(width,height);
  const channels=matte.channels||1;
  const mono=new Uint8ClampedArray(width*height);
  if(matte.data.length<mono.length*channels)throw Error('Invalid BiRefNet output dimensions.');
  for(let p=0;p<mono.length;p++)mono[p]=matte.data[p*channels];
  status('Preparing editable alpha mask');
  return clampPredictedMatte(mono,original,width,height);
}

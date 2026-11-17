/** Static overlay effects use the actual video processors off the UI thread. */
import {createSurface} from '../../canvas-surface';
import {renderLayerOutline} from '../effects/layer-outline';
import {EFFECT_PARAMETER_SCHEMA} from '../../effect-schema';
import type {Effect} from '../../types';
import type {VideoEffect,VideoFrameContext} from '../effects/types';
import type {VideoClip} from '../timeline';
const scope=self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage=async(event:MessageEvent<{id:number;bitmap:ImageBitmap;effects:VideoEffect[];
  context:Pick<VideoFrameContext,'timestamp'|'sourceTime'|'frameIndex'|'fps'|'referenceWidth'>;grade?:VideoClip['grade']}>)=>{
  const {id,bitmap,effects,context,grade}=event.data;
  try{
    const source=createSurface();source.width=bitmap.width;source.height=bitmap.height;
    source.getContext('2d')!.drawImage(bitmap,0,0);bitmap.close();
    const enabled=effects.filter(e=>e.enabled);
    let rendered=source;
    if(!grade&&enabled.every(e=>e.kind==='outline'&&!e.mask&&!e.keyframes?.length)){
      // The common caption path loads only its real, dedicated processor.
      // Use the same schema-driven pixel scaling as processVideoEffects;
      // do not load hundreds of unrelated processors before the first title.
      for(const effect of enabled){
        const reference=effect.referenceWidth??context.referenceWidth??source.width;
        const scale=source.width/reference;
        const parameters={...effect.parameters} as Record<string,unknown>;
        for(const control of EFFECT_PARAMETER_SCHEMA.outline??[]){
          if(control.unit==='px'&&typeof parameters[control.key]==='number')
            parameters[control.key]=(parameters[control.key] as number)*scale;
        }
        rendered=renderLayerOutline(rendered,{...effect,kind:'outline',amount:effect.amount*scale,
          parameters:parameters as Effect['parameters']});
      }
    }else{
      const {processVideoEffects}=await import('../process-effects');
      rendered=await processVideoEffects(source,effects,{...context,grade});
    }
    const result=await createImageBitmap(rendered);
    scope.postMessage({id,bitmap:result},[result]);
  }catch(error){bitmap.close();scope.postMessage({id,error:String(error)});}
};

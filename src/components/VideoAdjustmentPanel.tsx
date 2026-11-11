import {useRef} from 'react';
import {createVideoEffect,VIDEO_EFFECT_LOOKUP} from '../editor/video/effects/catalog';
import type {VideoEffect} from '../editor/video/effects/types';
const ADJUSTMENTS=[['brightness',100],['contrast',100],['saturate',100],['exposure',0],['highlights',0],['shadows',0],['whites',0],['blacks',0],['temperature',0],['tint',0],['vibrance',0],['gamma',100],['sharpen',0]] as const;
type Props={effects:VideoEffect[];disabled:boolean;onChange:(effects:VideoEffect[],preview?:boolean)=>void;onCommit:()=>void};
export default function VideoAdjustmentPanel(props:Props){
  const live=useRef(props.effects);live.current=props.effects;
  return <fieldset className="hv-tool-panel hv-adjustments" disabled={props.disabled}><h3>Adjustment</h3>
    <p>Select a visual clip. Every control updates its non-destructive effect stack as you drag.</p>
    {ADJUSTMENTS.map(([kind,neutral])=>{const descriptor=VIDEO_EFFECT_LOOKUP.get(kind);if(!descriptor)return null;
      const effect=props.effects.find(e=>e.id===`adjust:${kind}`),value=effect?.amount??neutral;
      return <label className="hv-field hv-slider-label" key={kind}>{descriptor.label}<b>{Math.round(value)}{descriptor.unit}</b><input type="range" aria-label={`Adjust ${descriptor.label}`} min={descriptor.min} max={descriptor.max} step={descriptor.step} value={value}
        onChange={e=>{const amount=+e.target.value,old=live.current.find(f=>f.id===`adjust:${kind}`),next={...(old??createVideoEffect(kind)),id:`adjust:${kind}`,amount,enabled:amount!==neutral};
          live.current=old?live.current.map(f=>f.id===next.id?next:f):[...live.current,next];props.onChange(live.current,true);}}
        onPointerUp={props.onCommit} onPointerCancel={props.onCommit} onBlur={props.onCommit} onKeyUp={props.onCommit}/></label>;
    })}<button onClick={()=>props.onChange(live.current.filter(e=>!e.id.startsWith('adjust:')))}>Reset adjustments</button>
  </fieldset>;
}

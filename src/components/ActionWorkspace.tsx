import { useEffect, useState } from 'react';
import type { Document, Layer, SelectionRect } from '../editor/types';
import {shapeBounds} from '../editor/geometry';
import type { DocumentAction, ResampleMode } from '../editor/document-actions';
import { validDimensions, cropRect } from '../editor/document-actions';
import './ActionWorkspace.css';

export type ActionWorkspaceMode = 'resize-image' | 'resize-canvas' | 'crop' | 'transform';
export interface LayerTransform { x:number;y:number;width:number;height:number;rotation:number; }
const titles:Record<ActionWorkspaceMode,string>={
  'resize-image':'Resize Image','resize-canvas':'Resize Canvas',crop:'Crop Canvas',transform:'Precision Transform',
};
const layerSize=(layer:Layer,doc:Document,selectedShapeId:string|null):LayerTransform=>{
  if(layer.type==='raster')return{x:layer.x,y:layer.y,width:(layer.imageWidth??doc.width)*(layer.scaleX??1),height:(layer.imageHeight??doc.height)*(layer.scaleY??1),rotation:layer.rotation??0};
  if(layer.type==='gradient')return{x:layer.x+layer.gradient.x,y:layer.y+layer.gradient.y,width:layer.gradient.width,height:layer.gradient.height,rotation:layer.gradient.rotation??0};
  if(layer.type==='vector'){const s=layer.shapes.find(item=>item.id===selectedShapeId)??(layer.shapes.length===1?layer.shapes[0]:null);if(s){const b=shapeBounds(s,{x:layer.x,y:layer.y});return{x:b.x,y:b.y,width:b.width,height:b.height,rotation:s.rotation??0};}}
  return{x:layer.x,y:layer.y,width:doc.width,height:doc.height,rotation:0};
};
interface Props {
  mode:ActionWorkspaceMode;doc:Document;layer:Layer|null;selectedShapeId:string|null;selection:SelectionRect|null;busy:boolean;
  onClose:()=>void;onDocument:(action:DocumentAction,resample:ResampleMode)=>void;
  onTransform:(transform:LayerTransform)=>void;
}
export default function ActionWorkspace({mode,doc,layer,selectedShapeId,selection,busy,onClose,onDocument,onTransform}:Props){
  const initial=mode==='transform'&&layer?layerSize(layer,doc,selectedShapeId):{x:0,y:0,width:doc.width,height:doc.height,rotation:0};
  const crop=selection?cropRect(selection,doc.width,doc.height):{x:0,y:0,width:doc.width,height:doc.height};
  const [w,setW]=useState(mode==='crop'?crop.width:initial.width),[h,setH]=useState(mode==='crop'?crop.height:initial.height);
  const [x,setX]=useState(mode==='crop'?crop.x:initial.x),[y,setY]=useState(mode==='crop'?crop.y:initial.y);
  const [rotation,setRotation]=useState(initial.rotation),[locked,setLocked]=useState(true);
  const [resample,setResample]=useState<ResampleMode>('smooth'),[anchor,setAnchor]=useState<[number,number]>([.5,.5]);
  const ratio=initial.width/Math.max(1,initial.height);
  useEffect(()=>{
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();onClose();}};
    window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);
  },[onClose]);
  const adjust=(dimension:'w'|'h',value:number)=>{
    if(dimension==='w'){setW(value);if(locked)setH(Math.max(1,Math.round(value/ratio)));}
    else {setH(value);if(locked)setW(Math.max(1,Math.round(value*ratio)));}
  };
  const numeric=(label:string,value:number,onChange:(value:number)=>void,suffix='px')=><label className="h-action-field">
    <span>{label}</span><div><input type="number" value={Number.isFinite(value)?value:0}
      onChange={event=>onChange(Number(event.target.value))} step={suffix==='°'?'0.1':'1'}/><b>{suffix}</b></div></label>;
  const valid=validDimensions(Math.round(w),Math.round(h))&&(!busy)&&(mode!=='crop'||cropRect({x,y,width:w,height:h},doc.width,doc.height).width>0);
  const confirm=()=>{
    if(!valid)return;
    if(mode==='transform')return onTransform({x,y,width:Math.round(w),height:Math.round(h),rotation});
    if(mode==='crop')return onDocument({kind:'crop',rect:{x,y,width:w,height:h}},resample);
    if(mode==='resize-canvas')return onDocument({kind:'resize-canvas',width:Math.round(w),height:Math.round(h),anchorX:anchor[0],anchorY:anchor[1]},resample);
    onDocument({kind:'resize-image',width:Math.round(w),height:Math.round(h)},resample);
  };
  return <div className="h-action-shroud" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}>
    <section className="h-action-workspace" role="dialog" aria-modal="true" aria-label={titles[mode]}>
      <header className="h-action-head"><div className="h-action-mark">✦</div><div><h2>{titles[mode]}</h2><small>HUELITH / DOCUMENT OPERATIONS</small></div><button aria-label="Close" type="button" onClick={onClose}>×</button></header>
      <div className="h-action-body">
        <div className="h-action-preview"><span className="h-action-kicker">LIVE DIMENSION GUIDE</span>
          <div className="h-action-artboard" style={{aspectRatio:`${Math.min(7,Math.max(.25,w/Math.max(h,1)))}`}}>
            <div className="h-action-cross horizontal"/><div className="h-action-cross vertical"/><span className="h-action-center">+</span>
            <span className="h-action-size">{Math.round(w)} × {Math.round(h)}</span>
          </div><div className="h-action-source">SOURCE <strong>{doc.width} × {doc.height} px</strong> <span>→</span> OUTPUT <strong>{Math.round(w)} × {Math.round(h)} px</strong></div>
        </div>
        <div className="h-action-options"><span className="h-action-kicker">{mode==='transform'?'OBJECT GEOMETRY':'CANVAS GEOMETRY'}</span>
          <div className="h-action-row">{numeric('Width',w,value=>adjust('w',value))}{numeric('Height',h,value=>adjust('h',value))}</div>
          {mode!=='resize-canvas'&&mode!=='crop'&&<button type="button" className={`h-action-lock ${locked?'active':''}`} onClick={()=>setLocked(!locked)}>
            {locked?'◆ Proportions locked':'◇ Independent proportions'}</button>}
          {(mode==='crop'||mode==='transform')&&<><div className="h-action-row">{numeric('Position X',x,setX)}{numeric('Position Y',y,setY)}</div></>}
          {mode==='transform'&&numeric('Angle',rotation,setRotation,'°')}
          {mode==='resize-canvas'&&<div className="h-action-anchor"><span>Position artwork within new canvas</span><div className="h-action-anchorgrid">{Array.from({length:9},(_,i)=>{
            const value:[number,number]=[(i%3)/2,Math.floor(i/3)/2];return <button type="button" key={i} title={`${['Left','Center','Right'][i%3]} / ${['Top','Middle','Bottom'][Math.floor(i/3)]}`}
              className={anchor[0]===value[0]&&anchor[1]===value[1]?'chosen':''} onClick={()=>setAnchor(value)}>+</button>;
          })}</div></div>}
          {mode==='resize-image'&&<label className="h-action-select">Pixel resampling<select value={resample} onChange={event=>setResample(event.target.value as ResampleMode)}>
            <option value="smooth">Smooth — high-quality canvas sampling</option><option value="nearest">Nearest — crisp pixel art</option></select></label>}
          <p className="h-action-note">{mode==='resize-image'?'Resamples raster pixels and alpha masks; scales vectors, gradients, and every animation cel.':
            mode==='resize-canvas'?'Adjusts document boundaries without stretching your artwork. Choose the anchor that stays in place.':
            mode==='crop'?'Non-destructive layer data is retained beyond the cropped canvas until exported. All animation frames share the crop.':
            'Change the selected object numerically. Live canvas handles and alignment guides remain available afterward.'}</p>
        </div>
      </div><footer className="h-action-foot"><span>✦ Pixel-precise · Undoable operation</span><div><button type="button" onClick={onClose} disabled={busy}>Cancel</button><button type="button" className="primary" disabled={!valid} onClick={confirm}>{busy?'Processing…':mode==='transform'?'Apply transform':'Apply to document'}</button></div></footer>
    </section>
  </div>;
}

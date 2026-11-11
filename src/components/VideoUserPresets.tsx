import { useEffect, useMemo, useState } from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from '@mui/material';
import { saveBytes } from '../editor/files';
import type {StartVideoCardDrag} from './useVideoLibraryDrag';
import {
  createPreset, decodePresetPack, deleteUserPreset, encodePresetPack, PRESET_LABELS,
  readUserPresets, saveUserPresets, type PresetKind, type UserVideoPreset,
} from '../editor/video/user-presets';
import {durationOf,type VideoClip,type VideoTimeline} from '../editor/video/timeline';
import {VIDEO_LIBRARY_ROOT} from '../editor/video/library';
import VideoPreviewCanvas from './VideoPreviewCanvas';

type Layout = Extract<UserVideoPreset, { kind:'layout' }>;
type Props = {
  timeline:VideoTimeline; selectedIds:string[]; clip?:VideoClip; locked:boolean;
  onApply:(preset:UserVideoPreset,slots?:Record<string,string>,time?:number)=>void;
  onCardDrag:StartVideoCardDrag;
};

export default function VideoUserPresets({timeline,selectedIds,clip,locked,onApply,onCardDrag}:Props) {
  const [items,setItems]=useState<UserVideoPreset[]>([]);
  const [kind,setKind]=useState<PresetKind|'title-group'>('layout');
  const [name,setName]=useState('');
  const [saving,setSaving]=useState(false);
  const [layout,setLayout]=useState<Layout>();
  const [preview,setPreview]=useState(.35);
  const previewScene=useMemo(()=>layout?.titleGroup?{...layout.scene,assets:[],background:undefined}:undefined,[layout]);
  const [dropTime,setDropTime]=useState<number>();
  const [slots,setSlots]=useState<Record<string,string>>({});
  const [busy,setBusy]=useState(false);
  const [status,setStatus]=useState('');
  const [error,setError]=useState('');
  useEffect(()=>{
    let mounted=true;
    void readUserPresets().then(value=>{if(mounted)setItems(value);}).catch(error=>{if(mounted)setError(String(error));});
    return()=>{mounted=false;};
  },[]);

  async function change(action:()=>Promise<unknown>,message:string) {
    if(busy)return;
    setBusy(true);setError('');setStatus('');
    try{await action();setItems(await readUserPresets());setStatus(message);}
    catch(error){setError(String(error));}
    finally{setBusy(false);}
  }

  async function save() {
    if(!name.trim())return;
    await change(async()=>{
      const preset=createPreset(kind==='title-group'?'layout':kind,name,timeline,selectedIds,clip,kind==='title-group');
      await saveUserPresets([preset]);
      setSaving(false);
    },'Preset saved.');
  }

  function apply(preset:UserVideoPreset,time?:number) {
    setError('');setStatus('');
    try {
      if(preset.kind==='layout'&&(preset.slots.length||preset.titleGroup)) {
        const next:Record<string,string>={};
        for(const slot of preset.slots){
          const choices=timeline.assets.filter(asset=>asset.kind===slot.kind&&(asset.kind==='image'||asset.duration+.02>=slot.minimumDuration));
          next[slot.id]=choices.find(asset=>asset.name===slot.name)?.id??choices[0]?.id??'';
        }
        setSlots(next);setDropTime(time);setPreview(Math.min(.35,durationOf(preset.scene)/2));setLayout(preset);return;
      }
      onApply(preset,{},time);
      setStatus('Preset applied.');
    } catch(error){setError(String(error));}
  }

  function changeTitle(id:string,patch:Partial<VideoClip>){
    setLayout(current=>current&&{...current,scene:{...current.scene,clips:current.scene.clips.map(layer=>layer.id===id?{...layer,...patch}:layer)}});
  }

  return <div className="hv-tool-panel hv-user-presets">
    <h3>My presets</h3>
    <div className="hv-inline-actions">
      <button disabled={!selectedIds.length||busy} onClick={()=>{setName('');setSaving(true);setError('');}}>Save preset</button>
      <button disabled={!items.length||busy} onClick={()=>{
        const bytes=new TextEncoder().encode(encodePresetPack(items));
        void saveBytes(bytes,'Huelith-video-presets.json','application/json',[{name:'Huelith preset pack',extensions:['json']}]).catch(error=>setError(String(error)));
      }}>Export pack</button>
    </div>
    <label className="hv-field">Import preset pack<input type="file" accept=".json" disabled={busy} onChange={event=>{
      const file=event.currentTarget.files?.[0];
      event.currentTarget.value='';
      if(!file)return;
      if(file.size>48*1024*1024){setError('Choose a preset pack under 48 MiB.');return;}
      void change(async()=>saveUserPresets(decodePresetPack(await file.text())),'Preset pack imported.');
    }}/></label>
    {!items.length&&<small>Save selected clips as an editable layout, or save a clip’s effect stack, color, motion or type style.</small>}
    <div className="hv-preset-list">{items.map(item=>{
      const card={kind:'preset' as const,preset:item,...(item.kind==='layout'?{chooseMedia:(time:number)=>apply(item,time)}:{})};
      const canClick=item.kind==='layout'||!!clip&&!locked;
      return <div key={item.id} className={!busy?'hv-draggable-card':undefined}
        onPointerDown={event=>{if(!busy&&!(event.target as Element).closest('button'))onCardDrag(event,card,item.name);}}>
      <span><b>{item.name}</b><small>{item.kind==='layout'&&item.titleGroup?'Layered title':PRESET_LABELS[item.kind]}</small></span>
      <button className="hv-draggable-card" disabled={busy} aria-disabled={!canClick||undefined}
        onPointerDown={event=>onCardDrag(event,card,item.name)} onClick={()=>{if(canClick)apply(item);}}>Apply</button>
      <button disabled={busy} aria-label={`Delete ${item.name} preset`} onClick={()=>void change(()=>deleteUserPreset(item.id),'Preset deleted.')}>×</button>
    </div>;})}</div>
    {status&&<small role="status">{status}</small>}
    {error&&!saving&&!layout&&<small role="alert" className="hv-error">{error}</small>}
    <Dialog open={saving} onClose={()=>{if(!busy)setSaving(false);}} fullWidth maxWidth="xs">
      <DialogTitle>Save a reusable preset</DialogTitle>
      <DialogContent>
        <TextField label="Preset name" autoFocus fullWidth value={name} onChange={event=>setName(event.target.value)}
          slotProps={{htmlInput:{maxLength:120}}} sx={{mt:1,mb:2}}/>
        <label className="hv-field">Preset type<select value={kind} onChange={event=>setKind(event.target.value as typeof kind)}>
          {Object.entries(PRESET_LABELS).map(([value,label])=><option key={value} value={value}>{label}</option>)}
          <option value="title-group">Layered title</option>
        </select></label>
        {kind==='layout'&&<small>Selected clips stay editable and media becomes replaceable slots.</small>}
        {kind==='title-group'&&<small>Save selected title and graphic layers with their motion and timing.</small>}
        {error&&<p role="alert" className="hv-error">{error}</p>}
      </DialogContent>
      <DialogActions><Button disabled={busy} onClick={()=>setSaving(false)}>Cancel</Button><Button disabled={busy||!name.trim()} onClick={()=>void save()}>Save</Button></DialogActions>
    </Dialog>
    <Dialog open={!!layout} onClose={()=>setLayout(undefined)} fullWidth maxWidth="sm">
      <DialogTitle>{layout?.name} · {layout?.titleGroup?'Customize title layers':'Choose media'}</DialogTitle>
      <DialogContent>
        {previewScene&&<><div className="hv-title-template-preview" style={{backgroundImage:`url(${VIDEO_LIBRARY_ROOT}previews/night-run.png)`}}>
          <VideoPreviewCanvas timeline={previewScene} width={640} height={360} fps={30} time={Math.min(preview,Math.max(0,durationOf(previewScene)-1/30))}
            playing={false} transparent onError={setError}/>
        </div><label className="hv-field">Preview time · {preview.toFixed(2)} s
          <input type="range" min={0} max={durationOf(previewScene)} step={1/30} value={preview} onChange={event=>setPreview(event.target.valueAsNumber)}/></label>
          {layout?.scene.clips.map((layer,index)=><fieldset className="hv-inspector-section" key={layer.id}>
            <legend>{layer.shape?'Graphic':'Text'} layer {index+1}</legend>
            {!layer.shape&&<label className="hv-field">Text<textarea value={layer.title??''} maxLength={2000} onChange={event=>changeTitle(layer.id,{title:event.target.value})}/></label>}
            <label className="hv-field hv-effect-color">Color<input type="color" value={layer.shape?.fill??(layer.textStyle?.color?.match(/^#[0-9a-f]{6}$/i)?.[0]??'#ffffff')}
              onChange={event=>changeTitle(layer.id,layer.shape?{shape:{...layer.shape,fill:event.target.value}}:{textStyle:{...layer.textStyle,color:event.target.value}})}/></label>
            <div className="hv-pair">
              <label className="hv-field">Offset (s)<input type="number" min={0} max={21600-layer.duration} step={.01} value={layer.start}
                onChange={event=>{if(Number.isFinite(event.target.valueAsNumber))changeTitle(layer.id,{start:Math.min(21600-layer.duration,Math.max(0,event.target.valueAsNumber))});}}/></label>
              <label className="hv-field">Length (s)<input type="number" min={1/30} max={21600-layer.start} step={.01} value={layer.duration}
                onChange={event=>{
                  if(!Number.isFinite(event.target.valueAsNumber))return;
                  const duration=Math.max(1/30,Math.min(21600-layer.start,event.target.valueAsNumber)),ratio=duration/layer.duration;
                  changeTitle(layer.id,{duration,keyframes:layer.keyframes?.map(key=>({...key,time:key.time*ratio})),
                    fadeIn:layer.fadeIn*ratio,fadeOut:layer.fadeOut*ratio,
                    effects:layer.effects?.map(effect=>({...effect,keyframes:effect.keyframes?.map(key=>({...key,time:key.time*ratio}))})),
                    transitionIn:layer.transitionIn&&{...layer.transitionIn,duration:layer.transitionIn.duration*ratio},
                    transitionOut:layer.transitionOut&&{...layer.transitionOut,duration:layer.transitionOut.duration*ratio}});
                }}/></label>
            </div>
          </fieldset>)}</>}
        {layout?.slots.map(slot=><label className="hv-field" key={slot.id}>
        {slot.name} · {slot.kind}{slot.kind!=='image'?` · at least ${slot.minimumDuration.toFixed(2)} s`:''}
        <select value={slots[slot.id]??''} onChange={event=>setSlots(previous=>({...previous,[slot.id]:event.target.value}))}>
          <option value="">Choose source</option>
          {timeline.assets.filter(asset=>asset.kind===slot.kind&&(asset.kind==='image'||asset.duration+.02>=slot.minimumDuration))
            .map(asset=><option key={asset.id} value={asset.id}>{asset.name}</option>)}
        </select>
      </label>)}{error&&<p role="alert" className="hv-error">{error}</p>}</DialogContent>
      <DialogActions><Button onClick={()=>setLayout(undefined)}>Cancel</Button>
        <Button disabled={!layout||layout.slots.some(slot=>!slots[slot.id])} onClick={()=>{
          if(!layout)return;
          try{onApply(layout,slots,dropTime);setLayout(undefined);setStatus('Layout inserted.');}
          catch(error){setError(String(error));}
        }}>{dropTime===undefined?'Insert at playhead':'Insert at drop position'}</Button></DialogActions>
    </Dialog>
  </div>;
}

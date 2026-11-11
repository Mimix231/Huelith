import {useState} from 'react';
import {Button,Dialog,DialogActions,DialogContent,DialogTitle} from '@mui/material';
import {DEFAULT_STUDIO_LAYOUT,validStudioKey,VIDEO_COMMANDS,type StudioCommand,type StudioPreferences} from '../editor/video/workspace-preferences';

export default function VideoWorkspacePreferences({commands,value,onChange,onRun,onClose,onMonitor}:{
  commands:boolean;value:StudioPreferences;onChange:(value:StudioPreferences)=>void;onRun:(id:StudioCommand)=>void;
  onClose:()=>void;onMonitor?:()=>void;
}){
  const [search,setSearch]=useState(''),[name,setName]=useState(''),[error,setError]=useState('');
  const layout=value.layout;
  return <Dialog open maxWidth="sm" fullWidth onClose={onClose}>
    <DialogTitle>{commands?'Editing commands':'Workspace layout'}</DialogTitle>
    <DialogContent className="hv-editorial">
      {commands?<><label className="hv-field">Find command<input autoFocus type="search" value={search} onChange={event=>setSearch(event.target.value)}/></label>
        {VIDEO_COMMANDS.filter(([,label])=>label.toLowerCase().includes(search.toLowerCase())).map(([id,label])=>
          <div className="hv-mixer-channel" key={id}>
            <span>{label}</span><button onClick={()=>onRun(id)}>Run</button>
            <input aria-label={'Shortcut for '+label} readOnly value={value.keys[id].replace(/^Key|^Digit/,'')} onKeyDown={event=>{
              if(event.key==='Tab'||event.key==='Escape')return;
              event.preventDefault();
              if(event.ctrlKey||event.metaKey||event.altKey||event.shiftKey||!validStudioKey(event.code)){setError('Use an unmodified letter, number or punctuation key.');return;}
              if(VIDEO_COMMANDS.some(([other])=>id!==other&&value.keys[other]===event.code)){setError('That key already has an editing command.');return;}
              setError('');onChange({...value,keys:{...value.keys,[id]:event.code}});
            }}/><small>Press a key</small>
          </div>)}
      </>:<>
        {([['library','Library width',175,500],['inspector','Inspector width',180,460],['timeline','Timeline height',180,700]] as const).map(([key,label,min,max])=>
          <label className="hv-field" key={key}>{label} · {Math.round(layout[key])} px<input type="range" min={min} max={max} value={layout[key]}
            onChange={event=>onChange({...value,layout:{...layout,[key]:event.target.valueAsNumber}})}/></label>)}
        <div className="hv-inline-actions"><button aria-pressed={layout.swap} onClick={()=>onChange({...value,layout:{...layout,swap:!layout.swap}})}>Swap side panels</button>
          <button onClick={()=>onChange({...value,layout:DEFAULT_STUDIO_LAYOUT})}>Reset layout</button>
          {onMonitor&&<button onClick={onMonitor}>Open second monitor player</button>}</div>
        <label className="hv-field">Preview proxy cache limit
          <select value={value.proxyLimitMb} onChange={event=>onChange({...value,proxyLimitMb:Number(event.target.value)})}>
            {[256,512,1024,2048,4096,8192,16384,32768].map(mb=><option key={mb} value={mb}>{mb<1024?mb+' MiB':mb/1024+' GiB'}</option>)}
          </select>
          <small>Cached proxies reopen with the source. Exports use full-resolution media.</small>
        </label>
        <div className="hv-inline-actions"><input aria-label="Layout preset name" value={name} maxLength={42} onChange={event=>setName(event.target.value)}/>
          <button disabled={!name.trim()||value.presets.length>=12&&!value.presets.some(item=>item.name===name.trim())} onClick={()=>{
            const key=name.trim();onChange({...value,presets:[...value.presets.filter(item=>item.name!==key),{name:key,layout}]});setName('');
          }}>Save layout</button></div>
        {value.presets.map(preset=><div className="hv-inline-actions" key={preset.name}><button onClick={()=>onChange({...value,layout:preset.layout})}>{preset.name}</button>
          <button aria-label={'Remove layout '+preset.name} onClick={()=>onChange({...value,presets:value.presets.filter(item=>item!==preset)})}>×</button></div>)}
      </>}
      {error&&<p role="alert">{error}</p>}
    </DialogContent><DialogActions><Button onClick={onClose}>Close</Button></DialogActions>
  </Dialog>;
}

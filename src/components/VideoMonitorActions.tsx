import {ExpandMore,Fullscreen,MonitorOutlined,PhotoCameraOutlined,VolumeOff,VolumeUp} from '@mui/icons-material';
import './VideoVelocity.css';

type Props={
  aspect:string;settingsOpen:boolean;onSettings:()=>void;
  saving:boolean;canSave:boolean;onSaveFrame:()=>void;
  muted:boolean;onMute:()=>void;onFullscreen:()=>void;
};

/** Small, accessible monitor actions. Huelith's existing VideoStudioHints
 * positions tooltips BELOW the buttons using data-hint. */
export default function VideoMonitorActions(props:Props){
  return <div className="hv-player-display hv-velocity-monitor-actions" role="toolbar" aria-label="Preview tools">
    <button type="button" className="hv-velocity-icon-button hv-aspect-button"
      aria-label={`Monitor settings · ${props.aspect}`} data-hint={`Monitor settings · ${props.aspect}`}
      aria-expanded={props.settingsOpen} aria-pressed={props.settingsOpen} onClick={props.onSettings}>
      <MonitorOutlined/><span className="hv-velocity-aspect">{props.aspect}</span><ExpandMore className="hv-velocity-chevron"/>
    </button>
    <button type="button" className="hv-velocity-icon-button hv-save-frame"
      aria-label="Save playhead frame as PNG" data-hint="Save frame as PNG · current playhead"
      disabled={props.saving||!props.canSave} aria-busy={props.saving} onClick={props.onSaveFrame}>
      <PhotoCameraOutlined/><span className="hv-velocity-sr-only">{props.saving?'Saving PNG frame':'Save frame PNG'}</span>
    </button>
    <button type="button" className="hv-velocity-icon-button"
      aria-label={props.muted?'Unmute preview':'Mute preview'} data-hint={props.muted?'Unmute preview':'Mute preview'}
      aria-pressed={props.muted} onClick={props.onMute}>
      {props.muted?<VolumeOff/>:<VolumeUp/>}
    </button>
    <button type="button" className="hv-velocity-icon-button"
      aria-label="Toggle fullscreen preview" data-hint="Fullscreen preview" onClick={props.onFullscreen}>
      <Fullscreen/>
    </button>
  </div>;
}

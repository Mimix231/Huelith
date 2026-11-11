//! A bounded producer/consumer export session. All COM work lives on its worker.
use super::{check_dimensions, validate_output_path, validate_source_file, ExportReport};
use serde::Deserialize;
use std::{collections::HashMap, sync::{Arc, Mutex, atomic::{AtomicBool, AtomicU64, Ordering}, mpsc::{self, SyncSender, Sender}}, time::Duration};

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all="camelCase")]
pub struct AudioSource {
    pub path:String, pub start:f64, pub source_in:f64, pub duration:f64,
    pub volume:f64, pub fade_in:f64, pub fade_out:f64,
    #[serde(default)] pub pan:f64,
    #[serde(default)] pub required:bool,
    #[serde(default)] pub track_id:Option<String>,
    #[serde(default)] pub source_map:Vec<SourceKey>,
    #[serde(default)] pub gain_layers:Vec<GainLayer>,
    #[serde(default)] pub channel_mode:ChannelMode,
    #[serde(default)] pub voice:Option<VoiceTreatment>,
    #[serde(default)] pub voice_offset:f64,
}

#[derive(Debug,Clone,Copy,Default,Deserialize)]
#[serde(rename_all="lowercase")]
pub enum ChannelMode { #[default] Stereo, Left, Right, Mono }

#[derive(Debug,Clone,Copy,Deserialize)]
#[serde(rename_all="lowercase")]
pub enum VoiceMode { Radio, Warm, Robot, Cleanup }

#[derive(Debug,Clone,Deserialize)]
pub struct VoiceTreatment {
    pub mode:VoiceMode,
    mix:f64,
    #[serde(default)] keys:Vec<GainKey>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SourceKey { pub time:f64, pub source:f64 }
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all="camelCase")]
pub struct GainKey {
    time:f64, value:f64,
    easing:Option<KeyEasing>, ease_range:Option<[f64;2]>, curve:Option<[f64;4]>,
}
#[derive(Debug,Clone,Copy,Deserialize)]
#[serde(rename_all="kebab-case")]
enum KeyEasing { Linear, EaseIn, EaseOut, EaseInOut, Hold }
#[derive(Debug, Clone, Deserialize)]
struct DuckRange { start:f64, end:f64, amount:f64, attack:f64, release:f64 }
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all="camelCase")]
pub struct GainLayer {
    offset:f64, duration:f64, volume:f64, fade_in:f64, fade_out:f64,
    #[serde(default="unity")] bus_gain:f64,
    #[serde(default)] keys:Vec<GainKey>,
    #[serde(default)] pan:f64,
    #[serde(default)] pan_keys:Vec<GainKey>,
    #[serde(default)] duck:Vec<DuckRange>,
}
fn unity()->f64{1.}

impl GainKey {
    fn ease(&self,progress:f64)->f64 {
        if let Some([x1,y1,x2,y2])=self.curve {
            if !(0.<progress && progress<1.) {return progress;}
            let cubic=|t:f64,a:f64,b:f64|3.*(1.-t).powi(2)*t*a+3.*(1.-t)*t*t*b+t.powi(3);
            let (mut left,mut right)=(0.,1.);
            for _ in 0..18 {
                let t=(left+right)/2.;
                if cubic(t,x1,x2)<progress {left=t;} else {right=t;}
            }
            return cubic((left+right)/2.,y1,y2);
        }
        match self.easing.unwrap_or(KeyEasing::Linear) {
            KeyEasing::Linear=>progress,
            KeyEasing::EaseIn=>progress*progress,
            KeyEasing::EaseOut=>progress*(2.-progress),
            KeyEasing::EaseInOut=>progress*progress*(3.-2.*progress),
            KeyEasing::Hold=>if progress==1. {1.} else {0.},
        }
    }

    fn progress(&self,progress:f64)->f64 {
        if progress<=0.||progress>=1. {return progress;}
        let [start,end]=self.ease_range.unwrap_or([0.,1.]);
        let (a,b)=(self.ease(start),self.ease(end));
        if b>a {(self.ease(start+(end-start)*progress)-a)/(b-a)} else {progress}
    }
}

fn key_value(keys:&[GainKey],time:f64,fallback:f64)->f64 {
    match keys.partition_point(|key|key.time<=time) {
        0=>keys.first().map(|key|key.value).unwrap_or(fallback),
        end if end==keys.len()=>keys[end-1].value,
        index=>{
            let (a,b)=(&keys[index-1],&keys[index]);
            a.value+(b.value-a.value)*a.progress((time-a.time)/(b.time-a.time))
        }
    }
}

fn valid_keys(keys:&[GainKey],min:f64,max:f64)->bool {
    keys.len()<=4096 && keys.iter().all(|key|key.time.is_finite()&&key.time>=0.&&(min..=max).contains(&key.value)
        && key.curve.is_none_or(|curve|curve.iter().all(|value|(0. ..=1.).contains(value)))
        && key.ease_range.is_none_or(|[start,end]|start>=0.&&end<=1.&&start<end))
        && keys.windows(2).all(|pair|pair[0].time<pair[1].time)
}

fn fades(time:f64,duration:f64,fade_in:f64,fade_out:f64)->f64 {
    let enter=if fade_in>0. { time/fade_in } else { 1. };
    let leave=if fade_out>0. { (duration-time)/fade_out } else { 1. };
    enter.min(leave).clamp(0.,1.)
}

impl AudioSource {
    pub(super) fn pan_at(&self,local:f64)->f64 {
        self.gain_layers.iter().fold(self.pan,|pan,layer|pan+key_value(&layer.pan_keys,local+layer.offset,layer.pan)).clamp(-1.,1.)
    }

    pub(super) fn voice_mix_at(&self,local:f64)->f64 {
        self.voice.as_ref().map_or(0.,|voice|key_value(&voice.keys,local+self.voice_offset,voice.mix))
    }

    pub(super) fn position_at(&self, local:f64)->f64 {
        if self.source_map.is_empty() { return self.source_in+local; }
        let right=self.source_map.partition_point(|key|key.time<=local).clamp(1,self.source_map.len()-1);
        let (a,b)=(&self.source_map[right-1],&self.source_map[right]);
        a.source+(b.source-a.source)*(local-a.time)/(b.time-a.time)
    }

    pub(super) fn gain_at(&self,local:f64)->f64 {
        let mut gain=self.volume*fades(local,self.duration,self.fade_in,self.fade_out);
        for layer in &self.gain_layers {
            let t=local+layer.offset;
            let volume=key_value(&layer.keys,t,layer.volume);
            let mut reduction=0_f64;
            for range in &layer.duck {
                if t<range.start-range.attack || t>range.end+range.release { continue; }
                let ramp=if t<range.start { (t-range.start+range.attack)/range.attack }
                    else if t>range.end { (range.end+range.release-t)/range.release } else { 1. };
                reduction=reduction.max(ramp*range.amount);
            }
            gain*=layer.bus_gain*volume*fades(t,layer.duration,layer.fade_in,layer.fade_out)*(1.-reduction);
        }
        gain
    }

    fn valid_automation(&self)->bool {
        let finite=|values:&[f64]|values.iter().all(|value|value.is_finite());
        if !self.voice_offset.is_finite() || self.voice_offset<0. || self.voice.as_ref().is_some_and(|voice|
            !(0. ..=1.).contains(&voice.mix)||!valid_keys(&voice.keys,0.,1.)) {return false;}
        if !self.source_map.is_empty() && (self.source_map.len()<2 || self.source_map.len()>4096
            || self.source_map[0].time!=0. || (self.source_map[0].source-self.source_in).abs()>0.001
            || self.source_map.iter().any(|key|!finite(&[key.time,key.source])||key.source<0.)
            || self.source_map.windows(2).any(|pair|pair[1].time<=pair[0].time || pair[1].source<=pair[0].source
                || (pair[1].source-pair[0].source)/(pair[1].time-pair[0].time)>16.01)) { return false; }
        self.gain_layers.len()<=7 && self.gain_layers.iter().all(|layer|{
            finite(&[layer.offset,layer.duration,layer.volume,layer.fade_in,layer.fade_out,layer.bus_gain])
                && layer.offset>=0. && layer.duration>0. && (0. ..=2.).contains(&layer.volume)
                && (0. ..=2.).contains(&layer.bus_gain)
                && (0. ..=layer.duration).contains(&layer.fade_in) && (0. ..=layer.duration).contains(&layer.fade_out)
                && valid_keys(&layer.keys,0.,2.) && (-1. ..=1.).contains(&layer.pan) && valid_keys(&layer.pan_keys,-1.,1.)
                && layer.duck.len()<=4096 && layer.duck.iter().all(|range|{
                    finite(&[range.start,range.end,range.amount,range.attack,range.release]) && range.start<range.end
                        && (0. ..=1.).contains(&range.amount) && (0. ..=10.).contains(&range.attack) && (0. ..=10.).contains(&range.release)
                })
        })
    }
}
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all="camelCase")]
pub struct StreamConfig {
    pub output_path:String, pub width:u32, pub height:u32, pub fps:u32, pub frame_count:u32,
    #[serde(default)] pub bitrate:Option<u32>,
    #[serde(default)] pub audio:Vec<AudioSource>,
}
pub(super) enum ExportPacket {
    Frame {index:u32,rgba:Vec<u8>,ack:Sender<Result<(),String>>},
    Finish(Sender<Result<ExportReport,String>>),
    Cancel,
}
struct Session { sender:SyncSender<ExportPacket>, cancelled:Arc<AtomicBool>, finished:Arc<AtomicBool>, frame_bytes:usize }
#[derive(Default)]
pub struct MediaExportSessions(Mutex<HashMap<u64,Arc<Session>>>);
static NEXT_SESSION:AtomicU64=AtomicU64::new(1);

pub(super) fn validate_stream(config:&mut StreamConfig)->Result<(),String>{
    check_dimensions(config.width,config.height,config.fps,1)?;
    if config.frame_count==0 || u64::from(config.frame_count)>6*3600*u64::from(config.fps) {
        return Err("Export duration must be greater than zero and at most six hours".into());
    }
    if config.bitrate.is_some_and(|n|!(500_000..=100_000_000).contains(&n)) {return Err("Video bitrate must be 0.5..100 Mbps".into());}
    validate_audio_sources(&mut config.audio)
}
pub(super) fn validate_audio_sources(audio:&mut [AudioSource])->Result<(),String>{
    if audio.len()>4096 {return Err("At most 4096 audible clips can be mixed at once".into());}
    for source in audio {
        if ![source.start,source.source_in,source.duration,source.volume,source.fade_in,source.fade_out].iter().all(|n|n.is_finite())
            ||source.start<0.||source.source_in<0.||source.duration<=0.||source.duration>21600.||!(0.0..=2.0).contains(&source.volume)
            ||source.fade_in<0.||source.fade_out<0.||source.fade_in>source.duration||source.fade_out>source.duration||!(-1. ..=1.).contains(&source.pan)
            ||source.track_id.as_ref().is_some_and(|id|id.len()>128)||!source.valid_automation() {
            return Err("Invalid audio clip timing, volume or fades".into());
        }
        source.path=validate_source_file(&source.path)?.to_string_lossy().into_owned();
    }
    Ok(())
}
fn session(state:&MediaExportSessions,id:u64)->Result<Arc<Session>,String>{
    state.0.lock().map_err(|_|"Export registry unavailable")?.get(&id).cloned().ok_or("Export session is closed".into())
}
#[tauri::command]
pub async fn media_begin_export(mut config:StreamConfig,state:tauri::State<'_,MediaExportSessions>)->Result<u64,String>{
    validate_stream(&mut config)?;
    #[cfg(windows)]
    let alternate=std::path::Path::new(&config.output_path).extension().is_some_and(|ext|
        ext.eq_ignore_ascii_case("webm")||ext.eq_ignore_ascii_case("wav"));
    #[cfg(windows)]
    let output=if alternate{super::delivery::destination(&config.output_path)?}else{validate_output_path(None,&config.output_path)?};
    #[cfg(not(windows))]
    let output=validate_output_path(None,&config.output_path)?;
    let id=NEXT_SESSION.fetch_add(1,Ordering::Relaxed);
    let frame_bytes=config.width as usize*config.height as usize*4;
    let cancelled=Arc::new(AtomicBool::new(false));
    let finished=Arc::new(AtomicBool::new(false));
    let (sender,receiver)=mpsc::sync_channel(2);let (ready_tx,ready_rx)=mpsc::channel::<Result<(),String>>();
    {
        let mut sessions=state.0.lock().map_err(|_|"Export registry unavailable")?;
        sessions.retain(|_,session|!session.finished.load(Ordering::Relaxed));
        if sessions.len()>=2{return Err("Finish or cancel the active exports first".into());}
        sessions.insert(id,Arc::new(Session{sender,cancelled:cancelled.clone(),finished:finished.clone(),frame_bytes}));
    }
    std::thread::spawn(move||{
        #[cfg(windows)] if alternate{super::delivery::deliver(&output,&config,receiver,cancelled,ready_tx);}
        else{super::windows_mf::stream_export(&output,&config,receiver,cancelled,ready_tx);}
        #[cfg(not(windows))] {let _=(output,config,receiver,cancelled);let _=ready_tx.send(Err("Native MP4 export requires Windows".into()));}
        finished.store(true,Ordering::Relaxed);
    });
    let ready=tauri::async_runtime::spawn_blocking(move||ready_rx.recv_timeout(Duration::from_secs(60)).map_err(|_|"Native encoder initialization timed out".to_string())?)
        .await.map_err(|e|e.to_string())?;
    if ready.is_err(){if let Ok(mut sessions)=state.0.lock(){if let Some(s)=sessions.remove(&id){s.cancelled.store(true,Ordering::Relaxed);let _=s.sender.try_send(ExportPacket::Cancel);}}}
    ready.map(|_|id)
}
/// HLVF + u64 session + u32 sequential frame index + tight RGBA8. Binary IPC.
#[tauri::command]
pub async fn media_push_export_frame(request:tauri::ipc::Request<'_>,state:tauri::State<'_,MediaExportSessions>)->Result<(),String>{
    let tauri::ipc::InvokeBody::Raw(bytes)=request.body() else{return Err("Binary video frame required".into());};
    if bytes.len()<16||&bytes[..4]!=b"HLVF"{return Err("Invalid video frame envelope".into());}
    let id=u64::from_le_bytes(bytes[4..12].try_into().unwrap());let index=u32::from_le_bytes(bytes[12..16].try_into().unwrap());
    let session=session(&state,id)?;
    if bytes.len()-16!=session.frame_bytes{return Err("Frame length does not match export resolution".into());}
    let rgba=bytes[16..].to_vec();
    tauri::async_runtime::spawn_blocking(move||{
        if session.cancelled.load(Ordering::Relaxed){return Err("Export cancelled".into());}
        let (ack,reply)=mpsc::channel();session.sender.send(ExportPacket::Frame{index,rgba,ack}).map_err(|_|"Native encoder stopped".to_string())?;
        reply.recv_timeout(Duration::from_secs(120)).map_err(|_|"Native encoder frame timed out".to_string())?
    }).await.map_err(|e|e.to_string())?
}
#[tauri::command]
pub async fn media_finish_export(id:u64,state:tauri::State<'_,MediaExportSessions>)->Result<ExportReport,String>{
    let session=session(&state,id)?;
    let result=tauri::async_runtime::spawn_blocking(move||{
        let (ack,reply)=mpsc::channel();session.sender.send(ExportPacket::Finish(ack)).map_err(|_|"Native encoder stopped".to_string())?;
        reply.recv().map_err(|_|"Export finalization stopped".to_string())?
    }).await.map_err(|e|e.to_string())?;
    state.0.lock().map_err(|_|"Export registry unavailable")?.remove(&id);result
}
#[tauri::command]
pub fn media_cancel_export(id:u64,state:tauri::State<'_,MediaExportSessions>)->Result<(),String>{
    if let Some(session)=state.0.lock().map_err(|_|"Export registry unavailable")?.remove(&id){
        session.cancelled.store(true,Ordering::Relaxed);let _=session.sender.try_send(ExportPacket::Cancel);
    }
    Ok(())
}
impl Drop for MediaExportSessions {
    fn drop(&mut self){if let Ok(sessions)=self.0.lock(){for s in sessions.values(){s.cancelled.store(true,Ordering::Relaxed);let _=s.sender.try_send(ExportPacket::Cancel);}}}
}

#[cfg(test)] mod tests {
    use super::*;
    #[test] fn streaming_allows_long_movies_without_raw_file_budget(){
        let mut config=StreamConfig{output_path:"movie.mp4".into(),width:1920,height:1080,fps:30,frame_count:180_000,bitrate:None,audio:vec![]};
        assert!(validate_stream(&mut config).is_ok());config.frame_count=0;assert!(validate_stream(&mut config).is_err());
    }
}

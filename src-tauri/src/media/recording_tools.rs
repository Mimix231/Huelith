use serde::{Deserialize,Serialize};
use serde_json::Value;
use std::{
    collections::HashMap,
    fs,
    hash::{DefaultHasher, Hash, Hasher},
    io::{self, Read},
    path::{Path, PathBuf},
    process::{Command, Output, Stdio},
    sync::{Arc, Mutex, atomic::{AtomicBool, AtomicU64, Ordering}},
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::Manager;

static JOB: AtomicU64 = AtomicU64::new(0);

pub(super) fn tool(name: &str) -> Command {
    let mut command = Command::new(name);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    command.stdin(Stdio::null());
    command
}

#[derive(Default)]
pub struct RecordingJobs(Mutex<HashMap<String, Arc<AtomicBool>>>);

fn read_output(mut source: impl Read) -> io::Result<Vec<u8>> {
    let mut bytes = Vec::new();
    source.read_to_end(&mut bytes)?;
    Ok(bytes)
}

fn run_interruptible(mut command: Command, cancelled: &AtomicBool) -> io::Result<Output> {
    let mut child = command.stdout(Stdio::piped()).stderr(Stdio::piped()).spawn()?;
    let stdout = child.stdout.take().expect("piped stdout");
    let stderr = child.stderr.take().expect("piped stderr");
    let stdout = thread::spawn(move || read_output(stdout));
    let stderr = thread::spawn(move || read_output(stderr));
    let status = loop {
        if cancelled.load(Ordering::Relaxed) {
            let _ = child.kill();
            let _ = child.wait();
            break Err(io::Error::new(io::ErrorKind::Interrupted, "Recording job cancelled."));
        }
        match child.try_wait() {
            Ok(Some(status)) => break Ok(status),
            Ok(None) => thread::sleep(Duration::from_millis(25)),
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                break Err(error);
            }
        }
    };
    let stdout = stdout.join();
    let stderr = stderr.join();
    Ok(Output {
        status: status?,
        stdout: stdout.map_err(|_| io::Error::other("Recording output reader failed"))??,
        stderr: stderr.map_err(|_| io::Error::other("Recording log reader failed"))??,
    })
}

fn run(mut command: Command, cancelled: Option<&AtomicBool>) -> Result<Vec<u8>, String> {
    if cancelled.is_some_and(|flag| flag.load(Ordering::Relaxed)) {
        return Err("Recording job cancelled.".into());
    }
    let result = match cancelled {
        Some(flag) => run_interruptible(command, flag),
        None => command.output(),
    }.map_err(|error| {
        if error.kind() == io::ErrorKind::Interrupted {
            return error.to_string();
        }
        format!("The recording tools require FFmpeg and ffprobe on PATH ({error}).")
    })?;
    if !result.status.success() {
        let message = String::from_utf8_lossy(&result.stderr);
        return Err(format!("Recording processing failed. {}", message.chars().take(900).collect::<String>()));
    }
    Ok(result.stdout)
}

fn ffmpeg(input: &Path) -> Command {
    let mut command = tool("ffmpeg");
    command.args(["-hide_banner", "-nostdin", "-loglevel", "error", "-n", "-protocol_whitelist", "file,pipe",
        "-copyts", "-start_at_zero", "-i"]).arg(input);
    command
}

struct CacheJob { dir: PathBuf, files: Vec<PathBuf>, keep: bool }
impl CacheJob {
    fn new(root: &Path) -> Result<Self, String> {
        let clock = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e| e.to_string())?.as_nanos();
        let dir = root.join("video-recordings").join(format!("{}-{clock}-{}", std::process::id(), JOB.fetch_add(1, Ordering::Relaxed)));
        fs::create_dir_all(dir.parent().ok_or("Invalid recording cache")?).map_err(|e| e.to_string())?;
        fs::create_dir(&dir).map_err(|e| e.to_string())?;
        Ok(Self { dir, files: Vec::new(), keep: false })
    }
    fn output(&mut self, filename: &str) -> PathBuf {
        let path = self.dir.join(filename);
        self.files.push(path.clone());
        path
    }
}
impl Drop for CacheJob {
    fn drop(&mut self) {
        if !self.keep {
            for path in &self.files { let _ = fs::remove_file(path); }
            let _ = fs::remove_dir(&self.dir);
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordingOutput { pub path: String, pub title: String, pub duration: f64 }

fn proxy_path(input: &Path, root: &Path) -> Result<PathBuf, String> {
    let input = fs::canonicalize(input).map_err(|e| e.to_string())?;
    let metadata = input.metadata().map_err(|e| e.to_string())?;
    if !metadata.is_file() { return Err("Choose a local video.".into()); }
    let mut hash = DefaultHasher::new();
    ("avc-proxy-v2-960-vfr", &input, metadata.len(), metadata.modified().map_err(|e|e.to_string())?)
        .hash(&mut hash);
    Ok(root.join("video-proxies").join(format!("{:016x}.mp4", hash.finish())))
}

fn cached_proxy(path: &Path) -> Option<String> {
    let file = fs::OpenOptions::new().read(true).write(true).open(path).ok()?;
    if file.metadata().ok()?.len() < 1024 { return None; }
    let _ = file.set_times(fs::FileTimes::new().set_modified(SystemTime::now()));
    Some(path.to_string_lossy().into_owned())
}

fn trim_proxy_cache(path: &Path, quota: u64) -> Result<(), String> {
    let mut files = Vec::new();
    let mut total = 0u64;
    for entry in fs::read_dir(path.parent().ok_or("Invalid proxy directory")?).map_err(|e|e.to_string())?.flatten() {
        let Ok(meta) = entry.metadata() else { continue; };
        let item = entry.path();
        if !meta.is_file() || item.extension().is_none_or(|ext| ext != "mp4") { continue; }
        total = total.saturating_add(meta.len());
        if item != path { files.push((meta.modified().unwrap_or(UNIX_EPOCH),meta.len(),item)); }
    }
    files.sort_by_key(|entry|entry.0);
    for (_, size, item) in files {
        if total <= quota { break; }
        if fs::remove_file(item).is_ok() { total=total.saturating_sub(size); }
    }
    if total > quota { return Err("Proxy cache is full. Increase its limit or close previews using older proxies.".into()); }
    Ok(())
}

#[tauri::command]
pub async fn video_find_cached_proxies(app:tauri::AppHandle, paths:Vec<String>)->Result<Vec<Option<String>>,String>{
    if paths.len()>512{return Err("Too many proxy sources.".into());}
    let root=app.path().app_cache_dir().map_err(|e|e.to_string())?;
    tauri::async_runtime::spawn_blocking(move||paths.iter().map(|input|
        proxy_path(Path::new(input),&root).ok().and_then(|path|cached_proxy(&path))).collect())
        .await.map_err(|e|e.to_string())
}

fn prepare_cached_proxy(input:&Path,root:&Path,fps:u32,cache_limit_mb:u32,cancelled:Option<&AtomicBool>)
    ->Result<Vec<RecordingOutput>,String>{
    let path=proxy_path(input,root)?;
    let quota=u64::from(cache_limit_mb.clamp(256,32768))*1024*1024;
    if let Some(cached)=cached_proxy(&path){
        trim_proxy_cache(&path,quota)?;
        let seconds=duration(&inspect(input,cancelled)?)?;
        return Ok(vec![RecordingOutput{path:cached,title:"proxy".into(),duration:seconds}]);
    }
    let mut outputs=prepare(input,root,"proxy",fps,None,cancelled)?;
    let output=outputs.first_mut().ok_or("Proxy output is missing.")?;
    let temporary=PathBuf::from(&output.path);
    let result=(||{
        if cancelled.is_some_and(|flag|flag.load(Ordering::Relaxed)){return Err("Recording job cancelled.".into());}
        if proxy_path(input,root)?!=path{return Err("The source changed during proxy encoding.".into());}
        if temporary.metadata().map_err(|e|e.to_string())?.len()>quota{return Err("This proxy exceeds the configured cache limit.".into());}
        fs::create_dir_all(path.parent().ok_or("Invalid proxy directory")?).map_err(|e|e.to_string())?;
        if cached_proxy(&path).is_none(){fs::rename(&temporary,&path).map_err(|e|e.to_string())?;}
        if let Err(error)=trim_proxy_cache(&path,quota){let _=fs::remove_file(&path);return Err(error);}
        output.path=path.to_string_lossy().into_owned();
        Ok(())
    })();
    let _=fs::remove_file(&temporary);
    if let Some(dir)=temporary.parent(){let _=fs::remove_dir(dir);}
    result.map(|()|outputs)
}

#[derive(Deserialize)]
#[serde(rename_all="camelCase")]
pub struct PitchTiming { start:f64, end:f64, duration:f64, rates:Vec<PitchRate> }
#[derive(Deserialize)]
struct PitchRate { time:f64, rate:f64 }

fn inspect(input: &Path, cancelled: Option<&AtomicBool>) -> Result<Value, String> {
    let mut command = tool("ffprobe");
    command.args(["-v", "error", "-protocol_whitelist", "file,pipe", "-show_format", "-show_streams", "-of", "json", "-i"]).arg(input);
    serde_json::from_slice(&run(command,cancelled)?).map_err(|e| e.to_string())
}

fn duration(info: &Value) -> Result<f64, String> {
    let value = info["format"]["duration"].as_str().and_then(|text| text.parse::<f64>().ok()).unwrap_or(0.);
    if !value.is_finite() || !(0.1..=21600.1).contains(&value) {
        return Err("Choose a recording between 0.1 seconds and six hours.".into());
    }
    Ok(value.min(21600.))
}

fn timecode_seconds(text:&str,rate:f64)->Option<f64>{
    let fields=text.split([':', ';']).map(str::parse::<u32>).collect::<Result<Vec<_>,_>>().ok()?;
    let [hour,minute,second,frame]=fields.as_slice()else{return None;};
    let nominal=rate.round() as u32;
    if !(1..=120).contains(&nominal)||*hour>=24||*minute>=60||*second>=60||*frame>=nominal{return None;}
    let count=(hour*3600+minute*60+second)*nominal+frame;
    if text.contains(';'){
        if !matches!(nominal,30|60)||(rate-nominal as f64*1000./1001.).abs()>0.01{return None;}
        let drop=nominal/15;
        if minute%10!=0&&*second==0&&*frame<drop{return None;}
        let minutes=hour*60+minute;
        return Some((count-drop*(minutes-minutes/10)) as f64/rate);
    }
    Some(count as f64/rate)
}

fn inspect_timecode(input:&Path)->Result<f64,String>{
    let source=fs::canonicalize(input).map_err(|e|e.to_string())?;
    let info=inspect(&source,None)?;
    let streams=info["streams"].as_array().ok_or("No video streams in this recording.")?;
    let video=streams.iter().find(|stream|stream["codec_type"]=="video").ok_or("No camera video stream found.")?;
    let tag=|value:&Value|value["tags"].as_object().and_then(|tags|tags.iter().find(|(key,_)|key.eq_ignore_ascii_case("timecode")))
        .and_then(|(_,value)|value.as_str()).map(str::to_owned);
    let text=tag(video).or_else(||tag(&info["format"])).or_else(||streams.iter().find_map(tag))
        .ok_or("This recording has no embedded timecode. Try waveform or timeline alignment.")?;
    let rate=|value:&Value|{
        let (num,den)=value.as_str()?.split_once('/')?;
        let result=num.parse::<f64>().ok()?/den.parse::<f64>().ok()?;
        (result.is_finite()&&result>0.).then_some(result)
    };
    let rate=rate(&video["r_frame_rate"]).or_else(||rate(&video["avg_frame_rate"])).ok_or("No camera frame rate found.")?;
    timecode_seconds(&text,rate).ok_or_else(||"The recording has unsupported timecode.".to_string())
}

#[tauri::command]
pub async fn video_recording_timecode(path:String)->Result<f64,String>{
    tauri::async_runtime::spawn_blocking(move||inspect_timecode(Path::new(&path))).await.map_err(|e|e.to_string())?
}

#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct SceneCut { time:f64, score:f64 }

#[derive(Serialize)]
#[serde(rename_all="camelCase")]
pub struct Loudness { integrated:f64, true_peak:f64 }

fn analysis_command(path:&Path,start:f64,duration:f64)->Result<Command,String>{
    if !start.is_finite()||start<0.||!duration.is_finite()||duration<=0.||duration>21600.{
        return Err("Choose a valid source range.".into());
    }
    let input=fs::canonicalize(path).map_err(|e|e.to_string())?;
    if !input.is_file(){return Err("Choose a local media file.".into());}
    let mut command=tool("ffmpeg");
    command.args(["-hide_banner","-nostats","-nostdin","-protocol_whitelist","file,pipe",
        "-ss",&format!("{start:.6}"),"-t",&format!("{duration:.6}"),"-i"]).arg(input);
    Ok(command)
}

fn scan_scene_cuts(path:&Path,start:f64,duration:f64,sensitivity:f64,cancelled:&AtomicBool)->Result<Vec<SceneCut>,String>{
    if !sensitivity.is_finite()||!(0.05..=0.95).contains(&sensitivity){return Err("Invalid scene threshold.".into());}
    let mut command=analysis_command(path,start,duration)?;
    let filter=format!("scale=w='min(320,iw)':h=-2,format=yuv420p,select=gt(scene\\,{sensitivity:.3}),metadata=mode=print:key=lavfi.scene_score:file=-");
    command.args(["-loglevel","error","-map","0:v:0","-an","-vf",&filter,"-f","null","-"]);
    let output=run(command,Some(cancelled))?;
    let mut time=None;
    let mut cuts:Vec<SceneCut>=Vec::new();
    for line in String::from_utf8_lossy(&output).lines(){
        if let Some((_,text))=line.split_once("pts_time:"){time=text.trim().parse::<f64>().ok();continue;}
        if let (Some(at),Some(score))=(time.take(),line.strip_prefix("lavfi.scene_score=").and_then(|value|value.parse::<f64>().ok())){
            if !(0.08..duration-0.04).contains(&at)||!score.is_finite(){continue;}
            let cut=SceneCut{time:start+at,score};
            if let Some(previous)=cuts.last_mut().filter(|previous|cut.time-previous.time<0.18){
                if cut.score>previous.score{*previous=cut;}
            }else{cuts.push(cut);}
        }
        if cuts.len()>=2048{break;}
    }
    Ok(cuts)
}

fn measure_loudness(path:&Path,start:f64,duration:f64,cancelled:&AtomicBool)->Result<Loudness,String>{
    let mut command=analysis_command(path,start,duration)?;
    command.args(["-loglevel","info","-map","0:a:0","-vn","-af","ebur128=peak=true:framelog=verbose","-f","null","-"]);
    let output=run_interruptible(command,cancelled).map_err(|e|e.to_string())?;
    if !output.status.success(){return Err("Could not measure an audio stream in this source.".into());}
    let log=String::from_utf8_lossy(&output.stderr);
    let (_,summary)=log.rsplit_once("Summary:").ok_or("Loudness summary is missing.")?;
    let number=|label:&str|summary.lines().find_map(|line|line.trim().strip_prefix(label)
        .and_then(|value|value.split_whitespace().next()).and_then(|value|value.parse::<f64>().ok())
        .filter(|value|value.is_finite()));
    let integrated=number("I:").filter(|value|*value>-69.9).ok_or("No audible program material in this source range.")?;
    let true_peak=number("Peak:").ok_or("True peak measurement is unavailable.")?;
    Ok(Loudness{integrated,true_peak})
}

fn register_recording_job(state:&RecordingJobs,id:&str)->Result<Arc<AtomicBool>,String>{
    if id.is_empty()||id.len()>80||!id.bytes().all(|c|c.is_ascii_alphanumeric()||c==b'-'){
        return Err("Invalid recording job ID.".into());
    }
    let mut jobs=state.0.lock().map_err(|e|e.to_string())?;
    if jobs.contains_key(id)||jobs.len()>=16{return Err("The recording queue is full or this job is already running.".into());}
    let flag=Arc::new(AtomicBool::new(false));
    jobs.insert(id.into(),Arc::clone(&flag));
    Ok(flag)
}

#[tauri::command]
pub async fn video_scene_cuts(state:tauri::State<'_,RecordingJobs>,path:String,start:f64,duration:f64,sensitivity:f64,job_id:String)->Result<Vec<SceneCut>,String>{
    let flag=register_recording_job(&state,&job_id)?;
    let result=tauri::async_runtime::spawn_blocking(move||scan_scene_cuts(Path::new(&path),start,duration,sensitivity,&flag)).await;
    state.0.lock().map_err(|e|e.to_string())?.remove(&job_id);
    result.map_err(|e|e.to_string())?
}

#[tauri::command]
pub async fn video_measure_loudness(state:tauri::State<'_,RecordingJobs>,path:String,start:f64,duration:f64,job_id:String)->Result<Loudness,String>{
    let flag=register_recording_job(&state,&job_id)?;
    let result=tauri::async_runtime::spawn_blocking(move||measure_loudness(Path::new(&path),start,duration,&flag)).await;
    state.0.lock().map_err(|e|e.to_string())?.remove(&job_id);
    result.map_err(|e|e.to_string())?
}

fn prepare(input: &Path, root: &Path, mode: &str, fps: u32, pitch:Option<PitchTiming>, cancelled:Option<&AtomicBool>) -> Result<Vec<RecordingOutput>, String> {
    let input=fs::canonicalize(input).map_err(|e| e.to_string())?;
    if !input.is_file() { return Err("Choose a local recording.".into()); }
    if !matches!(input.extension().and_then(|value|value.to_str()).unwrap_or("").to_ascii_lowercase().as_str(),
        "mkv"|"mp4"|"mov"|"webm"|"m4v"|"avi"|"wmv"|"wav"|"mp3"|"aac"|"flac"|"ogg"|"m4a") {
        return Err("Choose a supported local recording.".into());
    }
    let info = inspect(&input,cancelled)?;
    let seconds = duration(&info)?;
    let mut job = CacheJob::new(root)?;
    let mut outputs = Vec::new();
    match mode {
        "master" | "proxy" => {
            if !(1..=120).contains(&fps) { return Err("Choose a frame rate from 1 to 120.".into()); }
            let proxy=mode=="proxy";
            let output=job.output(if proxy {"proxy.mp4"} else {"editing-master.mp4"});
            let mut command=ffmpeg(&input);
            command.args(["-map", "0:v:0"]);
            if proxy { command.arg("-an"); }
            else { command.args(["-map", "0:a:0?", "-c:a", "aac", "-b:a", "192k", "-af", "aresample=async=1:first_pts=0"]); }
            let limit=if proxy {960} else {3840};
            let scale=format!("scale=w='min({limit},iw)':h='min({limit},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2");
            let filter=if proxy { command.args(["-fps_mode","passthrough"]); scale } else {format!("fps={fps}:start_time=0,{scale}")};
            command.args(["-vf", &filter, "-c:v", "libx264", "-preset", "veryfast", "-crf", if proxy {"22"} else {"15"},
                "-pix_fmt", "yuv420p", "-g", &fps.to_string(), "-movflags", "+faststart", "-t", &seconds.to_string()]).arg(&output);
            run(command,cancelled)?;
            outputs.push(RecordingOutput { path:output.to_string_lossy().into_owned(), title:mode.into(), duration:seconds });
        }
        "streams" | "voice" => {
            let streams=info["streams"].as_array().ok_or("The recording has no streams")?;
            let mut command=ffmpeg(&input);
            for (number,stream) in streams.iter().filter(|stream|stream["codec_type"]=="audio").take(if mode=="voice" {1} else {16}).enumerate(){
                let index=stream["index"].as_u64().ok_or("Audio stream index is missing")?;
                let output=job.output(&format!("audio-{}.m4a", number+1));
                let name=stream["tags"]["title"].as_str().or_else(||stream["tags"]["handler_name"].as_str());
                let title=name.filter(|name|!name.trim().is_empty()).map(|name|name.chars().take(120).collect())
                    .unwrap_or_else(|| format!("Audio stream {}",number+1));
                let filter=if mode=="voice" {
                    "aresample=async=1:first_pts=0,highpass=f=75,afftdn=nr=12:nf=-43,deesser=i=0.35,acompressor=threshold=0.12:ratio=3,loudnorm=I=-16:LRA=9:TP=-1.5,aresample=48000,apad"
                }else{"aresample=async=1:first_pts=0,apad"};
                command.args(["-map", &format!("0:{index}"), "-vn", "-af",filter,"-c:a","aac","-b:a","192k","-t",&seconds.to_string()]).arg(&output);
                outputs.push(RecordingOutput{path:output.to_string_lossy().into_owned(),title,duration:seconds});
            }
            if outputs.is_empty(){return Err("This recording contains no audio streams.".into());}
            run(command,cancelled)?;
        }
        "pitch" => {
            let pitch=pitch.ok_or("Missing pitch-preserving timing curve")?;
            if ![pitch.start,pitch.end,pitch.duration].iter().all(|n|n.is_finite())
                ||pitch.start<0.||pitch.end<=pitch.start||pitch.end>seconds+0.05||!(0.05..=21600.).contains(&pitch.duration)
                ||pitch.rates.is_empty()||pitch.rates.len()>128||pitch.rates[0].time!=0.
                ||pitch.rates.windows(2).any(|pair|pair[0].time>=pair[1].time)
                ||pitch.rates.iter().any(|key|!key.time.is_finite()||key.time<0.||key.time>=pitch.end-pitch.start
                    ||!key.rate.is_finite()||!(0.0624..=16.01).contains(&key.rate)){
                return Err("Invalid forward speed map for pitch preservation.".into());
            }
            let output=job.output("pitch-preserved.m4a");
            let first=pitch.rates[0].rate;
            let commands=pitch.rates.iter().skip(1).map(|key|format!("{:.8} rubberband tempo {:.8}",key.time,key.rate)).collect::<Vec<_>>().join(";");
            let automation=if commands.is_empty(){String::new()}else{format!("asendcmd=c='{commands}',")};
            let filter=format!("aresample=async=1:first_pts=0,atrim=start={}:end={},asetpts=PTS-STARTPTS,{automation}rubberband=tempo={first}:pitch=1,apad,atrim=duration={}",
                pitch.start,pitch.end,pitch.duration);
            let mut command=ffmpeg(&input);
            command.args(["-map","0:a:0","-vn","-af",&filter,"-c:a","aac","-b:a","192k"]).arg(&output);
            run(command,cancelled)?;
            outputs.push(RecordingOutput{path:output.to_string_lossy().into_owned(),title:"Pitch-preserved audio".into(),duration:pitch.duration});
        }
        _ => return Err("Unknown recording operation.".into()),
    }
    if cancelled.is_some_and(|flag| flag.load(Ordering::Relaxed)) {
        return Err("Recording job cancelled.".into());
    }
    job.keep=true;
    Ok(outputs)
}

#[tauri::command]
pub async fn video_prepare_recording(
    app: tauri::AppHandle, state:tauri::State<'_,RecordingJobs>, path:String,
    mode:String, fps:u32, pitch:Option<PitchTiming>, job_id:Option<String>, cache_limit_mb:Option<u32>,
) -> Result<Vec<RecordingOutput>,String> {
    let root=app.path().app_cache_dir().map_err(|e|e.to_string())?;
    let cancelled=job_id.as_deref().map(|id|register_recording_job(&state,id)).transpose()?;
    let result=tauri::async_runtime::spawn_blocking(move || {
        let input=Path::new(&path);
        if mode=="proxy"{prepare_cached_proxy(input,&root,fps,cache_limit_mb.unwrap_or(4096),cancelled.as_deref())}
        else{prepare(input,&root,&mode,fps,pitch,cancelled.as_deref())}
    }).await;
    if let Some(id)=job_id {
        state.0.lock().map_err(|e|e.to_string())?.remove(&id);
    }
    result.map_err(|e|e.to_string())?
}

#[tauri::command]
pub fn video_cancel_recording(state:tauri::State<'_,RecordingJobs>,job_id:String) -> Result<bool,String> {
    let jobs=state.0.lock().map_err(|e|e.to_string())?;
    Ok(jobs.get(&job_id).is_some_and(|flag|{
        flag.store(true,Ordering::Relaxed);
        true
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn drop_frame_timecode_skips_only_the_numbered_frames(){
        assert!((timecode_seconds("01:00:00;00",30000./1001.).unwrap()-3599.9964).abs()<0.001);
        assert_eq!(timecode_seconds("00:01:00;00",30000./1001.),None);
        assert_eq!(timecode_seconds("01:00:00:12",24.),Some(3600.5));
    }

    #[test]
    fn obs_fixture_prepares_proxy_streams_voice_and_pitch() {
        if tool("ffmpeg").arg("-version").output().is_err() {return;}
        let root=std::env::temp_dir().join(format!("huelith-recording-test-{}",std::process::id()));
        fs::create_dir_all(&root).unwrap();
        let mut fixture=CacheJob::new(&root).unwrap();
        let input=fixture.output("dual-stream.mkv");
        let mut command=tool("ffmpeg");
        command.args(["-hide_banner","-loglevel","error","-n","-f","lavfi","-i","testsrc2=s=160x90:r=24000/1001:d=2",
            "-f","lavfi","-i","sine=f=440:d=2","-f","lavfi","-i","sine=f=880:d=2",
            "-map","0:v","-map","1:a","-map","2:a","-metadata:s:a:0","title=Mic","-metadata:s:a:1","title=Game",
            "-c:v","libx264","-c:a","aac"]).arg(&input);
        run(command,None).unwrap();
        let master=prepare(&input,&root,"master",30,None,None).unwrap();
        let info=inspect(Path::new(&master[0].path),None).unwrap();
        assert_eq!(info["streams"][0]["avg_frame_rate"],"30/1");
        assert_eq!(info["streams"][1]["codec_type"],"audio");
        let active=AtomicBool::new(false);
        let proxy=prepare(&input,&root,"proxy",30,None,Some(&active)).unwrap();
        let info=inspect(Path::new(&proxy[0].path),None).unwrap();
        assert_eq!(info["streams"].as_array().unwrap().len(),1);
        assert_eq!(info["streams"][0]["avg_frame_rate"],"24000/1001");
        let cached=prepare_cached_proxy(&input,&root,30,256,Some(&active)).unwrap();
        let reused=prepare_cached_proxy(&input,&root,60,256,Some(&active)).unwrap();
        assert_eq!(cached[0].path,reused[0].path);
        assert_eq!(cached_proxy(&proxy_path(&input,&root).unwrap()).unwrap(),cached[0].path);
        let streams=prepare(&input,&root,"streams",30,None,None).unwrap();
        assert_eq!(streams.iter().map(|file|file.title.as_str()).collect::<Vec<_>>(),["Mic","Game"]);
        let voice=prepare(&input,&root,"voice",30,None,None).unwrap();
        assert!(duration(&inspect(Path::new(&voice[0].path),None).unwrap()).unwrap()>1.9);
        let pitch=prepare(&input,&root,"pitch",30,Some(PitchTiming{
            start:0.,end:1.8,duration:1.15,rates:vec![PitchRate{time:0.,rate:1.25},PitchRate{time:0.75,rate:2.}],
        }),None).unwrap();
        let mut decode=tool("ffmpeg");
        decode.args(["-hide_banner","-loglevel","error","-i"]).arg(&pitch[0].path).args(["-vn","-ac","1","-ar","16000","-f","f32le","pipe:1"]);
        let pcm=run(decode,None).unwrap();
        let samples:Vec<_>=pcm.chunks_exact(4).take(8000).map(|value|f32::from_le_bytes(value.try_into().unwrap()) as f64).collect();
        let power=|freq:f64|{
            let (x,y)=samples.iter().enumerate().fold((0.,0.),|(x,y),(index,value)|{
                let angle=index as f64/16000.*freq*std::f64::consts::TAU;
                (x+value*angle.cos(),y+value*angle.sin())
            });
            x.hypot(y)
        };
        assert!(power(440.)>power(550.)*8.&&power(440.)>8.);
        for output in master.into_iter().chain(proxy).chain(streams).chain(voice).chain(pitch).chain(cached){
            let path=PathBuf::from(output.path);
            fs::remove_file(&path).unwrap();let _=fs::remove_dir(path.parent().unwrap());
        }
        drop(fixture);
        let _=fs::remove_dir(root.join("video-recordings"));
        let _=fs::remove_dir(root);
    }

    #[test]
    fn detects_source_cut_and_measures_audio_with_real_ffmpeg(){
        if tool("ffmpeg").arg("-version").output().is_err(){return;}
        let root=std::env::temp_dir();
        let mut fixture=CacheJob::new(&root).unwrap();
        let input=fixture.output("source-analysis.mp4");
        let mut command=tool("ffmpeg");
        command.args(["-hide_banner","-loglevel","error","-n",
            "-f","lavfi","-i","color=c=black:s=160x90:r=30:d=1",
            "-f","lavfi","-i","color=c=white:s=160x90:r=30:d=1",
            "-f","lavfi","-i","sine=f=1000:d=2",
            "-filter_complex","[0:v][1:v]concat=n=2:v=1:a=0[v]","-map","[v]","-map","2:a:0",
            "-c:v","libx264","-c:a","aac"]).arg(&input);
        run(command,None).unwrap();
        let active=AtomicBool::new(false);
        let cuts=scan_scene_cuts(&input,0.25,1.5,0.28,&active).unwrap();
        assert_eq!(cuts.len(),1);
        assert!((cuts[0].time-1.).abs()<0.05,"Cut at {}",cuts[0].time);
        let loudness=measure_loudness(&input,0.,2.,&active).unwrap();
        assert!((-24. .. -19.).contains(&loudness.integrated));
        assert!((-22. .. -15.).contains(&loudness.true_peak));
    }
}

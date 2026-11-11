//! Offline speech recognition. Media Foundation mixes the authored timeline;
//! a pinned bundled whisper.cpp CPU executable recognizes it without uploads.
use std::{collections::HashMap,path::{Path,PathBuf},sync::{Arc,Mutex,atomic::{AtomicBool,Ordering}},time::Duration};
use serde::Serialize;
use tauri::{Emitter,Manager};
use crate::media::{self,AudioSource};
#[derive(Default)]pub struct CaptionJobs(Mutex<HashMap<String,Arc<AtomicBool>>>);
#[derive(Clone,Serialize)]#[serde(rename_all="camelCase")]struct Progress{job_id:String,stage:String}
#[derive(Debug,Serialize)]pub struct CaptionWord{pub text:String,pub start:f64,pub end:f64}
#[derive(Debug,Serialize)]pub struct CaptionCue{pub id:String,pub start:f64,pub end:f64,pub text:String,pub words:Vec<CaptionWord>}
struct WorkFiles(PathBuf);
impl Drop for WorkFiles{fn drop(&mut self){for file in ["mix.wav","transcript.json","whisper.log"]{let _=std::fs::remove_file(self.0.join(file));}let _=std::fs::remove_dir(&self.0);}}
fn parse_transcript(json:&str,duration:f64,job_id:&str)->Result<Vec<CaptionCue>,String>{
    let value:serde_json::Value=serde_json::from_str(json).map_err(|e|format!("Speech output is invalid: {e}"))?;
    let segments=value["transcription"].as_array().ok_or("Speech output contains no transcript")?;let mut cues=Vec::new();
    for (index,segment) in segments.iter().enumerate(){
        let text=segment["text"].as_str().unwrap_or("").trim().to_string();
        let start=(segment["offsets"]["from"].as_f64().unwrap_or(0.)/1000.).clamp(0.,duration);
        let end=(segment["offsets"]["to"].as_f64().unwrap_or(0.)/1000.).clamp(0.,duration);
        if text.is_empty()||end<=start||text.starts_with("[_"){continue;}
        let mut words:Vec<CaptionWord>=Vec::new();
        if let Some(tokens)=segment["tokens"].as_array(){for token in tokens{
            let raw=token["text"].as_str().unwrap_or("");if raw.trim().is_empty()||raw.trim().starts_with('['){continue;}
            let from=(token["offsets"]["from"].as_f64().unwrap_or(start*1000.)/1000.-start).clamp(0.,end-start);
            let to=(token["offsets"]["to"].as_f64().unwrap_or((start+from)*1000.)/1000.-start).clamp(from,end-start);
            if !raw.starts_with(char::is_whitespace)&&!words.is_empty(){let last=words.last_mut().unwrap();last.text.push_str(raw);last.end=to.max(last.end);}
            else{words.push(CaptionWord{text:raw.trim().to_string(),start:from,end:to});}
        }}
        for i in 0..words.len(){if words[i].end<=words[i].start{words[i].end=words.get(i+1).map(|w|w.start).unwrap_or(end-start).max(words[i].start);}}
        cues.push(CaptionCue{id:format!("{job_id}:{index}"),start,end,text,words});
    }
    if cues.len()>4096{return Err("Speech generated too many captions for one project".into());}
    Ok(cues)
}
fn recognize(app:&tauri::AppHandle,job_id:&str,audio:&[AudioSource],duration:f64,language:&str,cancelled:&AtomicBool)->Result<Vec<CaptionCue>,String>{
    let root=if cfg!(debug_assertions){Path::new(env!("CARGO_MANIFEST_DIR")).join("resources/speech")}else{app.path().resource_dir().map_err(|e|e.to_string())?.join("speech")};
    let executable=if cfg!(debug_assertions){root.join("Release/whisper-cli.exe")}else{root.join("whisper-cli.exe")};
    let model=root.join("ggml-base-q5_1.bin");
    if !executable.is_file()||!model.is_file(){return Err("Bundled offline speech engine is missing. Reinstall Huelith or run scripts/prepare-video-speech.ps1 when building from source.".into());}
    let folder=std::env::temp_dir().join(format!("huelith-caption-{}-{job_id}",std::process::id()));
    std::fs::create_dir(&folder).map_err(|e|e.to_string())?;let _cleanup=WorkFiles(folder.clone());
    let notify=|stage:String|{let _=app.emit("video-caption-progress",Progress{job_id:job_id.into(),stage});};
    notify("Mixing timeline audio…".into());
    media::caption_audio(&folder.join("mix.wav"),audio,duration,cancelled,|p|notify(format!("Mixing timeline audio: {}%",(p*100.) as u32)))?;
    if cancelled.load(Ordering::Relaxed){return Err("Caption creation cancelled".into());}
    notify("Recognizing speech locally…".into());
    let log=std::fs::File::create(folder.join("whisper.log")).map_err(|e|e.to_string())?;
    let mut command=std::process::Command::new(&executable);
    command.current_dir(executable.parent().unwrap()).args(["-ng","-sns","-ojf","-ml","64","-sow","-t","4","-l",language,"--prompt","Huelith, video editing, effects."])
        .arg("-m").arg(&model).arg("-f").arg(folder.join("mix.wav")).arg("-of").arg(folder.join("transcript"))
        .stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(log);
    #[cfg(windows)]{use std::os::windows::process::CommandExt;command.creation_flags(0x08000000);}
    let mut child=command.spawn().map_err(|e|format!("Could not start local speech recognition: {e}"))?;
    loop{
        if cancelled.load(Ordering::Relaxed){let _=child.kill();let _=child.wait();return Err("Caption creation cancelled".into());}
        match child.try_wait().map_err(|e|e.to_string())?{Some(status)=>{if !status.success(){let log=std::fs::read_to_string(folder.join("whisper.log")).unwrap_or_default();return Err(format!("Speech recognition failed: {}",log.chars().rev().take(1500).collect::<String>().chars().rev().collect::<String>()));}break;},None=>std::thread::sleep(Duration::from_millis(100))}
    }
    let json=std::fs::read_to_string(folder.join("transcript.json")).map_err(|e|format!("Speech transcript was not created: {e}"))?;
    parse_transcript(&json,duration,job_id)
}
#[tauri::command]
pub async fn video_transcribe(app:tauri::AppHandle,state:tauri::State<'_,CaptionJobs>,job_id:String,audio:Vec<AudioSource>,duration:f64,language:String)->Result<Vec<CaptionCue>,String>{
    if job_id.is_empty()||job_id.len()>80||!job_id.chars().all(|c|c.is_ascii_alphanumeric()||c=='-'){return Err("Invalid caption job ID".into());}
    if language!="auto"&&(language.len()!=2||!language.chars().all(|c|c.is_ascii_lowercase())){return Err("Choose a supported speech language".into());}
    let cancelled=Arc::new(AtomicBool::new(false));
    {let mut jobs=state.0.lock().map_err(|_|"Caption jobs unavailable")?;if !jobs.is_empty(){return Err("Finish or cancel the running caption job first".into());}jobs.insert(job_id.clone(),cancelled.clone());}
    let worker_id=job_id.clone();let result=tauri::async_runtime::spawn_blocking(move||recognize(&app,&worker_id,&audio,duration,&language,&cancelled)).await.map_err(|e|e.to_string());
    state.0.lock().map_err(|_|"Caption jobs unavailable")?.remove(&job_id);result?
}
#[tauri::command]
pub fn video_cancel_transcription(state:tauri::State<'_,CaptionJobs>,job_id:String)->Result<(),String>{
    if let Some(job)=state.0.lock().map_err(|_|"Caption jobs unavailable")?.get(&job_id){job.store(true,Ordering::Relaxed);}Ok(())
}
#[cfg(test)]mod tests{
    use super::*;
    #[test]fn transcript_tokens_form_words_with_clip_local_timing(){
        let json=r#"{"transcription":[{"text":"Hello world!","offsets":{"from":1000,"to":3000},"tokens":[{"text":" Hello","offsets":{"from":1000,"to":1500}},{"text":" world","offsets":{"from":1600,"to":2300}},{"text":"!","offsets":{"from":2300,"to":2400}}]}]}"#;
        let cues=parse_transcript(json,4.,"test").unwrap();assert_eq!(cues[0].start,1.);assert_eq!(cues[0].words[1].text,"world!");assert!((cues[0].words[1].start-0.6).abs()<1e-9);assert_eq!(cues[0].words[1].end,1.4);
    }
}

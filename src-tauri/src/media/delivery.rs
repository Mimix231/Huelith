use super::{recording_tools::tool, stream::{ExportPacket,StreamConfig},ExportReport};
use std::{
    io::Write,
    path::{Path,PathBuf},
    process::{Child,Stdio},
    sync::{atomic::{AtomicBool,Ordering},mpsc::{Receiver,Sender},Arc},
    time::{Duration,Instant,SystemTime,UNIX_EPOCH},
};

pub(super) fn destination(output:&str)->Result<PathBuf,String>{
    let output=Path::new(output);
    let parent=output.parent().ok_or("Missing output directory")?.canonicalize().map_err(|e|e.to_string())?;
    let destination=parent.join(output.file_name().ok_or("Missing output name")?);
    if destination.exists(){return Err("Refusing to replace an existing export".into());}
    Ok(destination)
}

fn wait(process:&mut Child,cancelled:&AtomicBool)->Result<(),String>{
    loop{
        if cancelled.load(Ordering::Relaxed){
            let _=process.kill();let _=process.wait();
            return Err("Export cancelled".into());
        }
        match process.try_wait().map_err(|e|e.to_string())?{
            Some(status) if status.success()=>return Ok(()),
            Some(status)=>return Err(format!("FFmpeg exited with {status}. Check that libvpx-vp9 and libopus are installed.")),
            None=>std::thread::sleep(Duration::from_millis(35)),
        }
    }
}

pub(super) fn deliver(
    destination:&Path,config:&StreamConfig,receiver:Receiver<ExportPacket>,cancelled:Arc<AtomicBool>,ready:Sender<Result<(),String>>,
){
    let audio_only=destination.extension().is_some_and(|ext|ext.eq_ignore_ascii_case("wav"));
    let started=Instant::now();
    let nonce=SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos();
    let video=destination.with_file_name(format!(".huelith-{nonce}.webm"));
    let wav=destination.with_file_name(format!(".huelith-{nonce}.wav"));
    let mux=destination.with_file_name(format!(".huelith-{nonce}-mixed.webm"));
    let mut encoder=if audio_only{None}else{
        let dims=format!("{}x{}",config.width,config.height);
        let fps=config.fps.to_string();
        let bitrate=config.bitrate.unwrap_or(12_000_000).to_string();
        let result=tool("ffmpeg").args(["-nostdin","-hide_banner","-loglevel","error","-n","-f","rawvideo","-pix_fmt","rgba",
            "-s",&dims,"-r",&fps,"-i","pipe:0","-c:v","libvpx-vp9","-pix_fmt","yuva420p","-auto-alt-ref","0","-deadline","good",
            "-cpu-used","4","-row-mt","1","-b:v",&bitrate,"-an"]).arg(&video).stdin(Stdio::piped()).spawn();
        match result{
            Ok(child)=>Some(child),
            Err(error)=>{let _=ready.send(Err(format!("WebM export requires FFmpeg on PATH ({error}).")));return;}
        }
    };
    let mut count=0;
    let total=config.frame_count;
    let mut input=encoder.as_mut().and_then(|child|child.stdin.take());
    if ready.send(Ok(())).is_ok(){
        while !cancelled.load(Ordering::Relaxed){
            let Ok(packet)=receiver.recv_timeout(Duration::from_secs(120))else{break;};
            match packet{
                ExportPacket::Cancel=>break,
                ExportPacket::Frame{index,rgba,ack}=>{
                    let result=if index!=count||index>=total{Err("Frames must be sent in order".into())}
                        else if let Some(pipe)=input.as_mut(){pipe.write_all(&rgba).map_err(|e|format!("WebM encoder stopped: {e}"))}
                        else{Err("WAV export accepts audio only".into())};
                    let failed=result.is_err();
                    let _=ack.send(result);
                    if failed{break;}
                    count+=1;
                }
                ExportPacket::Finish(ack)=>{
                    let result=(||{
                        if !audio_only&&count!=total{return Err("Some frames are missing from the export".into());}
                        drop(input.take());
                        if let Some(child)=encoder.as_mut(){wait(child,&cancelled)?;}
                        if audio_only||!config.audio.is_empty(){
                            super::windows_mf::mix_wav(&wav,&config.audio,total as f64/config.fps as f64,&cancelled)?;
                        }
                        let output=if audio_only{&wav}else if config.audio.is_empty(){&video}else{
                            let mut child=tool("ffmpeg").args(["-nostdin","-hide_banner","-loglevel","error","-n","-i"]).arg(&video)
                                .arg("-i").arg(&wav).args(["-map","0:v:0","-map","1:a:0","-c:v","copy","-c:a","libopus","-b:a","192k"]).arg(&mux)
                                .spawn().map_err(|e|e.to_string())?;
                            wait(&mut child,&cancelled)?;
                            &mux
                        };
                        if cancelled.load(Ordering::Relaxed){return Err("Export cancelled".into());}
                        if destination.exists(){return Err("Export destination is already in use".into());}
                        std::fs::rename(output,destination).map_err(|e|e.to_string())?;
                        Ok(ExportReport{output_path:destination.to_string_lossy().into_owned(),frames_written:count,width:config.width,height:config.height,
                            fps:config.fps,elapsed_ms:started.elapsed().as_millis(),backend:if audio_only{"Media Foundation PCM"}else{"FFmpeg VP9"},audio_included:!config.audio.is_empty()})
                    })();
                    let _=ack.send(result);
                    break;
                }
            }
        }
    }
    if let Some(child)=encoder.as_mut(){let _=child.kill();let _=child.wait();}
    for path in [video,wav,mux]{let _=std::fs::remove_file(path);}
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::media::AudioSource;
    use std::sync::mpsc;

    #[test]
    fn native_delivery_preserves_vp9_alpha_and_mixes_pcm(){
        if tool("ffmpeg").arg("-version").output().is_err(){return;}
        let folder=std::env::temp_dir().join(format!("huelith-delivery-test-{}",std::process::id()));
        std::fs::create_dir(&folder).unwrap();
        let tone=folder.join("tone.wav");
        let status=tool("ffmpeg").args(["-hide_banner","-loglevel","error","-f","lavfi","-i","sine=f=440:d=1","-c:a","pcm_s16le"])
            .arg(&tone).status().unwrap();
        assert!(status.success());
        for extension in ["webm","wav"]{
            let output=folder.join(format!("delivery.{extension}"));
            let config=StreamConfig{output_path:output.to_string_lossy().into_owned(),width:32,height:32,fps:10,frame_count:10,bitrate:None,
                audio:vec![AudioSource{path:tone.to_string_lossy().into_owned(),start:0.,source_in:0.,duration:1.,volume:0.7,
                    fade_in:0.,fade_out:0.,pan:if extension=="wav"{-1.}else{0.},required:true,..Default::default()}]};
            let (tx,rx)=mpsc::channel();let (ready_tx,ready_rx)=mpsc::channel();
            let worker=std::thread::spawn(move||deliver(Path::new(&config.output_path),&config,rx,Arc::new(AtomicBool::new(false)),ready_tx));
            ready_rx.recv().unwrap().unwrap();
            if extension=="webm"{
                let rgba:Vec<_>=(0..32*32).flat_map(|pixel|if pixel%32<16{[0,0,0,0]}else{[216,69,130,255]}).collect();
                for index in 0..10 {
                    let (ack,reply)=mpsc::channel();tx.send(ExportPacket::Frame{index,rgba:rgba.clone(),ack}).unwrap();reply.recv().unwrap().unwrap();
                }
            }
            let (ack,reply)=mpsc::channel();tx.send(ExportPacket::Finish(ack)).unwrap();
            let report=reply.recv().unwrap().unwrap();worker.join().unwrap();
            assert!(report.audio_included);
            if extension=="webm"{
                let decoded=tool("ffmpeg").args(["-hide_banner","-loglevel","error","-c:v","libvpx-vp9","-i"]).arg(&output)
                    .args(["-map","0:v:0","-frames:v","1","-f","rawvideo","-pix_fmt","rgba","pipe:1"]).output().unwrap();
                assert!(decoded.status.success()&&decoded.stdout.len()==32*32*4);
                assert_eq!(decoded.stdout[(16*32+4)*4+3],0);
                assert_eq!(decoded.stdout[(16*32+24)*4+3],255);
                let decoded=tool("ffmpeg").args(["-hide_banner","-loglevel","error","-i"]).arg(&output)
                    .args(["-map","0:a:0","-f","s16le","pipe:1"]).output().unwrap();
                assert!(decoded.status.success()&&decoded.stdout.iter().any(|value|*value>10));
            }else{
                let bytes=std::fs::read(&output).unwrap();
                assert_eq!(&bytes[..4],b"RIFF");
                assert_eq!(u16::from_le_bytes(bytes[22..24].try_into().unwrap()),2);
                assert_eq!(u32::from_le_bytes(bytes[24..28].try_into().unwrap()),48000);
                assert_eq!(bytes.len(),44+48000*4);
                assert!(bytes[44..].chunks_exact(2).any(|value|i16::from_le_bytes(value.try_into().unwrap()).abs()>100));
                assert!(bytes[44..].chunks_exact(4).all(|frame|frame[2..4]==[0,0]));
            }
            std::fs::remove_file(output).unwrap();
        }
        std::fs::remove_file(tone).unwrap();
        std::fs::remove_dir(folder).unwrap();
    }
}

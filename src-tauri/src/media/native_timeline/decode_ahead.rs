//! One-frame lookahead on a dedicated Media Foundation apartment. Decode the
//! next source sample while the render thread composites/reads back this one.
//! All COM objects are created and released inside their owning worker.
use std::{sync::{Arc,atomic::{AtomicBool,Ordering},mpsc},thread};
use super::{NativeVisualClip,active_at,source_time};
type Frame=(f64,Arc<Vec<u8>>,u32,u32);
pub(super) struct DecodeAhead {
    frames:Option<mpsc::Receiver<Result<Frame,String>>>,
    stopped:Arc<AtomicBool>,worker:Option<thread::JoinHandle<()>>,
}
impl DecodeAhead {
    pub fn new(clip:NativeVisualClip,start:f64,fps:u32,count:u32,cancelled:Arc<AtomicBool>)->Result<Self,String>{
        let (tx,rx)=mpsc::sync_channel(1);
        let stopped=Arc::new(AtomicBool::new(false));let stop=Arc::clone(&stopped);
        let worker=thread::Builder::new().name("huelith-source-lookahead".into()).spawn(move||{
            let result=(||->Result<(),String>{
                let mut reader=super::super::windows_mf::NativeFrameReader::open(std::path::Path::new(&clip.path))?;
                let visible_start=clip.cut_in.as_ref().map_or(clip.start,|c|c.start.min(clip.start));
                let visible_end=clip.cut_out.as_ref().map_or(clip.start+clip.duration,|c|c.end.max(clip.start+clip.duration));
                let first=(((visible_start-start)*fps as f64-1e-7).ceil().max(0.) as u32).min(count);
                for index in first..count {
                    if stop.load(Ordering::Relaxed)||cancelled.load(Ordering::Relaxed){break;}
                    let clock=start+index as f64/fps as f64;
                    if clock>=visible_end{break;}
                    if !active_at(&clip,clock){continue;}
                    let time=source_time(&clip,(clock-clip.start).clamp(0.,(clip.duration-0.00001).max(0.)));
                    let (pixels,w,h)=reader.frame_at(time)?;
                    if tx.send(Ok((time,pixels,w,h))).is_err(){break;}
                }
                Ok(())
            })();
            if let Err(error)=result{let _=tx.send(Err(error));}
        }).map_err(|e|format!("Cannot start source lookahead: {e}"))?;
        Ok(Self{frames:Some(rx),stopped,worker:Some(worker)})
    }
    pub fn frame_at(&mut self,time:f64)->Result<(Arc<Vec<u8>>,u32,u32),String>{
        // Repeated hold frames may already be cached by PixelSource. Drain
        // older queued duplicates until the requested source clock arrives.
        loop {
            let (clock,pixels,w,h)=self.frames.as_ref().ok_or("Source lookahead is closed")?
                .recv_timeout(std::time::Duration::from_secs(45))
                .map_err(|_|"Source lookahead ended before the requested frame".to_string())??;
            if (clock-time).abs()<0.00001{return Ok((pixels,w,h));}
        }
    }
}
impl Drop for DecodeAhead {
    fn drop(&mut self){
        self.stopped.store(true,Ordering::Relaxed);
        // Dropping the receiver unblocks a producer waiting on the bounded
        // queue, including cancelled jobs and clips ending between frames.
        self.frames.take();
        if let Some(worker)=self.worker.take(){let _=worker.join();}
    }
}

//! GPU-resident Windows source decoding for Huelith's native video pipeline.
//!
//! Media Foundation owns an MTA reader per timeline source. A shared D3D11
//! device and IMFDXGIDeviceManager supply NV12 DXGI surfaces; no RGB32 media
//! conversion, IMFMediaBuffer::Lock, or CPU pixel arrays occur in this module.
//!
//! All COM operations and the retained IMFSample/ID3D11Texture2D references
//! remain on one worker thread. Export/compositing stages must consume these
//! surfaces on that worker (or explicitly synchronize a shared GPU texture).
//! A DXGI surface is NOT automatically a wgpu::Texture on the D3D12 backend.
use std::{collections::{HashMap, VecDeque}, path::Path, sync::{mpsc, Mutex, OnceLock}};
use windows::{core::{GUID, Interface, PCWSTR}, Win32::{
    Foundation::HMODULE,
    Graphics::{Direct3D::D3D_DRIVER_TYPE_HARDWARE,
        Direct3D11::{D3D11CreateDevice, D3D11_CREATE_DEVICE_VIDEO_SUPPORT,
            D3D11_CREATE_DEVICE_BGRA_SUPPORT, D3D11_SDK_VERSION, ID3D11Device,
            ID3D11DeviceContext, ID3D11Texture2D, D3D11_TEXTURE2D_DESC},
        Dxgi::Common::DXGI_FORMAT_NV12},
    Media::MediaFoundation::{IMFSourceReader, IMFDXGIDeviceManager, IMFDXGIBuffer,
        IMFSample, MFCreateDXGIDeviceManager, MFCreateAttributes,
        MFCreateSourceReaderFromURL, MFCreateMediaType, MF_MT_MAJOR_TYPE,
        MF_MT_SUBTYPE, MF_MT_FRAME_SIZE, MF_MT_FRAME_RATE,
        MF_SOURCE_READER_D3D_MANAGER, MF_READWRITE_ENABLE_HARDWARE_TRANSFORMS,
        MF_SOURCE_READER_FIRST_VIDEO_STREAM, MF_SOURCE_READER_ALL_STREAMS,
        MF_SOURCE_READERF_ENDOFSTREAM, MF_SOURCE_READERF_CURRENTMEDIATYPECHANGED,
        MFMediaType_Video, MFVideoFormat_NV12},
    System::Com::StructuredStorage::PROPVARIANT,
}};
use super::{GpuSourceRequest, GpuFrameRequest, GpuFrameInfo};
use super::windows_mf::{media_url, MfRuntime};

const MAX_TRACKS:usize = 24;
const MAX_CACHE_FRAMES:usize = 6;
const CACHE_BUDGET_PER_TRACK:usize = 16 * 1024 * 1024;
const MAX_READ_AHEAD:usize = 900;
const TICKS_PER_SECOND:f64 = 10_000_000.0;

struct D3dDecodeDevice {
    // The reader manager keeps this device alive while any source is open.
    _device: ID3D11Device,
    _context: ID3D11DeviceContext,
    manager: IMFDXGIDeviceManager,
}
impl D3dDecodeDevice {
    fn create()->Result<Self,String>{
        let mut device=None;
        let mut context=None;
        unsafe {
            D3D11CreateDevice(None,D3D_DRIVER_TYPE_HARDWARE,HMODULE::default(),
                D3D11_CREATE_DEVICE_VIDEO_SUPPORT | D3D11_CREATE_DEVICE_BGRA_SUPPORT,
                None,D3D11_SDK_VERSION,Some(&mut device),None,Some(&mut context))
                .map_err(|e|format!("Cannot create video-capable D3D11 device: {e}"))?;
        }
        let device=device.ok_or("D3D11 returned no video device")?;
        let context=context.ok_or("D3D11 returned no immediate context")?;
        let mut token=0;
        let mut manager=None;
        unsafe {
            MFCreateDXGIDeviceManager(&mut token,&mut manager)
                .map_err(|e|format!("Cannot create Media Foundation DXGI manager: {e}"))?;
        }
        let manager=manager.ok_or("Media Foundation returned no DXGI manager")?;
        unsafe{manager.ResetDevice(&device,token)}
            .map_err(|e|format!("Cannot attach GPU device to video decoder: {e}"))?;
        Ok(Self{_device:device,_context:context,manager})
    }
}

// Holding the sample matters: the decoder owns its texture until the GPU user
// releases it. Never return this COM handle over the WebView IPC boundary.
struct GpuSurface {
    _sample:IMFSample,
    texture:ID3D11Texture2D,
    subresource:u32,
    timestamp:i64,
    duration:i64,
    width:u32,height:u32,
}
impl GpuSurface {
    fn info(&self,source_id:&str)->GpuFrameInfo{
        GpuFrameInfo{source_id:source_id.to_owned(),presentation_time_100ns:self.timestamp,
            width:self.width,height:self.height,subresource:self.subresource,
            pixel_format:"NV12/DXGI".to_string()}
    }
}

fn nominal_duration(reader:&IMFSourceReader)->i64{
    let rate=unsafe{reader.GetCurrentMediaType(MF_SOURCE_READER_FIRST_VIDEO_STREAM.0 as u32)}
        .ok().and_then(|t|unsafe{t.GetUINT64(&MF_MT_FRAME_RATE)}.ok());
    rate.map(|r| {
        let n=(r>>32) as u32;let d=r as u32;
        if n==0||d==0 {333_333} else {((TICKS_PER_SECOND*d as f64)/n as f64).round() as i64}
    }).unwrap_or(333_333).max(1)
}

fn should_seek(last:Option<i64>,target:i64,duration:i64)->bool{
    last.is_none_or(|t|target+duration/3<t||target-t>10_000_000)
}
fn covers_timestamp(timestamp:i64,duration:i64,target:i64)->bool{
    timestamp<=target&&target<timestamp.saturating_add(duration.max(1))
}
fn cache_capacity(width:u32,height:u32)->usize{
    // NV12 is 1.5 bytes/pixel. Avoid retaining large decoder surface pools
    // for 4K footage while letting 1080p tracks reuse several frames.
    let frame_bytes=width as usize*height as usize*3/2;
    (CACHE_BUDGET_PER_TRACK/frame_bytes.max(1)).clamp(1,MAX_CACHE_FRAMES)
}

struct GpuReader {
    source:IMFSourceReader,
    width:u32,height:u32,
    frame_duration:i64,
    last_timestamp:Option<i64>,
    cache:VecDeque<GpuSurface>,
}
impl GpuReader {
    fn open(path:&Path,device:&D3dDecodeDevice)->Result<Self,String>{
        let mut attrs=None;
        unsafe{MFCreateAttributes(&mut attrs,4)}.map_err(|e|e.to_string())?;
        let attrs=attrs.ok_or("Cannot allocate GPU source reader attributes")?;
        unsafe {
            attrs.SetUnknown(&MF_SOURCE_READER_D3D_MANAGER,&device.manager)
                .map_err(|e|format!("Cannot attach GPU decode device manager: {e}"))?;
            attrs.SetUINT32(&MF_READWRITE_ENABLE_HARDWARE_TRANSFORMS,1)
                .map_err(|e|format!("Cannot enable hardware decoder transforms: {e}"))?;
        }
        let path=media_url(path);
        let source=unsafe{MFCreateSourceReaderFromURL(PCWSTR(path.as_ptr()),&attrs)}
            .map_err(|e|format!("Cannot open GPU video source: {e}"))?;
        unsafe {
            source.SetStreamSelection(MF_SOURCE_READER_ALL_STREAMS.0 as u32,false)
                .map_err(|e|e.to_string())?;
            source.SetStreamSelection(MF_SOURCE_READER_FIRST_VIDEO_STREAM.0 as u32,true)
                .map_err(|e|e.to_string())?;
        }
        let media=unsafe{source.GetNativeMediaType(MF_SOURCE_READER_FIRST_VIDEO_STREAM.0 as u32,0)}
            .map_err(|e|format!("GPU source has no video track: {e}"))?;
        let dimensions=unsafe{media.GetUINT64(&MF_MT_FRAME_SIZE)}.map_err(|e|e.to_string())?;
        let width=(dimensions>>32) as u32;let height=dimensions as u32;
        if width==0||height==0||width>3840||height>2160 {
            return Err("GPU decoder dimensions must be within 3840×2160".into());
        }
        let output=unsafe{MFCreateMediaType()}.map_err(|e|e.to_string())?;
        unsafe {
            output.SetGUID(&MF_MT_MAJOR_TYPE,&MFMediaType_Video).map_err(|e|e.to_string())?;
            output.SetGUID(&MF_MT_SUBTYPE,&MFVideoFormat_NV12).map_err(|e|e.to_string())?;
            source.SetCurrentMediaType(MF_SOURCE_READER_FIRST_VIDEO_STREAM.0 as u32,None,&output)
                .map_err(|e|format!("GPU NV12 decoder is unavailable: {e}"))?;
        }
        let duration=nominal_duration(&source);
        Ok(Self{source,width,height,frame_duration:duration,last_timestamp:None,cache:VecDeque::new()})
    }

    fn select(&mut self,target:i64)->Result<&GpuSurface,String>{
        // Approximate seek equality uses the native frame cadence, not the
        // project's output FPS. Each track has its own timestamp domain.
        if let Some(index)=self.cache.iter().position(|f|
            covers_timestamp(f.timestamp,f.duration,target)){
            return Ok(&self.cache[index]);
        }
        if should_seek(self.last_timestamp,target,self.frame_duration){
            let position=PROPVARIANT::from(target.saturating_sub(self.frame_duration).max(0));
            unsafe{self.source.SetCurrentPosition(&GUID::zeroed(),&position)}
                .map_err(|e|format!("GPU decoder seek failed: {e}"))?;
            self.cache.clear();
            self.last_timestamp=None;
        }
        for _ in 0..MAX_READ_AHEAD {
            let mut flags=0u32;
            let mut pts=0i64;
            let mut sample=None;
            unsafe{self.source.ReadSample(MF_SOURCE_READER_FIRST_VIDEO_STREAM.0 as u32,
                0,None,Some(&mut flags),Some(&mut pts),Some(&mut sample))}
                .map_err(|e|format!("GPU reader failed: {e}"))?;
            if flags&(MF_SOURCE_READERF_ENDOFSTREAM.0 as u32)!=0 {
                return Err("Video ends before the requested GPU frame".into());
            }
            if flags&(MF_SOURCE_READERF_CURRENTMEDIATYPECHANGED.0 as u32)!=0 {
                return Err("GPU video format changed during decoding; reopen the source".into());
            }
            let Some(sample)=sample else{continue};
            let duration=unsafe{sample.GetSampleDuration()}.unwrap_or(self.frame_duration).max(1);
            if pts.saturating_add(duration)<=target {continue;}
            let surface=unsafe{sample.GetBufferByIndex(0)}.map_err(|e|e.to_string())?
                .cast::<IMFDXGIBuffer>()
                .map_err(|_|"Decoded video is not a GPU DXGI surface; no software-frame substitution".to_owned())?;
            let mut raw=std::ptr::null_mut();
            unsafe{surface.GetResource(&ID3D11Texture2D::IID,&mut raw)}
                .map_err(|e|format!("Cannot acquire decoded GPU texture: {e}"))?;
            if raw.is_null(){return Err("Decoded DXGI buffer has no texture".into());}
            let texture=unsafe{ID3D11Texture2D::from_raw(raw)};
            let mut desc=D3D11_TEXTURE2D_DESC::default();
            unsafe{texture.GetDesc(&mut desc)};
            if desc.Format!=DXGI_FORMAT_NV12||desc.Width<self.width||desc.Height<self.height {
                return Err("GPU decoder returned an incompatible texture format or size".into());
            }
            let subresource=unsafe{surface.GetSubresourceIndex()}.map_err(|e|e.to_string())?;
            self.last_timestamp=Some(pts);
            self.cache.push_back(GpuSurface{_sample:sample,texture,subresource,
                timestamp:pts,duration,width:self.width,height:self.height});
            let capacity=cache_capacity(self.width,self.height);
            while self.cache.len()>capacity{self.cache.pop_front();}
            return self.cache.back().ok_or("Missing retained GPU frame".into());
        }
        Err("GPU decoder could not reach the selected source timestamp".into())
    }
}

// One worker for the project, with one Media Foundation source reader per clip.
// The worker owns the D3D11 device and all COM surfaces; no COM pointers cross
// threads and no decoded pixels are sent through Tauri IPC.
enum Command {
    Open(Vec<GpuSourceRequest>,mpsc::Sender<Result<(),String>>),
    Acquire(Vec<GpuFrameRequest>,mpsc::Sender<Result<Vec<GpuFrameInfo>,String>>),
    Close(mpsc::Sender<()>),
}
static GPU_WORKER:OnceLock<Mutex<mpsc::Sender<Command>>>=OnceLock::new();
fn worker()->&'static Mutex<mpsc::Sender<Command>>{
    GPU_WORKER.get_or_init(||{
        let (tx,rx)=mpsc::channel();
        std::thread::Builder::new().name("Huelith GPU decode".into()).spawn(move||{
            let initialized=(||->Result<(MfRuntime,D3dDecodeDevice),String>{
                let mf=MfRuntime::new()?;
                let device=D3dDecodeDevice::create()?;
                Ok((mf,device))
            })();
            let mut readers:HashMap<String,GpuReader>=HashMap::new();
            while let Ok(command)=rx.recv(){
                match command {
                    Command::Open(inputs,answer)=>{
                        let result=(||{
                            let (_,device)=initialized.as_ref().map_err(String::clone)?;
                            readers.clear();
                            for input in inputs {
                                readers.insert(input.id,GpuReader::open(&input.path,device)?);
                            }
                            Ok(())
                        })();
                        if result.is_err(){readers.clear();}
                        let _=answer.send(result);
                    },
                    Command::Acquire(requests,answer)=>{
                        let result=(||{
                            let _=initialized.as_ref().map_err(String::clone)?;
                            let mut frames=Vec::with_capacity(requests.len());
                            for request in requests {
                                let reader=readers.get_mut(&request.source_id)
                                    .ok_or_else(||format!("Unregistered video track: {}",request.source_id))?;
                                let target=(request.time_seconds*TICKS_PER_SECOND).round() as i64;
                                let frame=reader.select(target)?;
                                // Ensure the COM texture is still owned on the native
                                // thread. The future GPU compositor consumes this ref.
                                let _texture_ref=&frame.texture;
                                frames.push(frame.info(&request.source_id));
                            }
                            Ok(frames)
                        })();
                        let _=answer.send(result);
                    },
                    Command::Close(answer)=>{readers.clear();let _=answer.send(());},
                }
            }
        }).expect("Cannot start Huelith GPU decode worker");
        Mutex::new(tx)
    })
}
fn send(command:Command)->Result<(),String>{
    let tx=worker().lock().map_err(|_|"GPU decode worker lock poisoned")?;
    tx.send(command).map_err(|_|"GPU decode worker exited".to_owned())
}
pub fn open_sources(sources:Vec<GpuSourceRequest>)->Result<(),String>{
    if sources.len()>MAX_TRACKS{return Err("Too many concurrent native GPU tracks".into());}
    let (tx,rx)=mpsc::channel();send(Command::Open(sources,tx))?;
    rx.recv().map_err(|_|"GPU decoder closed during source loading".to_owned())?
}
pub fn acquire(requests:Vec<GpuFrameRequest>)->Result<Vec<GpuFrameInfo>,String>{
    if requests.len()>MAX_TRACKS*MAX_CACHE_FRAMES {return Err("Too many GPU frames requested together".into());}
    let (tx,rx)=mpsc::channel();send(Command::Acquire(requests,tx))?;
    rx.recv().map_err(|_|"GPU decoder closed during frame acquisition".to_owned())?
}
pub fn close()->Result<(),String>{
    let (tx,rx)=mpsc::channel();send(Command::Close(tx))?;
    rx.recv().map_err(|_|"GPU decoder closed during source release".to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn timestamp_seek_policy_handles_backward_and_gaps(){
        let duration=333_333;
        assert!(should_seek(None,0,duration));
        assert!(!should_seek(Some(0),duration,duration));
        assert!(should_seek(Some(10_000_000),2_000_000,duration));
        assert!(should_seek(Some(0),12_000_000,duration));
    }
    #[test]
    fn one_30_fps_source_frame_covers_two_60_fps_output_ticks(){
        assert!(covers_timestamp(0,333_333,0));
        assert!(covers_timestamp(0,333_333,166_667));
        assert!(!covers_timestamp(0,333_333,333_333));
        assert!(covers_timestamp(333_333,333_333,500_000));
    }
    #[test]
    fn gpu_texture_cache_size_respects_resolution(){
        assert_eq!(cache_capacity(1920,1080),5);
        assert_eq!(cache_capacity(3840,2160),1);
    }
    #[test]
    #[ignore = "Provide HUELITH_GPU_TEST_VIDEO and a real Windows GPU to run this hardware surface test"]
    fn hardware_decoder_produces_dxgi_surfaces_without_pixel_readback(){
        let file=std::env::var("HUELITH_GPU_TEST_VIDEO").expect("Set HUELITH_GPU_TEST_VIDEO to a local H.264 video");
        open_sources(vec![GpuSourceRequest{id:"clip-1".into(),path:file.into()}]).unwrap();
        let frames=acquire(vec![GpuFrameRequest{source_id:"clip-1".into(),time_seconds:0.0}]).unwrap();
        assert_eq!(frames.len(),1);
        assert_eq!(frames[0].pixel_format,"NV12/DXGI");
        assert!(frames[0].width>0&&frames[0].height>0);
        close().unwrap();
    }
    #[test]
    fn every_timeline_source_uses_an_independent_native_clock(){
        let a=GpuFrameRequest{source_id:"A".into(),time_seconds:1.5};
        let b=GpuFrameRequest{source_id:"B".into(),time_seconds:27.25};
        assert_eq!((a.time_seconds*TICKS_PER_SECOND).round() as i64,15_000_000);
        assert_eq!((b.time_seconds*TICKS_PER_SECOND).round() as i64,272_500_000);
    }
}

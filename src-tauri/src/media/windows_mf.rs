//! Windows-only decoder and H.264/MP4 sink writer. No FFmpeg or external child process.
//! Windows Media Foundation APIs are used on a single MTA thread for each invocation.
//! Streaming H.264 video and explicitly resampled/mixed AAC audio share a clock.
use std::os::windows::ffi::OsStrExt;
use std::io::Read;
use std::path::Path;
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use windows::core::{PCWSTR, Interface, GUID};
use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_MULTITHREADED};
use windows::Win32::System::Com::StructuredStorage::PROPVARIANT;
use windows::Win32::Media::MediaFoundation::*;
use super::{check_dimensions, ExportReport, PreviewFrame, VideoInfo};

pub(super) fn available() -> bool { MfRuntime::new().is_ok() }

fn wide(path: &Path) -> Vec<u16> {
    path.as_os_str().encode_wide().chain(std::iter::once(0)).collect()
}
fn media_url(path:&Path)->Vec<u16>{
    // Win32 canonicalization adds an extended-path prefix. MF's URL resolver
    // treats that prefix as a network URL, even though File::open accepts it.
    // Keep canonical paths for file operations and pass ordinary drive/UNC
    // syntax only to the MF source reader and sink writer URL entry points.
    let value=path.as_os_str().to_string_lossy();
    let url=if let Some(unc)=value.strip_prefix(r"\\?\UNC\"){format!(r"\\{unc}")}
        else{value.strip_prefix(r"\\?\").unwrap_or(&value).to_owned()};
    url.encode_utf16().chain(std::iter::once(0)).collect()
}
fn media_error(prefix: &str, err: impl std::fmt::Display) -> String { format!("{prefix}: {err}") }
fn rate_pair(value: u64) -> (u32, u32) { ((value >> 32) as u32, (value & 0xffff_ffff) as u32) }
fn packed_pair(a: u32, b: u32) -> u64 { (u64::from(a) << 32) | u64::from(b) }
fn publish_mp4(temporary:&Path,destination:&Path)->Result<(),String>{
    use windows::Win32::Storage::FileSystem::{MoveFileExW,MOVEFILE_WRITE_THROUGH};
    let from=wide(temporary);let to=wide(destination);
    // No REPLACE_EXISTING flag: even two concurrent exports cannot overwrite
    // an output that appeared after the initial existence check.
    unsafe{MoveFileExW(PCWSTR(from.as_ptr()),PCWSTR(to.as_ptr()),MOVEFILE_WRITE_THROUGH)}
        .map_err(|e|media_error("Could not publish MP4 without overwriting another file",e))
}
fn get_dimensions(media_type: &IMFMediaType) -> Result<(u32, u32), String> {
    let (w, h) = rate_pair(unsafe { media_type.GetUINT64(&MF_MT_FRAME_SIZE) }
        .map_err(|e| media_error("Media dimensions unavailable", e))?);
    if w == 0 || h == 0 || w > 3840 || h > 2160 {
        return Err("Media dimensions exceed the Stage B decoder limits".into());
    }
    Ok((w, h))
}

struct MfRuntime { started: bool }
impl MfRuntime {
    fn new() -> Result<Self, String> {
        unsafe {
            CoInitializeEx(None, COINIT_MULTITHREADED).ok().map_err(|e| media_error("COM initialization failed", e))?;
            if let Err(err) = MFStartup(MF_VERSION, 0) {
                CoUninitialize();
                return Err(media_error("Media Foundation startup failed", err));
            }
        }
        Ok(Self { started: true })
    }
}
impl Drop for MfRuntime {
    fn drop(&mut self) {
        if self.started { unsafe { let _ = MFShutdown(); CoUninitialize(); } }
    }
}

fn open_reader(path: &Path) -> Result<IMFSourceReader, String> {
    let url = media_url(path);
    unsafe {
        let mut attributes = None;
        MFCreateAttributes(&mut attributes, 1).map_err(|e|e.to_string())?;
        let attributes=attributes.ok_or("Cannot create decoder attributes")?;
        attributes.SetUINT32(&MF_SOURCE_READER_ENABLE_VIDEO_PROCESSING, 1).map_err(|e|e.to_string())?;
        MFCreateSourceReaderFromURL(PCWSTR(url.as_ptr()), &attributes)
    }
        .map_err(|e| media_error("Could not open this file using native Windows decoding", e))
}

fn native_video_type(reader: &IMFSourceReader) -> Result<IMFMediaType, String> {
    unsafe { reader.GetNativeMediaType(MF_SOURCE_READER_FIRST_VIDEO_STREAM.0 as u32, 0) }
        .map_err(|e| media_error("No supported video stream found", e))
}

fn video_info(native: &IMFMediaType) -> Result<VideoInfo, String> {
    let (width, height) = get_dimensions(native)?;
    let (num, den) = unsafe { native.GetUINT64(&MF_MT_FRAME_RATE) }.map(rate_pair).unwrap_or((0, 1));
    Ok(VideoInfo { width, height, frame_rate_numerator: num,
        frame_rate_denominator: den.max(1), pixel_format: "Native Media Foundation video".into(),
        duration_100ns: None })
}

pub fn probe(path: &Path) -> Result<VideoInfo, String> {
    let _runtime = MfRuntime::new()?;
    let reader = open_reader(path)?;
    let mut info=video_info(&native_video_type(&reader)?)?;
    info.duration_100ns=unsafe{reader.GetPresentationAttribute(MF_SOURCE_READER_MEDIASOURCE.0 as u32,&MF_PD_DURATION)}
        .ok().and_then(|v|u64::try_from(&v).ok());
    Ok(info)
}

/// Configure an RGB32 software-decoded output. Media Foundation may reject a
/// file if the operating system does not provide a decoder for its codec.
fn configure_rgb_reader(reader: &IMFSourceReader) -> Result<(u32, u32, u32), String> {
    let source = native_video_type(reader)?;
    let (width, height) = get_dimensions(&source)?;
    let (n, d) = unsafe { source.GetUINT64(&MF_MT_FRAME_RATE) }.map(rate_pair).unwrap_or((30, 1));
    let fps = if n == 0 || d == 0 { 30 } else { ((n as f64 / d as f64).round() as u32).clamp(1, 120) };
    unsafe {
        reader.SetStreamSelection(MF_SOURCE_READER_ALL_STREAMS.0 as u32, false)
            .map_err(|e| media_error("Cannot select video stream", e))?;
        reader.SetStreamSelection(MF_SOURCE_READER_FIRST_VIDEO_STREAM.0 as u32, true)
            .map_err(|e| media_error("Cannot enable video stream", e))?;
        let fmt = MFCreateMediaType().map_err(|e| e.to_string())?;
        fmt.SetGUID(&MF_MT_MAJOR_TYPE, &MFMediaType_Video).map_err(|e| e.to_string())?;
        fmt.SetGUID(&MF_MT_SUBTYPE, &MFVideoFormat_RGB32).map_err(|e| e.to_string())?;
        reader.SetCurrentMediaType(MF_SOURCE_READER_FIRST_VIDEO_STREAM.0 as u32, None, &fmt)
            .map_err(|e| media_error("Windows cannot convert this video to RGB32", e))?;
    }
    Ok((width, height, fps))
}

/// RGB32 from Media Foundation is a B,G,R,unused-byte image. Row orientation
/// is made explicit so the renderer receives top-down RGBA regardless of sink.
fn decoded_stride(reader:&IMFSourceReader,width:u32)->i32{
    unsafe{reader.GetCurrentMediaType(MF_SOURCE_READER_FIRST_VIDEO_STREAM.0 as u32)}.ok()
        .and_then(|m|unsafe{m.GetUINT32(&MF_MT_DEFAULT_STRIDE)}.ok()).map(|v|v as i32).unwrap_or(-(width as i32*4))
}
fn copy_rgb_sample(sample: &IMFSample, width: u32, height: u32, default_stride:i32) -> Result<Vec<u8>, String> {
    let required = (width as usize).checked_mul(height as usize).and_then(|n| n.checked_mul(4))
        .ok_or("RGB32 frame overflow")?;
    let buffer = unsafe { sample.ConvertToContiguousBuffer() }.map_err(|e| e.to_string())?;
    if let Ok(two_d)=buffer.cast::<IMF2DBuffer>() {
        let mut row_zero=std::ptr::null_mut();let mut pitch=0i32;
        unsafe{two_d.Lock2D(&mut row_zero,&mut pitch)}.map_err(|e|e.to_string())?;
        let result=(||{
            if row_zero.is_null()||pitch.unsigned_abs()<(width*4)||pitch.unsigned_abs()>40_000_000{return Err("Invalid decoded image stride".to_string());}
            let mut rgba=vec![0;required];
            for y in 0..height as usize {for x in 0..width as usize {
                let pixel=unsafe{row_zero.offset(y as isize*pitch as isize).add(x*4)};
                let d=(y*width as usize+x)*4;
                unsafe{rgba[d]=*pixel.add(2);rgba[d+1]=*pixel.add(1);rgba[d+2]=*pixel;rgba[d+3]=255;}
            }}
            Ok(rgba)
        })();
        let _=unsafe{two_d.Unlock2D()};return result;
    }
    let len = unsafe { buffer.GetCurrentLength() }.map_err(|e| e.to_string())? as usize;
    if len < required || len > 40_000_000 { return Err("Decoded buffer size is inconsistent with video dimensions".into()); }
    let mut ptr = std::ptr::null_mut();
    unsafe { buffer.Lock(&mut ptr, None, None) }.map_err(|e| e.to_string())?;
    let result = (|| {
        if ptr.is_null() { return Err("Decoded frame buffer is null".to_string()); }
        let bytes = unsafe { std::slice::from_raw_parts(ptr, len) };
        let mut rgba = vec![0u8; required];
        let stride = default_stride.unsigned_abs() as usize;
        if stride<width as usize*4||stride*height as usize>len{return Err("Decoded RGB stride exceeds its buffer".into());}
        for y in 0..height as usize {
            let row = if default_stride<0{height as usize-1-y}else{y} * stride;
            let dst = y * width as usize*4;
            for x in 0..width as usize {
                let s = row + x * 4;
                let d = dst + x * 4;
                rgba[d] = bytes[s+2]; rgba[d+1] = bytes[s+1]; rgba[d+2] = bytes[s]; rgba[d+3] = 255;
            }
        }
        Ok(rgba)
    })();
    let _ = unsafe { buffer.Unlock() };
    result
}

pub fn decode_preview(path: &Path) -> Result<PreviewFrame, String> {
    let _runtime = MfRuntime::new()?;
    let reader = open_reader(path)?;
    let (width, height, _) = configure_rgb_reader(&reader)?;
    for _ in 0..64 {
        let mut flags = 0u32;
        let mut sample = None;
        unsafe { reader.ReadSample(MF_SOURCE_READER_FIRST_VIDEO_STREAM.0 as u32, 0, None,
            Some(&mut flags), None, Some(&mut sample)) }.map_err(|e| e.to_string())?;
        if flags & (MF_SOURCE_READERF_ENDOFSTREAM.0 as u32) != 0 { break; } // MF_SOURCE_READERF_ENDOFSTREAM
        if let Some(frame) = sample {
            let rgba = copy_rgb_sample(&frame, width, height,decoded_stride(&reader,width))?;
            let scale = f64::min(640.0 / width as f64, 360.0 / height as f64).min(1.0);
            let out_w = (width as f64 * scale).floor().max(1.0) as u32;
            let out_h = (height as f64 * scale).floor().max(1.0) as u32;
            let mut resized = vec![0u8; out_w as usize * out_h as usize * 4];
            for y in 0..out_h as usize {
                let sy = y * height as usize / out_h as usize;
                for x in 0..out_w as usize {
                    let sx = x * width as usize / out_w as usize;
                    let src = (sy * width as usize + sx) * 4;
                    let dst = (y * out_w as usize + x) * 4;
                    resized[dst..dst+4].copy_from_slice(&rgba[src..src+4]);
                }
            }
            return Ok(PreviewFrame { width: out_w, height: out_h, rgba: resized });
        }
    }
    Err("No decodable video frames found".into())
}

/// A deliberately narrow encoder: H.264/MP4 with RGB32 input. Video effects
/// and the timeline compositor will supply frames through this interface later.
struct Encoder {
    writer: IMFSinkWriter,
    stream: u32,
    width: u32,
    height: u32,
    fps: u32,
    audio_stream: Option<u32>,
}
impl Encoder {
    fn new(path: &Path, width: u32, height: u32, fps: u32) -> Result<Self, String> {
        Self::new_av(path,width,height,fps,false,None)
    }
    fn new_av(path:&Path,width:u32,height:u32,fps:u32,audio:bool,bitrate:Option<u32>)->Result<Self,String>{
        check_dimensions(width,height,fps,1)?;
        let wide_output = media_url(path);
        unsafe {
            let writer = MFCreateSinkWriterFromURL(PCWSTR(wide_output.as_ptr()),
                None::<&IMFByteStream>, None::<&IMFAttributes>)
                .map_err(|e| media_error("Windows MP4 sink initialization failed", e))?;
            let out = MFCreateMediaType().map_err(|e| e.to_string())?;
            out.SetGUID(&MF_MT_MAJOR_TYPE, &MFMediaType_Video).map_err(|e| e.to_string())?;
            out.SetGUID(&MF_MT_SUBTYPE, &MFVideoFormat_H264).map_err(|e| e.to_string())?;
            out.SetUINT32(&MF_MT_AVG_BITRATE, bitrate.unwrap_or((width as u64 * height as u64 * fps as u64 / 15).clamp(2_000_000, 30_000_000) as u32))
                .map_err(|e| e.to_string())?;
            out.SetUINT32(&MF_MT_INTERLACE_MODE, 2).map_err(|e| e.to_string())?;
            out.SetUINT64(&MF_MT_FRAME_SIZE, packed_pair(width,height)).map_err(|e| e.to_string())?;
            out.SetUINT64(&MF_MT_FRAME_RATE, packed_pair(fps,1)).map_err(|e| e.to_string())?;
            out.SetUINT64(&MF_MT_PIXEL_ASPECT_RATIO, packed_pair(1,1)).map_err(|e| e.to_string())?;
            let stream = writer.AddStream(&out).map_err(|e| media_error("H.264 stream unavailable",e))?;
            let input = MFCreateMediaType().map_err(|e| e.to_string())?;
            input.SetGUID(&MF_MT_MAJOR_TYPE, &MFMediaType_Video).map_err(|e| e.to_string())?;
            input.SetGUID(&MF_MT_SUBTYPE, &MFVideoFormat_RGB32).map_err(|e| e.to_string())?;
            input.SetUINT32(&MF_MT_DEFAULT_STRIDE,width*4).map_err(|e|e.to_string())?;
            input.SetUINT32(&MF_MT_INTERLACE_MODE,2).map_err(|e| e.to_string())?;
            input.SetUINT64(&MF_MT_FRAME_SIZE, packed_pair(width,height)).map_err(|e| e.to_string())?;
            input.SetUINT64(&MF_MT_FRAME_RATE, packed_pair(fps,1)).map_err(|e| e.to_string())?;
            input.SetUINT64(&MF_MT_PIXEL_ASPECT_RATIO, packed_pair(1,1)).map_err(|e| e.to_string())?;
            writer.SetInputMediaType(stream, &input, None::<&IMFAttributes>)
                .map_err(|e| media_error("RGB32 input conversion unavailable", e))?;
            let audio_stream=if audio {
                let output=MFCreateMediaType().map_err(|e|e.to_string())?;
                output.SetGUID(&MF_MT_MAJOR_TYPE,&MFMediaType_Audio).map_err(|e|e.to_string())?;
                output.SetGUID(&MF_MT_SUBTYPE,&MFAudioFormat_AAC).map_err(|e|e.to_string())?;
                output.SetUINT32(&MF_MT_AUDIO_NUM_CHANNELS,2).map_err(|e|e.to_string())?;
                output.SetUINT32(&MF_MT_AUDIO_SAMPLES_PER_SECOND,48_000).map_err(|e|e.to_string())?;
                output.SetUINT32(&MF_MT_AUDIO_BITS_PER_SAMPLE,16).map_err(|e|e.to_string())?;
                output.SetUINT32(&MF_MT_AUDIO_AVG_BYTES_PER_SECOND,24_000).map_err(|e|e.to_string())?;
                output.SetUINT32(&MF_MT_AAC_PAYLOAD_TYPE,0).map_err(|e|e.to_string())?;
                let audio_index=writer.AddStream(&output).map_err(|e|media_error("AAC encoder is unavailable",e))?;
                let pcm=pcm_media_type(48_000,2)?;
                writer.SetInputMediaType(audio_index,&pcm,None::<&IMFAttributes>).map_err(|e|media_error("PCM-to-AAC conversion unavailable",e))?;
                Some(audio_index)
            }else{None};
            writer.BeginWriting().map_err(|e| media_error("H.264 encoder could not start", e))?;
            Ok(Self { writer, stream, width,height,fps,audio_stream })
        }
    }
    fn write_rgba(&self, rgba: &[u8], frame_index: u32) -> Result<(), String> {
        let stride = self.width as usize * 4;
        let len = stride * self.height as usize;
        if rgba.len() != len { return Err("Frame data is not width × height × RGBA".into()); }
        unsafe {
            let buf = MFCreateMemoryBuffer(len as u32).map_err(|e| e.to_string())?;
            let mut ptr = std::ptr::null_mut();
            buf.Lock(&mut ptr, None, None).map_err(|e| e.to_string())?;
            if ptr.is_null() { let _ = buf.Unlock(); return Err("Encoder buffer is null".into()); }
            // Explicit positive stride: top-down BGRX, alpha composited on black.
            for y in 0..self.height as usize {
                for x in 0..self.width as usize {
                    let src = (y * self.width as usize + x) * 4;
                    let dst = src;
                    let a = u16::from(rgba[src+3]);
                    *ptr.add(dst) = ((u16::from(rgba[src+2]) * a + 127) / 255) as u8;
                    *ptr.add(dst+1) = ((u16::from(rgba[src+1]) * a + 127) / 255) as u8;
                    *ptr.add(dst+2) = ((u16::from(rgba[src]) * a + 127) / 255) as u8;
                    *ptr.add(dst+3) = 0;
                }
            }
            buf.Unlock().map_err(|e| e.to_string())?;
            buf.SetCurrentLength(len as u32).map_err(|e| e.to_string())?;
            let sample = MFCreateSample().map_err(|e| e.to_string())?;
            sample.AddBuffer(&buf).map_err(|e| e.to_string())?;
            let timestamp = (frame_index as i64) * 10_000_000 / i64::from(self.fps);
            let next = (frame_index as i64 + 1) * 10_000_000 / i64::from(self.fps);
            sample.SetSampleTime(timestamp).map_err(|e| e.to_string())?;
            sample.SetSampleDuration(next - timestamp).map_err(|e| e.to_string())?;
            self.writer.WriteSample(self.stream, &sample).map_err(|e| media_error("Video encoding failed", e))?;
        }
        Ok(())
    }
    fn finish(&self) -> Result<(), String> {
        unsafe { self.writer.Finalize() }.map_err(|e| media_error("MP4 finalization failed",e))
    }
    fn write_pcm(&self,bytes:&[u8],first_sample:u64)->Result<(),String>{
        let Some(stream)=self.audio_stream else{return Ok(());};
        if bytes.is_empty()||bytes.len()%4!=0{return Err("Invalid stereo PCM block".into());}
        let sample=memory_sample(bytes)?;
        let first=(first_sample*10_000_000/48_000) as i64;
        let next=((first_sample+bytes.len() as u64/4)*10_000_000/48_000) as i64;
        unsafe{
            sample.SetSampleTime(first).map_err(|e|e.to_string())?;
            sample.SetSampleDuration(next-first).map_err(|e|e.to_string())?;
            self.writer.WriteSample(stream,&sample).map_err(|e|media_error("AAC encoding failed",e))?;
        }
        Ok(())
    }
}

fn transactional_export(
    destination: &Path, width: u32,height:u32,fps:u32,
    mut render_frame: impl FnMut(u32, &mut [u8]) -> Result<bool,String>,
) -> Result<ExportReport,String> {
    let since = Instant::now();
    let nonce = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos();
    let temporary = destination.with_file_name(format!(".huelith-media-{nonce}.mp4"));
    let process = (|| {
        let encoder = Encoder::new(&temporary,width,height,fps)?;
        let mut rgba = vec![0u8; width as usize * height as usize * 4];
        let mut count = 0u32;
        while count < 18000 {
            if !render_frame(count, &mut rgba)? { break; }
            encoder.write_rgba(&rgba, count)?;
            count += 1;
        }
        if count == 18000 && render_frame(count, &mut rgba)? {
            return Err("Video exceeds the 18,000-frame safety limit; export aborted without publishing a truncated file".into());
        }
        if count == 0 { return Err("No frames to encode".into()); }
        encoder.finish()?;
        drop(encoder);
        if destination.exists() { return Err("Output file already exists; refusing to overwrite".into()); }
        publish_mp4(&temporary,destination)?;
        Ok(ExportReport { output_path: destination.display().to_string(), frames_written:count,
            width,height,fps,elapsed_ms: since.elapsed().as_millis(),backend:"Windows Media Foundation", audio_included:false })
    })();
    if process.is_err() { let _ = std::fs::remove_file(&temporary); }
    process
}

pub fn test_pattern(dest: &Path,width:u32,height:u32,fps:u32,frames:u32) -> Result<ExportReport,String> {
    let _runtime = MfRuntime::new()?;
    transactional_export(dest,width,height,fps,|index,rgba|{
        if index >= frames { return Ok(false); }
        // Deterministic moving pattern and alpha-composited geometry.
        let t = index as f32 / fps as f32;
        let cx = ((t * 120.0) as u32) % width;
        for y in 0..height {
            for x in 0..width {
                let p = ((y * width + x) * 4) as usize;
                let bright = (x as f32 / width as f32 * 190.0) as u8;
                let bar = (x as i32 - cx as i32).abs() < 48;
                rgba[p] = if bar { 245 } else { bright };
                rgba[p+1] = if bar { 70 } else { (y * 180 / height) as u8 };
                rgba[p+2] = if bar { 235 } else { 130 };
                rgba[p+3] = 255;
            }
        }
        Ok(true)
    })
}

pub fn transcode(source: &Path, dest: &Path) -> Result<ExportReport,String> {
    let _runtime = MfRuntime::new()?;
    let reader = open_reader(source)?;
    let (width,height,fps) = configure_rgb_reader(&reader)?;
    check_dimensions(width,height,fps,1)?;
    let mut done = false;
    transactional_export(dest,width,height,fps, |_index, rgba|{
        if done { return Ok(false); }
        for _ in 0..128 { // Skip transient null samples, but avoid infinite loops.
            let mut flags = 0u32;
            let mut sample = None;
            unsafe { reader.ReadSample(MF_SOURCE_READER_FIRST_VIDEO_STREAM.0 as u32,0,None,
                Some(&mut flags), None, Some(&mut sample)) }.map_err(|e| e.to_string())?;
            if flags & (MF_SOURCE_READERF_ENDOFSTREAM.0 as u32) != 0 { done = true; return Ok(false); }
            if let Some(sample) = sample {
                let decoded = copy_rgb_sample(&sample,width,height,decoded_stride(&reader,width))?;
                if decoded.len()!=rgba.len() { return Err("Decoded dimensions changed during transcode".into()); }
                rgba.copy_from_slice(&decoded);
                return Ok(true);
            }
        }
        Err("Native decoder produced too many empty samples".into())
    })
}

/// Production-facing frame-source seam for Animation Studio and future Video
/// Editor compositing. A single frame buffer is reused for the entire export.
pub fn encode_rgba_sequence(source:&Path,dest:&Path,width:u32,height:u32,fps:u32,frames:u32)
    -> Result<ExportReport,String> {
    let _runtime = MfRuntime::new()?;
    let mut stream = std::fs::File::open(source).map_err(|e|e.to_string())?;
    let mut remaining = frames;
    transactional_export(dest,width,height,fps, |_index, rgba| {
        if remaining == 0 { return Ok(false); }
        stream.read_exact(rgba).map_err(|e| format!("Incomplete frame sequence: {e}"))?;
        remaining -= 1;
        Ok(true)
    })
}

fn pcm_media_type(rate:u32,channels:u32)->Result<IMFMediaType,String>{
    unsafe{
        let media=MFCreateMediaType().map_err(|e|e.to_string())?;
        media.SetGUID(&MF_MT_MAJOR_TYPE,&MFMediaType_Audio).map_err(|e|e.to_string())?;
        media.SetGUID(&MF_MT_SUBTYPE,&MFAudioFormat_PCM).map_err(|e|e.to_string())?;
        media.SetUINT32(&MF_MT_AUDIO_NUM_CHANNELS,channels).map_err(|e|e.to_string())?;
        media.SetUINT32(&MF_MT_AUDIO_SAMPLES_PER_SECOND,rate).map_err(|e|e.to_string())?;
        media.SetUINT32(&MF_MT_AUDIO_BITS_PER_SAMPLE,16).map_err(|e|e.to_string())?;
        media.SetUINT32(&MF_MT_AUDIO_BLOCK_ALIGNMENT,channels*2).map_err(|e|e.to_string())?;
        media.SetUINT32(&MF_MT_AUDIO_AVG_BYTES_PER_SECOND,rate*channels*2).map_err(|e|e.to_string())?;
        Ok(media)
    }
}
fn memory_sample(bytes:&[u8])->Result<IMFSample,String>{
    unsafe{
        let buffer=MFCreateMemoryBuffer(bytes.len() as u32).map_err(|e|e.to_string())?;
        let mut ptr=std::ptr::null_mut();buffer.Lock(&mut ptr,None,None).map_err(|e|e.to_string())?;
        if ptr.is_null(){let _=buffer.Unlock();return Err("Native media buffer is null".into());}
        std::ptr::copy_nonoverlapping(bytes.as_ptr(),ptr,bytes.len());buffer.Unlock().map_err(|e|e.to_string())?;
        buffer.SetCurrentLength(bytes.len() as u32).map_err(|e|e.to_string())?;
        let sample=MFCreateSample().map_err(|e|e.to_string())?;sample.AddBuffer(&buffer).map_err(|e|e.to_string())?;Ok(sample)
    }
}

/// Native PCM decoding at the source's own rate. Resampling is explicit and
/// incremental; neither Media Foundation nor the sink writer is assumed to resample.
struct AudioReader {
    reader:IMFSourceReader,rate:u32,channels:usize,buffer:Vec<i16>,start:f64,ended:bool,
}
impl AudioReader {
    fn new(source:&super::stream::AudioSource)->Result<Option<Self>,String>{
        Self::at_position(source,source.source_in)
    }
    fn at_position(source:&super::stream::AudioSource,position:f64)->Result<Option<Self>,String>{
        let reader=open_reader(Path::new(&source.path))?;
        unsafe{
            if let Err(error)=reader.GetNativeMediaType(MF_SOURCE_READER_FIRST_AUDIO_STREAM.0 as u32,0){
                if !source.required && (error.code()==MF_E_INVALIDSTREAMNUMBER||error.code()==MF_E_NO_MORE_TYPES){return Ok(None);}
                return Err(media_error("Audio source has no decodable audio stream",error));
            }
            reader.SetStreamSelection(MF_SOURCE_READER_ALL_STREAMS.0 as u32,false).map_err(|e|e.to_string())?;
            reader.SetStreamSelection(MF_SOURCE_READER_FIRST_AUDIO_STREAM.0 as u32,true).map_err(|e|e.to_string())?;
            let output=MFCreateMediaType().map_err(|e|e.to_string())?;
            output.SetGUID(&MF_MT_MAJOR_TYPE,&MFMediaType_Audio).map_err(|e|e.to_string())?;
            output.SetGUID(&MF_MT_SUBTYPE,&MFAudioFormat_PCM).map_err(|e|e.to_string())?;
            output.SetUINT32(&MF_MT_AUDIO_BITS_PER_SAMPLE,16).map_err(|e|e.to_string())?;
            reader.SetCurrentMediaType(MF_SOURCE_READER_FIRST_AUDIO_STREAM.0 as u32,None,&output)
                .map_err(|e|media_error("Cannot decode this source to PCM audio",e))?;
            let actual=reader.GetCurrentMediaType(MF_SOURCE_READER_FIRST_AUDIO_STREAM.0 as u32).map_err(|e|e.to_string())?;
            let rate=actual.GetUINT32(&MF_MT_AUDIO_SAMPLES_PER_SECOND).map_err(|e|e.to_string())?;
            let channels=actual.GetUINT32(&MF_MT_AUDIO_NUM_CHANNELS).map_err(|e|e.to_string())? as usize;
            let bits=actual.GetUINT32(&MF_MT_AUDIO_BITS_PER_SAMPLE).map_err(|e|e.to_string())?;
            if rate<8000||rate>384000||channels==0||channels>8||bits!=16{return Err("Unsupported decoded PCM format".into());}
            if position>0. {
                let position=PROPVARIANT::from((position*10_000_000.) as i64);
                reader.SetCurrentPosition(&GUID::zeroed(),&position).map_err(|e|media_error("Cannot seek the source audio",e))?;
            }
            Ok(Some(Self{reader,rate,channels,buffer:vec![],start:0.,ended:false}))
        }
    }
    fn next(&mut self)->Result<bool,String>{
        if self.ended{return Ok(false);}
        for _ in 0..128 {
            let mut flags=0u32;let mut sample=None;let mut timestamp=0i64;
            unsafe{self.reader.ReadSample(MF_SOURCE_READER_FIRST_AUDIO_STREAM.0 as u32,0,None,Some(&mut flags),Some(&mut timestamp),Some(&mut sample))}
                .map_err(|e|media_error("Native audio decode failed",e))?;
            if flags&MF_SOURCE_READERF_CURRENTMEDIATYPECHANGED.0 as u32!=0{return Err("Audio format changed in the middle of the source".into());}
            self.ended=flags&MF_SOURCE_READERF_ENDOFSTREAM.0 as u32!=0;
            if let Some(sample)=sample {
                let buffer=unsafe{sample.ConvertToContiguousBuffer()}.map_err(|e|e.to_string())?;
                let len=unsafe{buffer.GetCurrentLength()}.map_err(|e|e.to_string())? as usize;
                if len>20_000_000||len%(self.channels*2)!=0{return Err("Invalid PCM decoder block length".into());}
                let mut ptr=std::ptr::null_mut();unsafe{buffer.Lock(&mut ptr,None,None)}.map_err(|e|e.to_string())?;
                if ptr.is_null(){let _=unsafe{buffer.Unlock()};return Err("Null PCM decoder block".into());}
                let bytes=unsafe{std::slice::from_raw_parts(ptr,len)};
                self.buffer=bytes.chunks_exact(2).map(|v|i16::from_le_bytes([v[0],v[1]])).collect();
                let _=unsafe{buffer.Unlock()};self.start=timestamp as f64/10_000_000.;
                if !self.buffer.is_empty(){return Ok(true);}
            }
            if self.ended{return Ok(false);}
        }
        Err("Audio decoder produced too many empty samples".into())
    }
    fn stereo(&self,index:usize)->[f32;2]{
        let first=index*self.channels;let sample=|ch:usize|self.buffer.get(first+ch).copied().unwrap_or(0) as f32/32768.;
        if self.channels==1{return [sample(0),sample(0)];}
        let (mut left,mut right)=(sample(0),sample(1));
        if self.channels>2{left+=sample(2)*0.70710677;right+=sample(2)*0.70710677;}
        if self.channels>3{left+=sample(3)*0.5;right+=sample(3)*0.5;}
        if self.channels>4{left+=sample(4)*0.70710677;}
        if self.channels>5{right+=sample(5)*0.70710677;}
        if self.channels>6{left+=sample(6)*0.5;}
        if self.channels>7{right+=sample(7)*0.5;}
        [left,right]
    }
    fn at(&mut self,time:f64)->Result<[f32;2],String>{
        loop {
            let frames=self.buffer.len()/self.channels;
            if frames>0&&time<self.start+frames as f64/self.rate as f64{break;}
            if !self.next()?{return Ok([0.,0.]);}
        }
        if time<self.start{return Ok([0.,0.]);}
        let index=(time-self.start)*self.rate as f64;let base=index.floor() as usize;
        let a=self.stereo(base);let b=self.stereo((base+1).min(self.buffer.len()/self.channels-1));let f=(index-base as f64) as f32;
        Ok([a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f])
    }
}
/// Read one PCM block at a time. The envelope and beat detector have fixed
/// memory use even for an hours-long recording.
pub(super) fn analyze_audio(path: &Path, source_in: f64, duration: f64) -> Result<super::AudioAnalysis, String> {
    let _runtime = MfRuntime::new()?;
    let source = super::AudioSource {
        path: path.to_string_lossy().into_owned(), source_in, duration, ..Default::default()
    };
    let Some(mut reader) = AudioReader::new(&source)? else {
        return Ok(super::AudioAnalysis { has_audio: false, waveform: vec![], beats: vec![] });
    };
    let stride = (reader.rate / 8000).max(1) as usize;
    let step = stride as f64 / f64::from(reader.rate);
    let mut waveform = vec![0_f32; 1024];
    let smoothing=1.-(-2.*std::f64::consts::PI*190.*step).exp();
    let mut beats = Vec::new();
    let mut low = 0_f64;
    let mut sum = 0_f64;
    let mut count = 0;
    let mut bucket = 0_u64;
    let mut previous = 0_f64;
    let mut floor = 0_f64;
    let mut last_beat = -1_f64;
    let mut decoded = false;
    'decode: while reader.next()? {
        for index in (0..reader.buffer.len() / reader.channels).step_by(stride) {
            let local = reader.start + index as f64 / f64::from(reader.rate) - source_in;
            if local < 0. { continue; }
            if local >= duration { break 'decode; }
            decoded = true;
            let peak = reader.buffer[index*reader.channels..(index+1)*reader.channels].iter()
                .map(|sample| f32::from(*sample).abs() / 32768.).fold(0., f32::max);
            let bin = ((local / duration * waveform.len() as f64) as usize).min(waveform.len()-1);
            waveform[bin] = waveform[bin].max(peak);
            let band = (local * 50.) as u64;
            if band != bucket && count > 0 {
                let energy = (sum / f64::from(count)).sqrt();
                let onset = (energy - previous).max(0.);
                let at = bucket as f64 / 50.;
                if onset > (floor * 2.7).max(0.012) && energy > 0.024 && at - last_beat >= 0.18 && beats.len() < 8192 {
                    beats.push(source_in + at);
                    last_beat = at;
                }
                floor = floor * 0.94 + onset * 0.06;
                previous = energy;
                sum = 0.;
                count = 0;
            }
            bucket = band;
            let sample = f64::from(reader.buffer[index * reader.channels]) / 32768.;
            low += (sample-low)*smoothing;
            sum += low * low * 0.75 + f64::from(peak).powi(2) * 0.25;
            count += 1;
        }
    }
    Ok(super::AudioAnalysis { has_audio: decoded, waveform: if decoded { waveform } else { vec![] }, beats })
}

#[derive(Clone,Default)]
struct VoiceState { low:[f32;2], band:[f32;2], envelope:[f32;2], phase:f32 }

impl VoiceState {
    fn sample(&mut self,clip:&super::stream::AudioSource,mut input:[f32;2],local:f64)->[f32;2] {
        use super::stream::{ChannelMode,VoiceMode};
        input=match clip.channel_mode {
            ChannelMode::Stereo=>input,ChannelMode::Left=>[input[0];2],ChannelMode::Right=>[input[1];2],
            ChannelMode::Mono=>[(input[0]+input[1])*0.5;2],
        };
        let Some(voice)=&clip.voice else { return input; };
        // Fixed 48 kHz export clock. The preview worklet derives these same coefficients at its sample rate.
        const HIGH_PASS:f32=0.0435315;
        const LOW_PASS:f32=0.329148;
        const WARMTH:f32=0.209919;
        const RELEASE:f32=0.99953714;
        let mix=clip.voice_mix_at(local) as f32;
        for (channel,sample) in input.iter_mut().enumerate() {
            let dry=*sample;
            let wet=match voice.mode {
                VoiceMode::Radio=>{
                    self.low[channel]+=(dry-self.low[channel])*HIGH_PASS;
                    self.band[channel]+=(dry-self.low[channel]-self.band[channel])*LOW_PASS;
                    (self.band[channel]*2.5).tanh()*0.82
                }
                VoiceMode::Warm=>{
                    self.low[channel]+=(dry-self.low[channel])*WARMTH;
                    ((dry*0.56+self.low[channel]*0.74)*1.32).tanh()*0.9
                }
                VoiceMode::Robot=>dry*(0.17+0.83*self.phase.sin()),
                VoiceMode::Cleanup=>{
                    self.envelope[channel]=dry.abs().max(self.envelope[channel]*RELEASE);
                    dry*(self.envelope[channel]/0.037).min(1.).powi(2)
                }
            };
            *sample=dry+(wet-dry)*mix;
        }
        if matches!(voice.mode,VoiceMode::Robot){self.phase=(self.phase+std::f32::consts::TAU*42./48000.)%std::f32::consts::TAU;}
        input
    }
}

struct AudioMixer {
    clips:Vec<super::stream::AudioSource>, readers:Vec<Option<AudioReader>>, absent:Vec<bool>,
    cursor:usize, active:Vec<usize>,voice_states:Vec<VoiceState>,
}
impl AudioMixer {
    fn new(clips:&[super::stream::AudioSource])->Self{
        let mut ordered=clips.to_vec();
        ordered.sort_by(|a,b|a.start.total_cmp(&b.start));
        Self{clips:ordered,readers:(0..clips.len()).map(|_|None).collect(),absent:vec![false;clips.len()],cursor:0,active:vec![],
            voice_states:vec![VoiceState::default();clips.len()]}
    }
    fn block(&mut self,first:u64,last:u64)->Result<Vec<u8>,String>{
        self.render_block(first,last,false).map(|(pcm,_)|pcm)
    }
    fn render_block(&mut self,first:u64,last:u64,meter:bool)->Result<(Vec<u8>,std::collections::HashMap<String,f32>),String>{
        let mut mixed=vec![[0f32;2];(last-first) as usize];
        let mut tracks=std::collections::HashMap::<&str,Vec<[f32;2]>>::new();
        let start=first as f64/48000.;
        let end=last as f64/48000.;
        self.active.retain(|&index|{
            let clip=&self.clips[index];
            let keep=clip.start+clip.duration>start && !self.absent[index];
            if !keep { self.readers[index]=None; }
            keep
        });
        while self.cursor<self.clips.len() && self.clips[self.cursor].start<end {
            let clip=&self.clips[self.cursor];
            if clip.volume>0. && clip.start+clip.duration>start { self.active.push(self.cursor); }
            self.cursor+=1;
        }
        for &index in &self.active {
            let clip=&self.clips[index];
            if self.readers[index].is_none(){
                let local=(start-clip.start).max(0.);
                self.readers[index]=AudioReader::at_position(clip,clip.position_at(local))?;
                if self.readers[index].is_none(){self.absent[index]=true;continue;}
                self.voice_states[index].phase=(local*42.).fract() as f32*std::f32::consts::TAU;
            }
            let reader=self.readers[index].as_mut().unwrap();
            let track=clip.track_id.as_deref().filter(|_|meter);
            let mut track_mix=track.map(|id|tracks.entry(id).or_insert_with(||vec![[0.;2];mixed.len()]));
            let offset_start=((clip.start*48000.).ceil() as u64).saturating_sub(first) as usize;
            let offset_end=(((clip.start+clip.duration)*48000.).ceil() as u64).saturating_sub(first).min(last-first) as usize;
            for (offset,stereo) in mixed.iter_mut().enumerate().take(offset_end).skip(offset_start){
                let t=(first+offset as u64) as f64/48000.;let local=t-clip.start;
                let gain=clip.gain_at(local) as f32;
                let mut sample=self.voice_states[index].sample(clip,reader.at(clip.position_at(local))?,local);
                let pan=clip.pan_at(local) as f32;
                if pan!=0. {
                    let angle=(if pan<0.{pan+1.}else{pan})*std::f32::consts::FRAC_PI_2;
                    let (sin,cos)=angle.sin_cos();
                    if pan<0.{sample=[sample[0]+sample[1]*cos,sample[1]*sin];}
                    else{sample=[sample[0]*cos,sample[1]+sample[0]*sin];}
                }
                for channel in 0..2 {
                    let value=sample[channel]*gain;
                    stereo[channel]+=value;
                    if let Some(ref mut track)=track_mix {track[offset][channel]+=value;}
                }
            }
        }
        let mut bytes=Vec::with_capacity(mixed.len()*4);
        for frame in mixed{for value in frame{bytes.extend_from_slice(&((value.clamp(-1.,1.)*32767.).round() as i16).to_le_bytes());}}
        let peaks=tracks.into_iter().map(|(id,frames)|(id.to_owned(),frames.iter().flatten().fold(0f32,|peak,value|peak.max(value.abs())))).collect();
        Ok((bytes,peaks))
    }
}

pub(super) struct PreviewMixer {
    mixer:AudioMixer,
    next:Option<u64>,
    _runtime:MfRuntime,
}
impl PreviewMixer {
    pub(super) fn new(sources:&[super::AudioSource])->Result<Self,String>{
        let runtime=MfRuntime::new()?;
        Ok(Self{mixer:AudioMixer::new(sources),next:None,_runtime:runtime})
    }
    pub(super) fn read(&mut self,first:u64,count:u32)->Result<Vec<u8>,String>{
        if self.next.take()!=Some(first) {
            self.mixer=AudioMixer::new(&self.mixer.clips);
            let warm=first.saturating_sub(4800);
            if warm<first {self.mixer.block(warm,first)?;}
        }
        let last=first+u64::from(count);
        let mut samples=Vec::with_capacity(count as usize*4);
        let mut peaks=Vec::new();
        let mut at=first;
        while at<last{
            let end=(at+2400).min(last);
            let (pcm,levels)=self.mixer.render_block(at,end,true)?;
            samples.extend(pcm);
            peaks.push(levels);
            at=end;
        }
        self.next=Some(last);
        let header=serde_json::to_vec(&peaks).map_err(|error|error.to_string())?;
        let padding=(4-header.len()%4)%4;
        let mut result=Vec::with_capacity(4+header.len()+padding+samples.len());
        result.extend_from_slice(&(header.len() as u32).to_le_bytes());
        result.extend(header);
        result.resize(result.len()+padding,0);
        result.extend(samples);
        Ok(result)
    }
}

/// Stream the timeline's real mixed audio into 16 kHz mono PCM for local speech
/// recognition. Three 48 kHz stereo samples are low-pass averaged per output
/// sample; RAM stays bounded regardless of timeline duration.
pub(super) fn caption_audio(path:&Path,audio:&[super::AudioSource],duration:f64,cancelled:&std::sync::atomic::AtomicBool,progress:impl Fn(f64))->Result<(),String>{
    use std::{io::Write,sync::atomic::Ordering};
    let _runtime=MfRuntime::new()?;let mut mixer=AudioMixer::new(audio);
    let samples=(duration*16000.).ceil() as u32;let bytes=samples.checked_mul(2).ok_or("Caption audio is too long")?;
    let mut file=std::fs::File::create(path).map_err(|e|e.to_string())?;
    file.write_all(b"RIFF").and_then(|_|file.write_all(&(36+bytes).to_le_bytes())).and_then(|_|file.write_all(b"WAVEfmt "))
        .and_then(|_|file.write_all(&16u32.to_le_bytes())).and_then(|_|file.write_all(&1u16.to_le_bytes()))
        .and_then(|_|file.write_all(&1u16.to_le_bytes())).and_then(|_|file.write_all(&16000u32.to_le_bytes()))
        .and_then(|_|file.write_all(&32000u32.to_le_bytes())).and_then(|_|file.write_all(&2u16.to_le_bytes()))
        .and_then(|_|file.write_all(&16u16.to_le_bytes())).and_then(|_|file.write_all(b"data"))
        .and_then(|_|file.write_all(&bytes.to_le_bytes())).map_err(|e|e.to_string())?;
    let total=u64::from(samples)*3;let mut first=0;let mut energy=0f64;
    while first<total{
        if cancelled.load(Ordering::Relaxed){return Err("Caption creation cancelled".into());}
        let last=(first+14400).min(total);let pcm=mixer.block(first,last)?;let mut mono=Vec::with_capacity(pcm.len()/6);
        for group in pcm.chunks_exact(12){
            let sum:i32=group.chunks_exact(2).map(|v|i32::from(i16::from_le_bytes([v[0],v[1]]))).sum();
            let sample=(sum/6) as i16;energy+=f64::from(sample).powi(2);mono.extend_from_slice(&sample.to_le_bytes());
        }
        file.write_all(&mono).map_err(|e|e.to_string())?;first=last;
        if first%48000<14400{progress(first as f64/total as f64);}
    }
    file.sync_all().map_err(|e|e.to_string())?;
    if (energy/f64::from(samples)).sqrt()<2.{return Err("The audible timeline contains only silence".into());}Ok(())
}

pub(super) fn mix_wav(path:&Path,audio:&[super::AudioSource],duration:f64,cancelled:&std::sync::atomic::AtomicBool)->Result<(),String>{
    use std::{io::Write,sync::atomic::Ordering};
    let _runtime=MfRuntime::new()?;
    let mut mixer=AudioMixer::new(audio);
    let samples=(duration*48000.).ceil() as u64;
    let bytes=u32::try_from(samples*4).map_err(|_|"WAV duration exceeds the RIFF limit")?;
    let mut file=std::fs::OpenOptions::new().write(true).create_new(true).open(path).map_err(|e|e.to_string())?;
    let mut header=b"RIFF".to_vec();
    header.extend_from_slice(&(36+bytes).to_le_bytes());
    header.extend_from_slice(b"WAVEfmt ");
    header.extend_from_slice(&16u32.to_le_bytes());
    header.extend_from_slice(&1u16.to_le_bytes());
    header.extend_from_slice(&2u16.to_le_bytes());
    header.extend_from_slice(&48000u32.to_le_bytes());
    header.extend_from_slice(&192000u32.to_le_bytes());
    header.extend_from_slice(&4u16.to_le_bytes());
    header.extend_from_slice(&16u16.to_le_bytes());
    header.extend_from_slice(b"data");
    header.extend_from_slice(&bytes.to_le_bytes());
    file.write_all(&header).map_err(|e|e.to_string())?;
    let mut first=0;
    while first<samples{
        if cancelled.load(Ordering::Relaxed){return Err("Export cancelled".into());}
        let last=(first+48000).min(samples);
        file.write_all(&mixer.block(first,last)?).map_err(|e|e.to_string())?;
        first=last;
    }
    file.sync_all().map_err(|e|e.to_string())
}

pub(super) fn stream_export(
    destination:&Path,config:&super::stream::StreamConfig,
    receiver:std::sync::mpsc::Receiver<super::stream::ExportPacket>,
    cancelled:std::sync::Arc<std::sync::atomic::AtomicBool>,ready:std::sync::mpsc::Sender<Result<(),String>>,
){
    use super::stream::ExportPacket;
    use std::sync::atomic::Ordering;
    let since=Instant::now();let nonce=SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos();
    let temporary=destination.with_file_name(format!(".huelith-stream-{nonce}.mp4"));
    let initialized=(||{
        let runtime=MfRuntime::new()?;
        let mut audio=Vec::new();
        for source in &config.audio {
            let reader=open_reader(Path::new(&source.path))?;
            match unsafe{reader.GetNativeMediaType(MF_SOURCE_READER_FIRST_AUDIO_STREAM.0 as u32,0)} {
                Ok(_)=>audio.push(source.clone()),
                Err(e) if !source.required&&(e.code()==MF_E_INVALIDSTREAMNUMBER||e.code()==MF_E_NO_MORE_TYPES)=>{},
                Err(e)=>return Err(media_error("Audio source is unavailable",e)),
            }
        }
        let encoder=Encoder::new_av(&temporary,config.width,config.height,config.fps,!audio.is_empty(),config.bitrate)?;
        Ok::<_,String>((runtime,encoder,audio))
    })();
    let (runtime,encoder,audio)=match initialized{Ok(pair)=>pair,Err(e)=>{let _=ready.send(Err(e));let _=std::fs::remove_file(&temporary);return;}};
    // Runtime must be dropped after every COM interface on this thread.
    let _runtime=runtime;
    if ready.send(Ok(())).is_err(){drop(encoder);let _=std::fs::remove_file(&temporary);return;}
    let audio_included=!audio.is_empty();let mut mixer=AudioMixer::new(&audio);let mut count=0u32;
    let mut last_packet=Instant::now();
    loop {
        if cancelled.load(Ordering::Relaxed){break;}
        let packet=match receiver.recv_timeout(std::time::Duration::from_secs(30)){
            Ok(packet)=>packet,Err(std::sync::mpsc::RecvTimeoutError::Timeout)=>{if last_packet.elapsed().as_secs()>=300{break;}continue;},Err(_)=>break,
        };
        last_packet=Instant::now();
        match packet {
            ExportPacket::Frame{index,rgba,ack}=>{
                let result=(||{
                    if cancelled.load(Ordering::Relaxed){return Err("Export cancelled".into());}
                    if index!=count||index>=config.frame_count{return Err("Video frames arrived out of sequence".into());}
                    encoder.write_rgba(&rgba,index)?;
                    if audio_included{
                        let first=u64::from(index)*48000/u64::from(config.fps);
                        let last=u64::from(index+1)*48000/u64::from(config.fps);
                        encoder.write_pcm(&mixer.block(first,last)?,first)?;
                    }
                    count+=1;Ok(())
                })();
                let failed=result.is_err();let _=ack.send(result);if failed{break;}
            }
            ExportPacket::Finish(ack)=>{
                let result=(||{
                    if cancelled.load(Ordering::Relaxed){return Err("Export cancelled".into());}
                    if count!=config.frame_count{return Err(format!("Incomplete export: received {count} of {} frames",config.frame_count));}
                    encoder.finish()?;Ok(())
                })();
                drop(mixer);drop(encoder);
                let result=result.and_then(|_|{
                    if cancelled.load(Ordering::Relaxed){return Err("Export cancelled".into());}
                    if destination.exists(){return Err("Output file already exists; refusing to overwrite".into());}
                    publish_mp4(&temporary,destination)?;
                    Ok(ExportReport{output_path:destination.display().to_string(),frames_written:count,width:config.width,height:config.height,fps:config.fps,
                        elapsed_ms:since.elapsed().as_millis(),backend:"Windows Media Foundation",audio_included})
                });
                if result.is_err(){let _=std::fs::remove_file(&temporary);}let _=ack.send(result);return;
            }
            ExportPacket::Cancel=>break,
        }
    }
    drop(mixer);drop(encoder);let _=std::fs::remove_file(&temporary);
}

#[cfg(test)]
mod runtime_tests {
    use super::*;
    #[test]
    fn media_foundation_urls_normalize_canonical_drive_and_unc_paths(){
        for (path,expected) in [(r"\\?\E:\Media\a file.mp4",r"E:\Media\a file.mp4"),
            (r"\\?\UNC\server\share\a.wav",r"\\server\share\a.wav")]{
            let url=media_url(Path::new(path));assert_eq!(String::from_utf16(&url[..url.len()-1]).unwrap(),expected);
        }
    }
    #[test]
    fn native_mp4_roundtrip_preserves_color_orientation_and_timing() {
        let folder = Path::new(env!("CARGO_MANIFEST_DIR")).join("../output/media-qa");
        std::fs::create_dir_all(&folder).unwrap();
        let nonce = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let output = folder.join(format!("baseline-{nonce}.mp4"));
        let _runtime = MfRuntime::new().unwrap();
        let report = transactional_export(&output, 320, 180, 30, |index, pixels| {
            if index >= 60 { return Ok(false); }
            for y in 0..180 { for x in 0..320 {
                let i = (y * 320 + x) * 4;
                let color = if y < 90 { [230, 25, 35, 255] } else { [20, 45, 225, 255] };
                pixels[i..i+4].copy_from_slice(&color);
            }}
            Ok(true)
        }).unwrap();
        assert_eq!(report.frames_written, 60);
        assert!(output.metadata().unwrap().len() > 1000);
        let reader = open_reader(&output).unwrap();
        let (w,h,rate) = configure_rgb_reader(&reader).unwrap();
        assert_eq!((w,h,rate), (320,180,30));
        let frame = decode_preview(&output).unwrap();
        let top = ((20 * frame.width + 30) * 4) as usize;
        let bottom = (((frame.height-20) * frame.width + 30) * 4) as usize;
        assert!(frame.rgba[top] > 180 && frame.rgba[top+2] < 70, "top should be red: {:?}", &frame.rgba[top..top+4]);
        assert!(frame.rgba[bottom+2] > 180 && frame.rgba[bottom] < 70, "bottom should be blue: {:?}", &frame.rgba[bottom..bottom+4]);
        println!("Native Windows roundtrip: {} ({} ms)", output.display(), report.elapsed_ms);
    }

    fn wave(path:&Path){
        let rate=44100u32;let count=rate*3;let mut bytes=Vec::new();
        bytes.extend_from_slice(b"RIFF");bytes.extend_from_slice(&(36+count*2).to_le_bytes());bytes.extend_from_slice(b"WAVEfmt ");
        bytes.extend_from_slice(&16u32.to_le_bytes());bytes.extend_from_slice(&1u16.to_le_bytes());bytes.extend_from_slice(&1u16.to_le_bytes());
        bytes.extend_from_slice(&rate.to_le_bytes());bytes.extend_from_slice(&(rate*2).to_le_bytes());bytes.extend_from_slice(&2u16.to_le_bytes());bytes.extend_from_slice(&16u16.to_le_bytes());
        bytes.extend_from_slice(b"data");bytes.extend_from_slice(&(count*2).to_le_bytes());
        for n in 0..count {let t=n as f64/rate as f64;let sample=if (1.0..1.5).contains(&t){(t*440.*std::f64::consts::TAU).sin()*0.4}else{0.};bytes.extend_from_slice(&((sample*32767.) as i16).to_le_bytes());}
        std::fs::write(path,bytes).unwrap();
    }
    #[test]
    fn preview_audio_starts_at_a_mid_clip_seek_and_keeps_pcm_windows_contiguous(){
        let folder=Path::new(env!("CARGO_MANIFEST_DIR")).join("../output/media-qa");
        std::fs::create_dir_all(&folder).unwrap();
        let nonce=SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let wav=folder.join(format!("preview-beep-{nonce}.wav"));wave(&wav);
        let source=super::super::AudioSource{path:wav.display().to_string(),required:true,duration:3.,volume:1.,
            pan:0.7,track_id:Some("audio1".into()),..Default::default()};
        let mut preview=PreviewMixer::new(&[source]).unwrap();
        fn decode(packet:&[u8])->(&[u8],Vec<i16>){
            let size=u32::from_le_bytes(packet[0..4].try_into().unwrap()) as usize;
            let start=(4+size+3)&!3;
            (&packet[4..4+size],packet[start..].chunks_exact(2).map(|sample|i16::from_le_bytes([sample[0],sample[1]])).collect())
        }
        let first=preview.read(52_800,4800).unwrap();
        let second=preview.read(57_600,4800).unwrap();
        let (levels,a)=decode(&first);
        let (_,b)=decode(&second);
        assert_eq!((a.len(),b.len()),(9600,9600));
        let peaks:Vec<std::collections::HashMap<String,f32>>=serde_json::from_slice(levels).unwrap();
        assert!(peaks.iter().all(|window|window["audio1"]>0.5));
        let left=a.iter().step_by(2).map(|n|n.unsigned_abs()).max().unwrap();
        let right=a.iter().skip(1).step_by(2).map(|n|n.unsigned_abs()).max().unwrap();
        assert!(right>left*3,"pan reaches the scheduled PCM, left {left}, right {right}");
        assert!((i32::from(a[9599])-i32::from(b[1])).abs()<3000,"a boundary must not jump or repeat the tone");
        let earlier=preview.read(4800,4800).unwrap();
        assert!(decode(&earlier).1.iter().all(|&sample|sample==0));
    }
    fn streamed(config:super::super::stream::StreamConfig,cancel_at:Option<u32>)->Result<ExportReport,String>{
        use super::super::stream::ExportPacket;
        let (tx,rx)=std::sync::mpsc::sync_channel(2);let (ready_tx,ready_rx)=std::sync::mpsc::channel();
        let cancel=std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));let worker_cancel=cancel.clone();let settings=config.clone();
        let worker=std::thread::spawn(move||stream_export(Path::new(&settings.output_path),&settings,rx,worker_cancel,ready_tx));
        ready_rx.recv().unwrap()?;
        for index in 0..config.frame_count {
            if cancel_at==Some(index){cancel.store(true,std::sync::atomic::Ordering::Relaxed);let _=tx.send(ExportPacket::Cancel);worker.join().unwrap();return Err("Export cancelled".into());}
            let mut rgba=vec![0;config.width as usize*config.height as usize*4];
            let time=index as f64/config.fps as f64;
            for pixel in rgba.chunks_exact_mut(4){pixel.copy_from_slice(if (0.75..1.25).contains(&time){&[240,240,240,255]}else{&[20,40,100,255]});}
            let (ack,reply)=std::sync::mpsc::channel();tx.send(ExportPacket::Frame{index,rgba,ack}).unwrap();reply.recv().unwrap()?;
        }
        let (ack,reply)=std::sync::mpsc::channel();tx.send(ExportPacket::Finish(ack)).unwrap();let result=reply.recv().unwrap();worker.join().unwrap();result
    }
    #[test]
    fn native_stream_encodes_trimmed_resampled_audio_and_cleans_cancelled_output(){
        use super::super::stream::{StreamConfig,AudioSource};
        let folder=Path::new(env!("CARGO_MANIFEST_DIR")).join("../output/media-qa");std::fs::create_dir_all(&folder).unwrap();
        let nonce=SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();let wav=folder.join(format!("beep-{nonce}.wav"));wave(&wav);
        let output=folder.join(format!("audio-sync-{nonce}.mp4"));
        let mut config=StreamConfig{output_path:output.display().to_string(),width:320,height:180,fps:30,frame_count:60,bitrate:None,
            audio:vec![AudioSource{path:wav.display().to_string(),start:0.5,source_in:0.75,duration:1.5,volume:0.8,fade_in:0.05,fade_out:0.1,required:true,..Default::default()}]};
        super::super::stream::validate_stream(&mut config).unwrap();
        config.output_path=super::super::validate_output_path(None,&config.output_path).unwrap().display().to_string();
        let report=streamed(config.clone(),None).unwrap();assert!(report.audio_included);assert_eq!(report.frames_written,60);
        let _runtime=MfRuntime::new().unwrap();let source=AudioSource{path:output.display().to_string(),start:0.,source_in:0.,duration:2.,volume:1.,fade_in:0.,fade_out:0.,required:true,..Default::default()};
        let mut audio=AudioReader::new(&source).unwrap().unwrap();
        let mut rms=|time:f64|{let mut sum=0.;for n in 0..480 {let v=audio.at(time+n as f64/48000.).unwrap()[0];sum+=v*v;}(sum/480.).sqrt()};
        let silence=rms(0.2);let before=rms(0.65);let beep=rms(0.85);let after=rms(1.4);
        assert!(silence<0.01&&before<0.01&&after<0.01,"silence windows {silence} {before} {after}");
        assert!(beep>0.12,"Encoded AAC is inaudible: RMS {beep}");
        let mut cancelled=config;let cancelled_path=folder.join(format!("cancelled-{nonce}.mp4"));cancelled.output_path=cancelled_path.display().to_string();
        assert!(streamed(cancelled,Some(4)).is_err());assert!(!cancelled_path.exists());
        println!("Native AAC sync: {} · RMS {beep:.4} · {} ms",output.display(),report.elapsed_ms);
    }

    #[test]
    fn native_audio_analysis_and_automated_retime_reach_encoded_aac() {
        use super::super::stream::{StreamConfig,AudioSource};
        let folder=Path::new(env!("CARGO_MANIFEST_DIR")).join("../output/media-qa");
        std::fs::create_dir_all(&folder).unwrap();
        let nonce=SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let wav=folder.join(format!("automation-{nonce}.wav"));
        wave(&wav);
        let analysis=analyze_audio(&wav,0.,3.).unwrap();
        assert!(analysis.has_audio && analysis.waveform.len()==1024);
        assert!(analysis.waveform[..250].iter().all(|peak|*peak<0.001));
        assert!(analysis.waveform[340..500].iter().any(|peak|*peak>0.35));
        assert!(analysis.beats.iter().any(|beat|(*beat-1.).abs()<0.09),"{:?}",analysis.beats);
        let output=folder.join(format!("retime-automation-{nonce}.mp4"));
        let source:AudioSource=serde_json::from_value(serde_json::json!({
            "path":wav,"start":0.25,"sourceIn":0.5,"duration":0.75,"volume":1.0,
            "fadeIn":0.0,"fadeOut":0.0,"required":true,
            "sourceMap":[{"time":0.0,"source":0.5},{"time":0.75,"source":2.0}],
            "gainLayers":[{"offset":0.0,"duration":0.75,"volume":1.0,"fadeIn":0.0,"fadeOut":0.0,
                "duck":[{"start":0.22,"end":0.34,"amount":0.75,"attack":0.0,"release":0.0}]}]
        })).unwrap();
        let mut config=StreamConfig{output_path:output.display().to_string(),width:160,height:90,fps:30,
            frame_count:30,bitrate:Some(1_000_000),audio:vec![source]};
        super::super::stream::validate_stream(&mut config).unwrap();
        let report=streamed(config,None).unwrap();
        assert_eq!(report.frames_written,30);
        assert!(report.audio_included);
        let _runtime=MfRuntime::new().unwrap();
        let mut reader=AudioReader::new(&AudioSource{path:output.display().to_string(),required:true,..Default::default()}).unwrap().unwrap();
        let mut rms=|time:f64|{
            let sum:f32=(0..960).map(|i|reader.at(time+f64::from(i)/48_000.).unwrap()[0].powi(2)).sum();
            (sum/960.).sqrt()
        };
        let quiet=rms(0.35);
        let ducked=rms(0.53);
        let full=rms(0.67);
        let after=rms(0.88);
        assert!(quiet<0.015 && after<0.015 && full>0.18 && ducked>0.03 && ducked<full*0.45,
            "quiet {quiet}, ducked {ducked}, full {full}, after {after}");
        println!("Retime and ducking AAC RMS: {quiet:.4} / {ducked:.4} / {full:.4} / {after:.4}");
    }

    #[test]
    fn native_stream_supports_five_thirty_and_one_hundred_eighty_seconds(){
        use super::super::stream::StreamConfig;
        let folder=Path::new(env!("CARGO_MANIFEST_DIR")).join("../output/media-qa");std::fs::create_dir_all(&folder).unwrap();
        let nonce=SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        for seconds in [5,30,180] {
            let output=folder.join(format!("stream-{seconds}s-{nonce}.mp4"));
            let config=StreamConfig{output_path:output.display().to_string(),width:1280,height:720,fps:10,frame_count:seconds*10,bitrate:Some(2_000_000),audio:vec![]};
            let report=streamed(config,None).unwrap();assert_eq!(report.frames_written,seconds*10);
            let info=probe(&output).unwrap();let duration=info.duration_100ns.unwrap() as f64/10_000_000.;
            assert!((duration-seconds as f64).abs()<0.11,"duration: {duration}");
            println!("Streaming benchmark {seconds}s · 1280×720 @ 10 fps · {} ms · {} bytes · {}",report.elapsed_ms,output.metadata().unwrap().len(),output.display());
        }
    }
}

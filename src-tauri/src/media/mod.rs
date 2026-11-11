//! Huelith Stage B: Media Foundation-backed Windows media foundation.
//! The encoder and decoder are intentionally isolated from the image editor.
//! All COM objects are created, used and released on one blocking worker thread.
//! The optional recording and WebM tools run separately from the native MP4 path.

#[cfg(windows)] mod windows_mf;
mod stream;
mod preview_audio;
pub use stream::*;
pub use preview_audio::*;
pub(crate) mod recording_tools;
#[cfg(windows)] mod delivery;

pub(crate) fn caption_audio(path:&Path,audio:&[AudioSource],duration:f64,cancelled:&std::sync::atomic::AtomicBool,progress:impl Fn(f64))->Result<(),String>{
    if !duration.is_finite()||duration<=0.||duration>21600.||audio.is_empty()||audio.len()>4096{return Err("Choose an audible timeline of at most six hours and 4096 audio clips".into());}
    let mut config=StreamConfig{output_path:String::new(),width:16,height:16,fps:1,frame_count:1,bitrate:None,audio:audio.to_vec()};
    stream::validate_stream(&mut config)?;
    #[cfg(windows)]{windows_mf::caption_audio(path,&config.audio,duration,cancelled,progress)}
    #[cfg(not(windows))]{let _=(path,config,cancelled,progress);Err("Local caption audio decoding currently requires Windows".into())}
}

use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaCapabilities {
    pub available: bool,
    pub backend: &'static str,
    pub video_decode: bool,
    pub h264_mp4_encode: bool,
    pub audio_encode: bool,
    pub note: &'static str,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoInfo {
    pub width: u32,
    pub height: u32,
    pub frame_rate_numerator: u32,
    pub frame_rate_denominator: u32,
    pub pixel_format: String,
    pub duration_100ns: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewFrame {
    pub width: u32,
    pub height: u32,
    /// RGBA8 top-down, tightly packed; thumbnails are limited to 640x360.
    pub rgba: Vec<u8>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioAnalysis {
    has_audio: bool,
    waveform: Vec<f32>,
    beats: Vec<f64>,
}

#[tauri::command]
pub async fn media_analyze_audio(path: String, duration: f64, source_in: f64, source_duration: f64) -> Result<AudioAnalysis, String> {
    if ![duration, source_in, source_duration].iter().all(|value| value.is_finite())
        || duration <= 0. || duration > 21600. || source_in < 0. || source_duration <= 0.
        || source_in + source_duration > duration + 0.02 {
        return Err("Choose a valid audio source range within six hours".into());
    }
    let path = validate_source_file(&path)?;
    #[cfg(windows)] {
        tauri::async_runtime::spawn_blocking(move || windows_mf::analyze_audio(&path, source_in, source_duration))
            .await.map_err(|e| e.to_string())?
    }
    #[cfg(not(windows))] {
        let _ = path;
        Err("Native audio analysis requires Windows".into())
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportReport {
    pub output_path: String,
    pub frames_written: u32,
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub elapsed_ms: u128,
    pub backend: &'static str,
    pub audio_included: bool,
}

pub fn check_dimensions(width: u32, height: u32, fps: u32, frames: u32) -> Result<(), String> {
    if width < 16 || height < 16 || width > 3840 || height > 2160 || width % 2 != 0 || height % 2 != 0 {
        return Err("Video resolution must be even-numbered, 16..3840 × 16..2160".into());
    }
    if !(1..=120).contains(&fps) || frames == 0 || frames > 18000 {
        return Err("Frame rate must be 1..120 and frames must be 1..18000".into());
    }
    let len = (width as u64).checked_mul(height as u64).and_then(|p| p.checked_mul(4))
        .ok_or("Video frame dimensions overflow")?;
    if len > 40_000_000 { return Err("A single video frame exceeds the bounded input size".into()); }
    Ok(())
}

fn validate_source_file(path: &str) -> Result<PathBuf, String> {
    let value = Path::new(path);
    let parent=value.parent().ok_or("Media directory is missing")?.canonicalize().map_err(|e|e.to_string())?;
    let resolved=parent.join(value.file_name().ok_or("Media file name is missing")?);
    let file=std::fs::File::open(&resolved).map_err(|e|format!("Media file is missing or inaccessible: {e}"))?;
    let metadata = file.metadata().map_err(|e| e.to_string())?;
    if !metadata.is_file() || metadata.len() == 0 || metadata.len() > 16 * 1024 * 1024 * 1024 {
        return Err("Media file is empty or exceeds the 16 GiB foundation limit".into());
    }
    Ok(resolved)
}

fn validate_output_path(input: Option<&Path>, output: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(output);
    if path.extension().and_then(|e| e.to_str()).map(|e| e.eq_ignore_ascii_case("mp4")) != Some(true) {
        return Err("Native video output must have a .mp4 extension".into());
    }
    let parent = path.parent().filter(|p| !p.as_os_str().is_empty()).ok_or("Output directory is missing")?;
    let parent = std::fs::canonicalize(parent).map_err(|e| format!("Output directory is not accessible: {e}"))?;
    let filename = path.file_name().ok_or("Output file name is missing")?;
    let absolute = parent.join(filename);
    if absolute.exists() { return Err("Refusing to replace an existing video file".into()); }
    if input == Some(absolute.as_path()) { return Err("Input and output video must be different files".into()); }
    Ok(absolute)
}

/// Authorize only a user-selected, existing media file for range-based playback.
/// The WebView streams it through Tauri's asset protocol instead of loading a Blob.
#[tauri::command]
pub fn media_authorize_source(app: tauri::AppHandle, path: String) -> Result<String, String> {
    use tauri::Manager;
    let file = validate_source_file(&path)?;
    let extension = file.extension().and_then(|v|v.to_str()).unwrap_or("").to_ascii_lowercase();
    if !["mp4","mov","m4v","webm","wmv","avi","mp3","wav","m4a","aac","ogg","flac","png","jpg","jpeg","webp","bmp","gif","tga"].contains(&extension.as_str()) {
        return Err("Choose a supported media file".into());
    }
    app.asset_protocol_scope().allow_file(&file).map_err(|e|e.to_string())?;
    Ok(file.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn media_capabilities() -> MediaCapabilities {
    #[cfg(windows)] {
        // Tauri's UI thread is STA. Probe COM/MF on the same MTA worker class
        // that actually decodes and encodes, rather than reporting a false outage.
        let started = tauri::async_runtime::spawn_blocking(windows_mf::available).await.unwrap_or(false);
        return MediaCapabilities {
        available: started, backend: "Windows Media Foundation", video_decode: started,
        h264_mp4_encode: started, audio_encode: started,
        note: "H.264/MP4 export with 48 kHz stereo mixing and AAC audio. Available Windows codecs are checked when an export starts.",
    }; }
    #[cfg(not(windows))] { MediaCapabilities {
        available: false, backend: "Unavailable on this operating system", video_decode: false,
        h264_mp4_encode: false, audio_encode: false,
        note: "The Stage B native media backend currently targets Windows only. No FFmpeg fallback is silently substituted.",
    } }
}

#[tauri::command]
pub async fn media_probe_file(path: String) -> Result<VideoInfo, String> {
    let file = validate_source_file(&path)?;
    #[cfg(windows)] {
        return tauri::async_runtime::spawn_blocking(move || windows_mf::probe(&file)).await.map_err(|e| e.to_string())?;
    }
    #[cfg(not(windows))] { let _ = file; Err("Native Media Foundation probing requires Windows".into()) }
}

#[tauri::command]
pub async fn media_decode_preview(path: String) -> Result<PreviewFrame, String> {
    let file = validate_source_file(&path)?;
    #[cfg(windows)] {
        return tauri::async_runtime::spawn_blocking(move || windows_mf::decode_preview(&file)).await.map_err(|e| e.to_string())?;
    }
    #[cfg(not(windows))] { let _ = file; Err("Native Media Foundation decoding requires Windows".into()) }
}

#[tauri::command]
pub async fn media_export_test_pattern(
    output_path: String, width: u32, height: u32, fps: u32, seconds: u32,
) -> Result<ExportReport, String> {
    if seconds == 0 || seconds > 30 { return Err("Diagnostic export duration must be 1..30 seconds".into()); }
    let frames = fps.checked_mul(seconds).ok_or("Frame count overflow")?;
    check_dimensions(width, height, fps, frames)?;
    let path = validate_output_path(None, &output_path)?;
    #[cfg(windows)] {
        return tauri::async_runtime::spawn_blocking(move || windows_mf::test_pattern(&path,width,height,fps,frames))
            .await.map_err(|e| e.to_string())?;
    }
    #[cfg(not(windows))] { let _ = path; Err("Native MP4 export requires Windows".into()) }
}

/// A real decode → composite/process → encode implementation. Source audio is not
/// preserved in Stage B. Stage C will connect this to editable video tracks.
#[tauri::command]
pub async fn media_transcode_file(input_path: String, output_path: String) -> Result<ExportReport, String> {
    let source = validate_source_file(&input_path)?;
    let output = validate_output_path(Some(&source), &output_path)?;
    #[cfg(windows)] {
        return tauri::async_runtime::spawn_blocking(move || windows_mf::transcode(&source, &output))
            .await.map_err(|e| e.to_string())?;
    }
    #[cfg(not(windows))] { let _ = (source, output); Err("Native transcoding requires Windows".into()) }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn rejects_oversize_and_odd_video() {
        assert!(check_dimensions(1920,1080,30,300).is_ok());
        assert!(check_dimensions(1919,1080,30,300).is_err());
        assert!(check_dimensions(1920,1080,0,300).is_err());
        assert!(check_dimensions(8000,5000,30,300).is_err());
        assert!(check_dimensions(1920,1080,30,18001).is_err());
    }
    #[test] fn output_path_validation_does_not_overwrite() {
        assert!(validate_output_path(None,"/nonexistent/folder/file.mp4").is_err());
        assert!(validate_output_path(None,"test.mov").is_err());
    }
}

/// Encodes a bounded raw RGBA8 frame sequence (top-down tightly packed), as
/// emitted by the animation compositor. Streaming from disk keeps memory usage
/// bounded independently of duration. Native encoding is Windows-only.
#[tauri::command]
pub async fn media_encode_rgba_frames(
    frames_path: String, output_path: String, width: u32, height: u32, fps: u32, frame_count: u32,
) -> Result<ExportReport, String> {
    check_dimensions(width, height, fps, frame_count)?;
    let source = validate_source_file(&frames_path)?;
    let frame_bytes = (width as u64) * (height as u64) * 4;
    let expected = frame_bytes.checked_mul(u64::from(frame_count)).ok_or("RGBA frame sequence overflow")?;
    let actual = source.metadata().map_err(|e| e.to_string())?.len();
    if actual != expected { return Err(format!("Raw sequence has {actual} bytes, expected exactly {expected}")); }
    let output = validate_output_path(Some(&source), &output_path)?;
    #[cfg(windows)] {
        return tauri::async_runtime::spawn_blocking(move ||
            windows_mf::encode_rgba_sequence(&source,&output,width,height,fps,frame_count))
            .await.map_err(|e| e.to_string())?;
    }
    #[cfg(not(windows))] { let _ = (source,output); Err("Native RGBA sequence encoding requires Windows".into()) }
}

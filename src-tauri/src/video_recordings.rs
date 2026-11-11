use std::{
    fs::{self, OpenOptions},
    io::Write,
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::Manager;

static NEXT_RECORDING: AtomicU64 = AtomicU64::new(1);

/// Save decoded PCM in the project media cache. The binary IPC avoids
/// serializing the recording as millions of individual JSON numbers.
#[tauri::command]
pub async fn video_store_recording(
    app: tauri::AppHandle,
    request: tauri::ipc::Request<'_>,
) -> Result<String, String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("Binary PCM recording required".into());
    };
    if bytes.len() < 44 || bytes.len() > 106_000_044
        || &bytes[..4] != b"RIFF" || &bytes[8..16] != b"WAVEfmt "
        || &bytes[36..40] != b"data"
    {
        return Err("Invalid PCM recording".into());
    }
    let data_len = u32::from_le_bytes(bytes[40..44].try_into().unwrap()) as usize;
    let channels = u16::from_le_bytes(bytes[22..24].try_into().unwrap()) as usize;
    let rate = u32::from_le_bytes(bytes[24..28].try_into().unwrap()) as usize;
    if !(1..=2).contains(&channels) || rate != 44_100 || data_len != bytes.len() - 44
        || data_len == 0 || data_len % (channels * 2) != 0
        || data_len > rate * channels * 2 * 600
    {
        return Err("Unsupported PCM recording length or format".into());
    }

    let directory = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("recordings");
    let bytes = bytes.clone();
    tauri::async_runtime::spawn_blocking(move || {
        fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
        let nonce = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e| e.to_string())?.as_nanos();
        let stem = format!("commons-{nonce}-{}", NEXT_RECORDING.fetch_add(1, Ordering::Relaxed));
        let path = directory.join(format!("{stem}.wav"));
        let temporary = directory.join(format!("{stem}.part"));
        let mut file = OpenOptions::new().write(true).create_new(true).open(&temporary).map_err(|e| e.to_string())?;
        let result = file.write_all(&bytes).and_then(|_| file.sync_all());
        drop(file);
        if let Err(error) = result.and_then(|_| fs::rename(&temporary, &path)) {
            let _ = fs::remove_file(temporary);
            return Err(format!("Could not store recording: {error}"));
        }
        Ok(path.to_string_lossy().into_owned())
    }).await.map_err(|e| e.to_string())?
}

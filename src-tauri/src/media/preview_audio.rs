use super::AudioSource;
use std::{
    collections::HashMap,
    sync::{atomic::{AtomicU64, Ordering}, mpsc::{self, Sender, SyncSender}, Mutex},
    time::Duration,
};

const RATE: u64 = 48_000;
const MAX_SAMPLES: u64 = 6 * 60 * 60 * RATE;
static NEXT_SESSION: AtomicU64 = AtomicU64::new(1);

struct ReadRequest {
    first: u64,
    count: u32,
    reply: Sender<Result<Vec<u8>, String>>,
}

#[derive(Default)]
pub struct PreviewAudioSessions(Mutex<HashMap<u64, SyncSender<ReadRequest>>>);

#[tauri::command]
pub async fn media_open_preview_audio(
    mut audio: Vec<AudioSource>,
    state: tauri::State<'_, PreviewAudioSessions>,
) -> Result<u64, String> {
    super::stream::validate_audio_sources(&mut audio)?;
    #[cfg(windows)]
    {
        let mut sessions = state.0.lock().map_err(|_| "Preview audio registry is unavailable")?;
        if sessions.len() >= 4 { return Err("Close an existing audio preview before opening another".into()); }
        let id = NEXT_SESSION.fetch_add(1, Ordering::Relaxed);
        let (sender, receiver) = mpsc::sync_channel::<ReadRequest>(2);
        std::thread::spawn(move || {
            let mut mixer = super::windows_mf::PreviewMixer::new(&audio);
            while let Ok(request) = receiver.recv() {
                let result = match &mut mixer {
                    Ok(mixer) => mixer.read(request.first, request.count),
                    Err(error) => Err(error.clone()),
                };
                let _ = request.reply.send(result);
            }
        });
        sessions.insert(id, sender);
        Ok(id)
    }
    #[cfg(not(windows))]
    {
        let _ = state;
        Err("Native audio preview requires Windows".into())
    }
}

#[tauri::command]
pub async fn media_read_preview_audio(
    id: u64, first: u64, count: u32, state: tauri::State<'_, PreviewAudioSessions>,
) -> Result<tauri::ipc::Response, String> {
    if count == 0 || count > 2 * RATE as u32 || first >= MAX_SAMPLES
        || first + u64::from(count) > MAX_SAMPLES {
        return Err("Invalid preview audio window".into());
    }
    let sender = state.0.lock().map_err(|_| "Preview audio registry is unavailable")?
        .get(&id).cloned().ok_or("Audio preview is closed")?;
    let bytes = tauri::async_runtime::spawn_blocking(move || {
        let (reply, result) = mpsc::channel();
        sender.send(ReadRequest {first, count, reply}).map_err(|_| "Audio preview stopped".to_owned())?;
        result.recv_timeout(Duration::from_secs(30)).map_err(|_| "Audio preview decode timed out".to_owned())?
    }).await.map_err(|error| error.to_string())??;
    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
pub fn media_close_preview_audio(id: u64, state: tauri::State<'_, PreviewAudioSessions>) -> Result<(), String> {
    state.0.lock().map_err(|_| "Preview audio registry is unavailable")?.remove(&id);
    Ok(())
}

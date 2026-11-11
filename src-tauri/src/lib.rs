mod aurora;
mod media;
mod projects;
mod video_library;
mod video_captions;
mod video_recordings;
mod video_workspace;
use std::collections::BTreeSet;
use tauri::Manager;

#[tauri::command]
async fn video_open_monitor(app:tauri::AppHandle)->Result<(),String>{
    if let Some(window)=app.get_webview_window("video-monitor"){
        window.set_focus().map_err(|e|e.to_string())?;
        return Ok(());
    }
    tauri::WebviewWindowBuilder::new(&app,"video-monitor",tauri::WebviewUrl::App("index.html?video-monitor".into()))
        .title("Huelith · Video Monitor").inner_size(960.,600.).min_inner_size(320.,220.)
        .build().map(|_|()).map_err(|e|e.to_string())
}

#[tauri::command]
async fn video_close_monitor(app:tauri::AppHandle)->Result<(),String>{
    if let Some(window)=app.get_webview_window("video-monitor"){window.close().map_err(|e|e.to_string())?;}
    Ok(())
}

/// Enumerate native font families without maintaining a platform-specific preset list.
#[tauri::command]
async fn list_system_fonts() -> Vec<String> {
    tauri::async_runtime::spawn_blocking(|| {
        let mut database = fontdb::Database::new();
        database.load_system_fonts();

        let mut families = BTreeSet::new();
        for face in database.faces() {
            for (family, _) in &face.families {
                let name = family.trim();
                if !name.is_empty() {
                    families.insert(name.to_owned());
                }
            }
        }
        families.into_iter().collect()
    })
    .await
    .unwrap_or_default()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(media::MediaExportSessions::default())
        .manage(media::PreviewAudioSessions::default())
        .manage(video_captions::CaptionJobs::default())
        .manage(media::recording_tools::RecordingJobs::default())
        .manage(aurora::CpuImageRegistry::default())
        .manage(aurora::AuroraController::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            list_system_fonts,
            video_library::video_library_file,
            video_recordings::video_store_recording,
            video_workspace::video_scan_media,
            video_workspace::video_create_delivery_folder,
            video_workspace::video_write_delivery_text,
            video_workspace::video_resume_png_sequence,
            video_workspace::video_open_delivery,
            video_open_monitor,
            video_close_monitor,
            video_captions::video_transcribe,
            video_captions::video_cancel_transcription,
            projects::write_project_atomic,
            projects::read_project_file,
            projects::video_collect_project,
            media::media_capabilities,
            media::media_probe_file,
            media::media_analyze_audio,
            media::media_open_preview_audio,
            media::media_read_preview_audio,
            media::media_close_preview_audio,
            media::media_decode_preview,
            media::media_export_test_pattern,
            media::media_transcode_file,
            media::recording_tools::video_prepare_recording,
            media::recording_tools::video_find_cached_proxies,
            media::recording_tools::video_scene_cuts,
            media::recording_tools::video_measure_loudness,
            media::recording_tools::video_cancel_recording,
            media::recording_tools::video_recording_timecode,
            media::media_encode_rgba_frames,
            media::media_authorize_source,
            media::media_begin_export,
            media::media_push_export_frame,
            media::media_finish_export,
            media::media_cancel_export,
            aurora::aurora_cpu_info,
            aurora::aurora_register_image,
            aurora::aurora_register_image_raw,
            aurora::aurora_release_image,
            aurora::aurora_render_cpu,
            aurora::aurora_cpu_self_test,
            aurora::aurora_set_graph_budget,
            aurora::aurora_backend_status,
            aurora::aurora_select_backend,
            aurora::aurora_render_graph,
            aurora::aurora_render_graph_bytes,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Huelith");
}

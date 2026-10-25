mod aurora;
use std::collections::BTreeSet;

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
        .manage(aurora::CpuImageRegistry::default())
        .manage(aurora::AuroraController::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            list_system_fonts,
            aurora::aurora_cpu_info,
            aurora::aurora_register_image,
            aurora::aurora_release_image,
            aurora::aurora_render_cpu,
            aurora::aurora_cpu_self_test,
            aurora::aurora_set_graph_budget,
            aurora::aurora_backend_status,
            aurora::aurora_select_backend,
            aurora::aurora_render_graph,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Huelith");
}

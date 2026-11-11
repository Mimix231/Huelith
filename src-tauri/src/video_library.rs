use std::path::{Component,Path};
use tauri::Manager;

/// Resolve a bundled asset by a relative catalog ID. Projects stay portable
/// across installation paths; arbitrary filesystem paths cannot enter here.
#[tauri::command]
pub fn video_library_file(app:tauri::AppHandle,file:String)->Result<String,String>{
    let relative=Path::new(&file);
    if file.is_empty()||file.len()>1024||relative.components().any(|p|!matches!(p,Component::Normal(_))){return Err("Invalid library asset ID".into());}
    let root=if cfg!(debug_assertions){Path::new(env!("CARGO_MANIFEST_DIR")).join("../public/video-library")}
        else{app.path().resource_dir().map_err(|e|e.to_string())?.join("video-library")};
    let root=root.canonicalize().map_err(|e|format!("Bundled library is unavailable: {e}"))?;
    let path=root.join(relative).canonicalize().map_err(|e|format!("Library file is unavailable: {e}"))?;
    if!path.starts_with(&root)||!path.is_file(){return Err("Library file is outside the asset directory".into());}
    app.asset_protocol_scope().allow_file(&path).map_err(|e|e.to_string())?;Ok(path.to_string_lossy().into_owned())
}

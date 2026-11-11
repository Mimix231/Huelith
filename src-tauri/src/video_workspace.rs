use serde::Serialize;
use std::{collections::HashSet, fs, path::{Path, PathBuf}};

#[derive(Serialize)]
pub struct MediaPath {
    path: String,
    bin: Option<String>,
}

fn media_files(paths: Vec<String>) -> Result<Vec<MediaPath>, String> {
    const VISIT_LIMIT: usize = 20_000;
    let mut found = Vec::new();
    let mut seen = HashSet::new();
    let mut visited = 0usize;
    let mut stack: Vec<(PathBuf, Option<PathBuf>)> = paths.into_iter().rev().take(512)
        .map(|path| (PathBuf::from(path), None)).collect();
    while let Some((path, root)) = stack.pop() {
        if found.len() >= 512 || visited >= VISIT_LIMIT { break; }
        visited += 1;
        let Ok(metadata) = fs::symlink_metadata(&path) else { continue; };
        if metadata.file_type().is_symlink() { continue; }
        #[cfg(windows)]
        {
            use std::os::windows::fs::MetadataExt;
            if metadata.file_attributes() & 0x400 != 0 { continue; }
        }
        if metadata.is_dir() {
            let root = root.unwrap_or_else(|| path.parent().unwrap_or(&path).to_path_buf());
            if let Ok(entries) = fs::read_dir(&path) {
                let remaining = VISIT_LIMIT.saturating_sub(visited + stack.len());
                let mut entries: Vec<_> = entries.take(remaining).filter_map(Result::ok).map(|entry| entry.path()).collect();
                entries.sort();
                stack.extend(entries.into_iter().rev().map(|entry| (entry, Some(root.clone()))));
            }
            continue;
        }
        if !metadata.is_file() || !path.extension().and_then(|value| value.to_str()).is_some_and(|extension| {
            matches!(extension.to_ascii_lowercase().as_str(),
                "mp4"|"mov"|"m4v"|"webm"|"wmv"|"avi"|"mkv"|"mp3"|"wav"|"m4a"|"aac"|"ogg"|"flac"|
                "png"|"jpg"|"jpeg"|"webp"|"bmp"|"gif"|"tga")
        }) { continue; }
        let canonical = path.canonicalize().map_err(|error|error.to_string())?;
        if seen.insert(canonical) {
            let bin = root.as_ref().and_then(|root| path.parent()?.strip_prefix(root).ok())
                .map(|folder| folder.to_string_lossy().replace('\\', "/"));
            found.push(MediaPath { path: path.to_string_lossy().into_owned(), bin });
        }
    }
    Ok(found)
}

#[tauri::command]
pub async fn video_scan_media(paths: Vec<String>) -> Result<Vec<MediaPath>, String> {
    tauri::async_runtime::spawn_blocking(move || media_files(paths)).await.map_err(|error| error.to_string())?
}

#[tauri::command]
pub fn video_open_delivery(path: String, reveal: bool) -> Result<(), String> {
    let target = Path::new(&path);
    if !target.is_absolute() || !target.exists() { return Err("The exported file has moved or been removed.".into()); }
    let is_media = target.extension().and_then(|extension| extension.to_str())
        .is_some_and(|extension| ["mp4","webm","wav","png"].iter().any(|item| extension.eq_ignore_ascii_case(item)));
    if !target.is_dir() && !is_media { return Err("Choose a video, audio or image export.".into()); }
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        use windows::{core::{w, PCWSTR}, Win32::{UI::{Shell::ShellExecuteW, WindowsAndMessaging::SW_SHOWNORMAL}, Foundation::HWND}};
        let shown = if reveal && !target.is_dir() { target.parent().unwrap_or(target) } else { target };
        let file: Vec<u16> = shown.as_os_str().encode_wide().chain([0]).collect();
        let result = unsafe { ShellExecuteW(Some(HWND::default()), w!("open"), PCWSTR(file.as_ptr()), PCWSTR::null(), PCWSTR::null(), SW_SHOWNORMAL) };
        if result.0 as isize <= 32 { return Err("Windows could not open this export.".into()); }
        Ok(())
    }
    #[cfg(not(windows))]
    { let _ = reveal; Err("Open export is available in the Windows desktop app.".into()) }
}
#[tauri::command]
pub fn video_create_delivery_folder(parent:String,name:String)->Result<String,String>{
    if name.is_empty()||name.len()>100||!name.bytes().all(|c|c.is_ascii_alphanumeric()||matches!(c,b'-'|b'_'|b'.')){
        return Err("Invalid delivery name.".into());
    }
    let directory=std::fs::canonicalize(&parent).map_err(|e|e.to_string())?;
    if !directory.is_dir(){return Err("Choose an output folder.".into());}
    for index in 0..1000{
        let label=if index==0{format!("Huelith-{name}")}else{format!("Huelith-{name}-{index:03}")};
        let output=directory.join(label);
        match std::fs::create_dir(&output){
            Ok(())=>return Ok(output.to_string_lossy().into_owned()),
            Err(error) if error.kind()==std::io::ErrorKind::AlreadyExists=>continue,
            Err(error)=>return Err(error.to_string()),
        }
    }
    Err("Choose an unused delivery name.".into())
}

#[tauri::command]
pub async fn video_write_delivery_text(path:String,contents:String)->Result<(),String>{
    use std::io::Write;
    tauri::async_runtime::spawn_blocking(move||{
        let output=std::path::Path::new(&path);
        if !output.is_absolute()||!matches!(output.extension().and_then(|value|value.to_str()),Some("srt"|"txt"))
            ||contents.len()>8*1024*1024{return Err("Invalid delivery sidecar.".into());}
        let mut file=match std::fs::OpenOptions::new().write(true).create_new(true).open(output){
            Ok(file)=>file,
            Err(error) if error.kind()==std::io::ErrorKind::AlreadyExists=>{
                if output.metadata().map(|meta|meta.len()==contents.len() as u64).unwrap_or(false)
                    &&std::fs::read(output).is_ok_and(|bytes|bytes==contents.as_bytes()){return Ok(());}
                return Err("An existing sidecar uses this name.".into());
            }
            Err(error)=>return Err(error.to_string()),
        };
        if let Err(error)=file.write_all(contents.as_bytes()).and_then(|()|file.sync_all()){
            drop(file);
            let _=std::fs::remove_file(output);
            return Err(error.to_string());
        }
        Ok(())
    }).await.map_err(|e|e.to_string())?
}

#[tauri::command]
pub async fn video_resume_png_sequence(app:tauri::AppHandle,directory:String,prefix:String,
    frames:u32,width:u32,height:u32)->Result<u32,String>{
    use std::io::{Read,Seek,SeekFrom};
    use tauri_plugin_fs::FsExt;
    if prefix.is_empty()||prefix.len()>90||!prefix.bytes().all(|c|c.is_ascii_alphanumeric()||matches!(c,b'_'|b'-'))
        ||frames==0||frames>2_592_000{return Err("Invalid image sequence.".into());}
    let root=std::fs::canonicalize(directory).map_err(|e|e.to_string())?;
    if !root.file_name().and_then(|name|name.to_str()).is_some_and(|name|name.starts_with("Huelith-")){
        return Err("Choose a dedicated Huelith delivery folder.".into());
    }
    app.fs_scope().allow_directory(&root,false).map_err(|e|e.to_string())?;
    tauri::async_runtime::spawn_blocking(move||{
        for index in 0..frames{
            let path=root.join(format!("{prefix}-{:07}.png",index+1));
            let mut file=match std::fs::File::open(path){
                Ok(file)=>file,
                Err(error) if error.kind()==std::io::ErrorKind::NotFound=>return Ok(index),
                Err(error)=>return Err(error.to_string()),
            };
            let mut header=[0u8;24];
            let mut end=[0u8;12];
            if file.read_exact(&mut header).is_err()||file.seek(SeekFrom::End(-12)).is_err()||file.read_exact(&mut end).is_err()
                ||!header.starts_with(b"\x89PNG\r\n\x1a\n")||header[16..20]!=width.to_be_bytes()
                ||header[20..24]!=height.to_be_bytes()||end[4..8]!=*b"IEND"{
                return Err(format!("Frame {} is incomplete or has different dimensions.",index+1));
            }
        }
        Ok(frames)
    }).await.map_err(|e|e.to_string())?
}


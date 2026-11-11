//! Publish validated project JSON atomically; failed saves retain the last file.
use std::{collections::HashMap,fs,io::{Read,Write},path::{Path,PathBuf},sync::atomic::{AtomicU64,Ordering}};
use serde_json::Value;
static NEXT_SAVE:AtomicU64=AtomicU64::new(1);

fn read_validated(path:&Path)->Result<String,String>{
        let extension=path.extension().and_then(|s|s.to_str()).unwrap_or("").to_ascii_lowercase();
        if !["huelith","spectrum","huelithvideo"].contains(&extension.as_str()){
            return Err("Choose a .huelith project or a supported legacy project".into());
        }
        // Read through a handle at the canonical parent, like the atomic writer.
        // Network/WSL drive aliases may retain stale pathname attributes briefly
        // after replacement, even when the newly saved file is already readable.
        let parent=path.parent().ok_or("Project directory is missing")?.canonicalize().map_err(|e|e.to_string())?;
        let resolved=parent.join(path.file_name().ok_or("Project file name is missing")?);
        let file=std::fs::File::open(&resolved).map_err(|e|format!("Project is missing or inaccessible: {e}"))?;
        let metadata=file.metadata().map_err(|e|e.to_string())?;
        if !metadata.is_file()||metadata.len()>256*1024*1024{return Err("Project is not a file or exceeds the 256 MiB JSON limit".into());}
        let mut contents=String::new();file.take(256*1024*1024+1).read_to_string(&mut contents).map_err(|e|format!("Could not read project: {e}"))?;
        if contents.len()>256*1024*1024{return Err("Project grew beyond the JSON read limit".into());}
        if contents.contains("\"portablePath\"") {
            let mut value:Value=serde_json::from_str(&contents).map_err(|e|e.to_string())?;
            if let Some(assets)=video_assets(&mut value) {
                for asset in assets {
                    if let Some(relative)=asset["portablePath"].as_str().filter(|path|portable_path(path)) {
                        asset["path"]=Value::String(parent.join(relative).to_string_lossy().into_owned());
                    }
                }
                return serde_json::to_string(&value).map_err(|e|e.to_string());
            }
        }
        Ok(contents)
}

fn video_assets(project: &mut Value) -> Option<&mut Vec<Value>> {
    if project["format"] != "huelith-video" || project["version"] != 1 { return None; }
    project["timeline"]["assets"].as_array_mut()
}

fn portable_path(path: &str) -> bool {
    path.strip_prefix("media/").is_some_and(|name| !name.is_empty() && !name.contains("..")
        && name.bytes().all(|byte| byte.is_ascii_alphanumeric() || b"_.-".contains(&byte)))
}

fn portable_contents(value: &mut Value, directory: &Path) -> Result<String, String> {
    if let Some(assets) = video_assets(value) {
        for asset in assets {
            let Some(relative)=asset["portablePath"].as_str().filter(|path|portable_path(path)).map(str::to_owned) else { continue; };
            let path=asset["path"].as_str().unwrap_or_default();
            let target=directory.join(&relative);
            if path==relative || Path::new(path)==target || target.canonicalize().ok().is_some_and(|canonical|
                Path::new(path).canonicalize().ok().as_ref()==Some(&canonical)) {
                asset["path"]=Value::String(relative);
            } else if let Some(object)=asset.as_object_mut() {
                object.remove("portablePath");
            }
        }
    }
    serde_json::to_string_pretty(value).map_err(|e|e.to_string())
}
#[tauri::command]
pub async fn read_project_file(path:String)->Result<String,String>{
    tauri::async_runtime::spawn_blocking(move||read_validated(Path::new(&path))).await.map_err(|e|e.to_string())?
}

fn write_atomic(path:&Path,contents:&str)->Result<(),String>{
    if contents.len()>256*1024*1024{return Err("Project exceeds the 256 MiB JSON save limit".into());}
    if !path.extension().and_then(|s|s.to_str()).is_some_and(|s|s.eq_ignore_ascii_case("huelith")){
        return Err("Save a new .huelith project; legacy files remain available for import".into());
    }
    let mut value:serde_json::Value=serde_json::from_str(contents).map_err(|e|format!("Project JSON is invalid: {e}"))?;
    if value["version"]!=1||!matches!(value["format"].as_str(),Some("huelith"|"spectrum"|"huelith-video")){
        return Err("Unsupported project format/version; the existing file was retained".into());
    }
    let parent=path.parent().ok_or("Project directory is missing")?.canonicalize().map_err(|e|e.to_string())?;
    let portable=if contents.contains("\"portablePath\"") && value["format"]=="huelith-video" {
        Some(portable_contents(&mut value,&parent)?)
    } else { None };
    let contents=portable.as_deref().unwrap_or(contents);
    let destination=parent.join(path.file_name().ok_or("Project file name is missing")?);
    if destination.is_symlink(){return Err("Choose a project file instead of a symbolic link".into());}
    let nonce=std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_nanos();
    let temporary=parent.join(format!(".huelith-save-{nonce}-{}.tmp",NEXT_SAVE.fetch_add(1,Ordering::Relaxed)));
    let result=(||{
        let mut file=std::fs::OpenOptions::new().write(true).create_new(true).open(&temporary).map_err(|e|e.to_string())?;
        file.write_all(contents.as_bytes()).map_err(|e|e.to_string())?;file.sync_all().map_err(|e|e.to_string())?;drop(file);
        #[cfg(windows)] if destination.exists(){
            use std::os::windows::ffi::OsStrExt;
            use windows::{core::PCWSTR,Win32::Storage::FileSystem::{ReplaceFileW,REPLACE_FILE_FLAGS}};
            let old:Vec<u16>=destination.as_os_str().encode_wide().chain(Some(0)).collect();
            let new:Vec<u16>=temporary.as_os_str().encode_wide().chain(Some(0)).collect();
            return unsafe{ReplaceFileW(PCWSTR(old.as_ptr()),PCWSTR(new.as_ptr()),PCWSTR::null(),REPLACE_FILE_FLAGS(0),None,None)}.map_err(|e|format!("Could not replace project atomically: {e}"));
        }
        std::fs::rename(&temporary,&destination).map_err(|e|e.to_string())
    })();
    if result.is_err(){let _=std::fs::remove_file(&temporary);}result
}
#[tauri::command]
pub async fn write_project_atomic(path:String,contents:String)->Result<(),String>{
    tauri::async_runtime::spawn_blocking(move||write_atomic(Path::new(&path),&contents)).await.map_err(|e|e.to_string())?
}

/// Collect a copy in a new folder. The project and media become visible
/// together once every copy has succeeded.
fn collect_video_project(parent: &Path, contents: &str) -> Result<String, String> {
    if contents.len() > 256 * 1024 * 1024 { return Err("Project exceeds the save limit".into()); }
    let mut project: Value = serde_json::from_str(contents).map_err(|e| e.to_string())?;
    let stem: String = project["name"].as_str().unwrap_or("Video").chars().take(70)
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { ' ' }).collect();
    let stem = format!("{} - Huelith", stem.trim());
    if video_assets(&mut project).ok_or("Choose a video project with a media library")?.len() > 512 { return Err("Project has too many media references".into()); }
    let parent = parent.canonicalize().map_err(|e| e.to_string())?;
    let final_path = (1..=1000).map(|index| if index == 1 { parent.join(&stem) }
        else { parent.join(format!("{stem} {index}")) }).find(|path| !path.exists()).ok_or("Choose another destination folder")?;
    let nonce=std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_nanos();
    let staging=parent.join(format!(".huelith-collect-{nonce}-{}",NEXT_SAVE.fetch_add(1,Ordering::Relaxed)));
    fs::create_dir(&staging).map_err(|e| e.to_string())?;
    let media = staging.join("media");
    let mut copies: HashMap<PathBuf, String> = HashMap::new();
    let mut files = Vec::new();
    let result = (|| {
        fs::create_dir(&media).map_err(|e| e.to_string())?;
        for asset in video_assets(&mut project).ok_or("Project media library is missing")? {
            let path=Path::new(asset["path"].as_str().ok_or("Media path is missing")?);
            let source=path.canonicalize().map_err(|e|format!("Could not find {}: {e}",path.display()))?;
            let metadata=source.metadata().map_err(|e|e.to_string())?;
            if !metadata.is_file() || metadata.len()==0 || metadata.len()>16*1024*1024*1024 {
                return Err(format!("Cannot collect {}",source.display()));
            }
            let relative=if let Some(relative)=copies.get(&source) { relative.clone() } else {
                let ext=source.extension().and_then(|ext|ext.to_str()).filter(|ext|!ext.is_empty()&&ext.len()<8
                    && ext.bytes().all(|byte|byte.is_ascii_alphanumeric())).ok_or("Media file extension is missing")?;
                let relative=format!("media/{:04}.{ext}",copies.len()+1);
                let destination=staging.join(&relative);
                files.push(destination.clone());
                let length=fs::copy(&source,&destination).map_err(|e|format!("Could not copy {}: {e}",source.display()))?;
                if length!=metadata.len() { return Err(format!("{} changed during collection",source.display())); }
                copies.insert(source,relative.clone());
                relative
            };
            asset["path"]=Value::String(relative.clone());
            asset["portablePath"]=Value::String(relative);
            if let Some(object)=asset.as_object_mut(){object.remove("libraryId");}
        }
        let project_file=staging.join("Project.huelith");
        let json=serde_json::to_string_pretty(&project).map_err(|e|e.to_string())?;
        files.push(project_file.clone());
        write_atomic(&project_file,&json)?;
        fs::rename(&staging,&final_path).map_err(|e|format!("Could not publish the collected project: {e}"))?;
        Ok(final_path.join("Project.huelith").to_string_lossy().into_owned())
    })();
    if result.is_err() {
        for path in files { let _=fs::remove_file(path); }
        let _=fs::remove_dir(media);
        let _=fs::remove_dir(staging);
    }
    result
}

#[tauri::command]
pub async fn video_collect_project(directory: String, contents: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || collect_video_project(Path::new(&directory), &contents))
        .await.map_err(|e| e.to_string())?
}
#[cfg(test)]mod tests{
    use super::*;
    #[test]
    fn portable_collection_reopens_from_a_moved_folder_without_source_dependencies() {
        let nonce=std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
        let root=std::env::temp_dir().join(format!("huelith-portable-test-{nonce}"));
        fs::create_dir(&root).unwrap();
        let original=root.join("source.wav");
        fs::write(&original,b"recording bytes").unwrap();
        let project=serde_json::json!({"format":"huelith-video","version":1,"name":"Episode",
            "timeline":{"assets":[{"id":"a","path":original},{"id":"b","path":original}]}});
        let path=PathBuf::from(collect_video_project(&root,&project.to_string()).unwrap());
        let written:Value=serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(written["timeline"]["assets"][0]["path"],"media/0001.wav");
        assert_eq!(written["timeline"]["assets"][1]["path"],"media/0001.wav");
        let moved=root.join("moved");
        fs::rename(path.parent().unwrap(),&moved).unwrap();
        let opened=moved.join("Project.huelith");
        let data=read_validated(&opened).unwrap();
        let loaded:Value=serde_json::from_str(&data).unwrap();
        let collected=Path::new(loaded["timeline"]["assets"][0]["path"].as_str().unwrap());
        assert_eq!(collected.canonicalize().unwrap(),moved.join("media/0001.wav").canonicalize().unwrap());
        assert_eq!(fs::read(collected).unwrap(),b"recording bytes");
        write_atomic(&opened,&data).unwrap();
        assert!(!fs::read_to_string(&opened).unwrap().contains("source.wav"));
        fs::remove_file(collected).unwrap();
        fs::remove_file(opened).unwrap();
        fs::remove_dir(moved.join("media")).unwrap();
        fs::remove_dir(moved).unwrap();
        fs::remove_file(original).unwrap();
        fs::remove_dir(root).unwrap();
    }
    #[test]fn failed_save_preserves_original_and_success_replaces_complete_json(){
        let dir=std::env::temp_dir().join(format!("huelith-project-save-{}",std::process::id()));std::fs::create_dir_all(&dir).unwrap();
        let path=dir.join("recovery.huelith");let old=r#"{"format":"huelith","version":1,"name":"original"}"#;
        write_atomic(&path,old).unwrap();assert!(write_atomic(&path,"truncated JSON").is_err());assert_eq!(std::fs::read_to_string(&path).unwrap(),old);
        let next=r#"{"format":"huelith","version":1,"name":"edited"}"#;write_atomic(&path,next).unwrap();assert_eq!(std::fs::read_to_string(&path).unwrap(),next);
        assert!(write_atomic(&dir.join("legacy.spectrum"),next).is_err());
        std::fs::remove_file(&path).unwrap();std::fs::remove_dir(&dir).unwrap();
    }
    #[test]fn saved_workspace_project_is_immediately_readable_through_its_drive_alias(){
        let folder=Path::new(env!("CARGO_MANIFEST_DIR")).join("../output/stage-dg");std::fs::create_dir_all(&folder).unwrap();
        let path=folder.join(format!("atomic-read-probe-{}.huelith",std::process::id()));
        let first=r#"{"format":"huelith-video","version":1,"name":"first"}"#;
        let second=r#"{"format":"huelith-video","version":1,"name":"second"}"#;
        write_atomic(&path,first).unwrap();assert_eq!(read_validated(&path).unwrap(),first);
        write_atomic(&path,second).unwrap();assert_eq!(read_validated(&path).unwrap(),second);
        std::fs::remove_file(path).unwrap();
    }
}

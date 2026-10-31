//! Keystone's native side: only what a web page cannot do. Saving files, the OS keychain,
//! finding and launching the other APG apps. Everything else is in the TypeScript app.

use serde::{Deserialize, Serialize};
use std::{collections::HashMap, fs, path::Path, process::Command, time::UNIX_EPOCH};
use tauri::ipc::{InvokeBody, Request, Response};

const KEYCHAIN_SERVICE: &str = "com.alphapremier.keystone";

#[tauri::command]
fn read_file(path: String) -> Result<Response, String> {
    fs::read(&path).map(Response::new).map_err(|e| format!("Cannot read {path}: {e}"))
}

/// Writes raw bytes (the request body) to the path in the `path` header, atomically:
/// a temporary file beside it, then a rename, so a crash never leaves half a file.
#[tauri::command]
fn write_file(request: Request<'_>) -> Result<(), String> {
    let encoded = request
        .headers()
        .get("path")
        .and_then(|v| v.to_str().ok())
        .ok_or("No path given.")?;
    let path = percent_encoding::percent_decode_str(encoded)
        .decode_utf8()
        .map_err(|e| e.to_string())?
        .into_owned();
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("Expected the file's bytes.".into());
    };
    let target = Path::new(&path);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Cannot create {}: {e}", parent.display()))?;
    }
    let temp = target.with_extension("keystone-tmp");
    fs::write(&temp, bytes).map_err(|e| format!("Cannot write {path}: {e}"))?;
    fs::rename(&temp, target).map_err(|e| {
        let _ = fs::remove_file(&temp);
        format!("Cannot save {path}: {e}")
    })
}

#[derive(Serialize)]
struct FileEntry {
    path: String,
    modified: u64,
}

/// Files in a folder, newest first. A missing or unreadable folder is just empty.
#[tauri::command]
fn list_files(folder: String) -> Vec<FileEntry> {
    let Ok(entries) = fs::read_dir(&folder) else { return vec![] };
    let mut files: Vec<FileEntry> = entries
        .flatten()
        .filter(|e| e.file_type().map(|t| t.is_file()).unwrap_or(false))
        .map(|e| FileEntry {
            path: e.path().to_string_lossy().into_owned(),
            modified: e
                .metadata()
                .and_then(|m| m.modified())
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0),
        })
        .collect();
    files.sort_by(|a, b| b.modified.cmp(&a.modified));
    files
}

/// Another Tauri app's local data folder from its identifier, if it exists on this machine:
/// %LOCALAPPDATA%\<id> on Windows, ~/Library/Application Support/<id> on macOS.
#[tauri::command]
fn app_data_folder(identifier: String) -> Option<String> {
    if identifier.contains(['/', '\\']) || identifier.contains("..") {
        return None;
    }
    let dir = dirs::data_local_dir()?.join(identifier);
    dir.is_dir().then(|| dir.to_string_lossy().into_owned())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
// Read only by the macOS and Windows locators.
#[cfg_attr(not(any(target_os = "macos", target_os = "windows")), allow(dead_code))]
struct AppLocator {
    mac_bundle_id: Option<String>,
    mac_app_name: Option<String>,
    windows_uninstall_key: Option<String>,
    windows_exe: Option<String>,
}

#[derive(Serialize, Deserialize)]
struct InstalledApp {
    path: String,
    version: Option<String>,
}

#[cfg(target_os = "macos")]
fn locate(l: &AppLocator) -> Option<InstalledApp> {
    let mut candidates: Vec<std::path::PathBuf> = vec![];
    if let Some(id) = &l.mac_bundle_id {
        if let Ok(out) = Command::new("mdfind").arg(format!("kMDItemCFBundleIdentifier == '{id}'")).output() {
            candidates.extend(String::from_utf8_lossy(&out.stdout).lines().map(std::path::PathBuf::from));
        }
    }
    if let Some(name) = &l.mac_app_name {
        candidates.push(Path::new("/Applications").join(format!("{name}.app")));
        if let Some(home) = dirs::home_dir() {
            candidates.push(home.join("Applications").join(format!("{name}.app")));
        }
    }
    let app = candidates.into_iter().find(|p| p.join("Contents/Info.plist").is_file())?;
    let version = plist::Value::from_file(app.join("Contents/Info.plist"))
        .ok()
        .and_then(|v| v.as_dictionary()?.get("CFBundleShortVersionString")?.as_string().map(str::to_owned));
    Some(InstalledApp { path: app.to_string_lossy().into_owned(), version })
}

#[cfg(target_os = "windows")]
fn locate(l: &AppLocator) -> Option<InstalledApp> {
    use winreg::{enums::*, RegKey};
    let key = l.windows_uninstall_key.as_ref()?;
    let exe = l.windows_exe.as_deref().unwrap_or("");
    for hive in [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
        let Ok(k) = RegKey::predef(hive).open_subkey(format!(r"Software\Microsoft\Windows\CurrentVersion\Uninstall\{key}")) else { continue };
        let version: Option<String> = k.get_value("DisplayVersion").ok();
        let from_icon: Option<String> = k.get_value::<String, _>("DisplayIcon").ok().map(|s| s.split(',').next().unwrap_or("").trim_matches('"').to_owned());
        let from_dir: Option<String> = k.get_value::<String, _>("InstallLocation").ok().map(|d| Path::new(&d).join(exe).to_string_lossy().into_owned());
        if let Some(path) = [from_icon, from_dir].into_iter().flatten().find(|p| p.to_lowercase().ends_with(".exe") && Path::new(p).is_file()) {
            return Some(InstalledApp { path, version });
        }
    }
    None
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn locate(_: &AppLocator) -> Option<InstalledApp> {
    None
}

#[tauri::command]
fn locate_app(locator: AppLocator) -> Option<InstalledApp> {
    locate(&locator)
}

/// Starts an installed app, handing it files: an open-documents event on macOS, file
/// arguments on Windows. Environment variables are passed through to the new process.
#[tauri::command]
fn launch_app(app: InstalledApp, files: Vec<String>, env: HashMap<String, String>) -> Result<(), String> {
    for f in &files {
        if !Path::new(f).is_file() {
            return Err(format!("{f} is not a file."));
        }
    }
    let mut cmd = if cfg!(target_os = "macos") {
        let mut c = Command::new("open");
        for (k, v) in &env {
            c.arg("--env").arg(format!("{k}={v}"));
        }
        c.arg("-a").arg(&app.path).args(&files);
        c
    } else {
        let mut c = Command::new(&app.path);
        c.args(&files).envs(&env);
        c
    };
    cmd.spawn().map(|_| ()).map_err(|e| format!("Could not start {}: {e}", app.path))
}

#[tauri::command]
fn secret_get(key: String) -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(KEYCHAIN_SERVICE, &key).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("The keychain refused: {e}")),
    }
}

#[tauri::command]
fn secret_set(key: String, value: Option<String>) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYCHAIN_SERVICE, &key).map_err(|e| e.to_string())?;
    match value {
        Some(v) => entry.set_password(&v).map_err(|e| format!("The keychain refused: {e}")),
        None => match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(format!("The keychain refused: {e}")),
        },
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            read_file,
            write_file,
            list_files,
            app_data_folder,
            locate_app,
            launch_app,
            secret_get,
            secret_set
        ])
        .run(tauri::generate_context!())
        .expect("Keystone could not start");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_newest_first_and_tolerates_missing_folders() {
        let dir = std::env::temp_dir().join(format!("keystone-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("a.apbackup"), b"a").unwrap();
        std::thread::sleep(std::time::Duration::from_millis(1100));
        fs::write(dir.join("b.apbackup"), b"b").unwrap();
        let files = list_files(dir.to_string_lossy().into_owned());
        assert!(files[0].path.ends_with("b.apbackup"));
        assert!(list_files("/no/such/folder".into()).is_empty());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn refuses_path_tricks_in_identifiers() {
        assert!(app_data_folder("../etc".into()).is_none());
        assert!(app_data_folder("a/b".into()).is_none());
    }
}

//! Keystone's native side: only what a web page cannot do. Reading and saving files, and finding and starting the
//! other APG apps. Everything else is in the TypeScript app.

use serde::{Deserialize, Serialize};
use std::{fs, path::Path, process::Command};
use tauri::ipc::{InvokeBody, Request, Response};

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

/// Starts an installed app: `open -a` on macOS, its executable on Windows.
#[tauri::command]
fn launch_app(app: InstalledApp) -> Result<(), String> {
    let mut cmd = if cfg!(target_os = "macos") {
        let mut c = Command::new("open");
        c.arg("-a").arg(&app.path);
        c
    } else {
        Command::new(&app.path)
    };
    cmd.spawn().map(|_| ()).map_err(|e| format!("Could not start {}: {e}", app.path))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![read_file, write_file, locate_app, launch_app])
        .run(tauri::generate_context!())
        .expect("Keystone could not start");
}

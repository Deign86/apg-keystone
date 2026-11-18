//! Keystone's native side: only what a web page cannot do. Reading and saving files, and finding, starting and
//! installing the other APG apps. Everything else is in the TypeScript app.

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

// Installing the other APG apps (docs/adr/0029). The page names a repository and a file; this side decides what is
// allowed: only Deign86's repositories, only files served by github.com from one of them, only installer types, and
// only a download that matches the digest GitHub published for it.

const OWNER: &str = "Deign86";
const INSTALLER_TYPES: [&str; 4] = ["exe", "dmg", "zip", "pkg"];

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
struct ReleaseAsset {
    name: String,
    url: String,
    digest: Option<String>,
}

#[derive(Serialize, Debug, PartialEq)]
struct AppRelease {
    version: String,
    assets: Vec<ReleaseAsset>,
}

fn plain(part: &str) -> bool {
    !part.is_empty() && !part.starts_with('.') && part.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'))
}

/// "Deign86/apg-id-creator" and nothing that could point anywhere else.
fn allowed_repo(repo: &str) -> Result<&str, String> {
    match repo.split_once('/') {
        Some((owner, name)) if owner == OWNER && plain(name) => Ok(repo),
        _ => Err(format!("{repo} is not one of Alpha Premier's apps.")),
    }
}

/// The file name to save an installer under, when the asset is an installer on github.com in one of our repositories.
fn allowed_installer(asset: &ReleaseAsset) -> Result<&str, String> {
    let refuse = || format!("{} is not an installer from one of Alpha Premier's apps.", asset.name);
    let path = asset.url.strip_prefix(&format!("https://github.com/{OWNER}/")).ok_or_else(refuse)?;
    let parts: Vec<&str> = path.split('/').collect();
    // <repo>/releases/download/<tag>/<file>
    let ok = parts.len() == 5 && parts[1] == "releases" && parts[2] == "download" && parts.iter().all(|p| plain(p)) && parts[4] == asset.name;
    let installer = asset.name.rsplit_once('.').is_some_and(|(_, ext)| INSTALLER_TYPES.contains(&ext.to_ascii_lowercase().as_str()));
    if ok && installer { Ok(&asset.name) } else { Err(refuse()) }
}

/// GitHub's answer for a latest release, reduced to what the page needs.
fn read_release(body: &serde_json::Value) -> Result<AppRelease, String> {
    let tag = body.get("tag_name").and_then(|t| t.as_str()).ok_or("The release has no version.")?;
    let assets = body
        .get("assets")
        .and_then(|a| a.as_array())
        .into_iter()
        .flatten()
        .filter_map(|a| {
            Some(ReleaseAsset {
                name: a.get("name")?.as_str()?.to_owned(),
                url: a.get("browser_download_url")?.as_str()?.to_owned(),
                digest: a.get("digest").and_then(|d| d.as_str()).map(str::to_owned),
            })
        })
        .collect();
    Ok(AppRelease { version: tag.trim_start_matches(['v', 'V']).to_owned(), assets })
}

/// True when the bytes' SHA-256 is the one GitHub published ("sha256:<hex>").
fn matches_digest(hash: &[u8], digest: &str) -> bool {
    let hex: String = hash.iter().map(|b| format!("{b:02x}")).collect();
    digest.strip_prefix("sha256:").is_some_and(|want| want.eq_ignore_ascii_case(&hex))
}

fn web() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(concat!("Keystone/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("Could not start a download: {e}"))
}

#[tauri::command]
fn cpu_arch() -> &'static str {
    std::env::consts::ARCH
}

#[tauri::command]
async fn latest_release(repo: String) -> Result<AppRelease, String> {
    let repo = allowed_repo(&repo)?;
    let answer = web()?
        .get(format!("https://api.github.com/repos/{repo}/releases/latest"))
        .header("Accept", "application/vnd.github+json")
        .timeout(std::time::Duration::from_secs(20))
        .send()
        .await
        .map_err(|_| "Could not reach GitHub. Check the internet connection.".to_string())?;
    if !answer.status().is_success() {
        return Err(format!("GitHub answered {} for {repo}'s latest release.", answer.status().as_u16()));
    }
    read_release(&answer.json().await.map_err(|e| format!("GitHub's answer could not be read: {e}"))?)
}

/// Downloads an installer into the temporary folder, checks it, and opens it the way a double-click would (so a
/// setup program can ask for administrator rights, and a disk image mounts).
#[tauri::command]
async fn install_from(asset: ReleaseAsset) -> Result<(), String> {
    use sha2::{Digest, Sha256};
    use std::io::Write;
    let name = allowed_installer(&asset)?;
    let folder = std::env::temp_dir().join("keystone-installers");
    fs::create_dir_all(&folder).map_err(|e| format!("Cannot create {}: {e}", folder.display()))?;
    let target = folder.join(name);
    let partial = folder.join(format!("{name}.part"));
    let mut answer = web()?.get(&asset.url).send().await.map_err(|_| "Could not reach GitHub. Check the internet connection.".to_string())?;
    if !answer.status().is_success() {
        return Err(format!("GitHub answered {} for {name}.", answer.status().as_u16()));
    }
    let mut hash = Sha256::new();
    {
        let mut file = fs::File::create(&partial).map_err(|e| format!("Cannot write {}: {e}", partial.display()))?;
        while let Some(chunk) = answer.chunk().await.map_err(|e| format!("The download of {name} stopped: {e}"))? {
            hash.update(&chunk);
            file.write_all(&chunk).map_err(|e| format!("Cannot write {}: {e}", partial.display()))?;
        }
    }
    if let Some(digest) = &asset.digest {
        if !matches_digest(&hash.finalize(), digest) {
            let _ = fs::remove_file(&partial);
            return Err(format!("{name} did not arrive as GitHub published it, so it was not opened. Try again."));
        }
    }
    let _ = fs::remove_file(&target);
    fs::rename(&partial, &target).map_err(|e| format!("Cannot save {}: {e}", target.display()))?;
    tauri_plugin_opener::open_path(&target, None::<&str>).map_err(|e| format!("Could not open {name}: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn asset(name: &str, url: &str) -> ReleaseAsset {
        ReleaseAsset { name: name.into(), url: url.into(), digest: None }
    }

    #[test]
    fn only_alpha_premiers_repositories_are_asked() {
        assert!(allowed_repo("Deign86/apg-id-creator").is_ok());
        assert!(allowed_repo("Deign86/Alpha_Branding").is_ok());
        for bad in ["someone/apg-id-creator", "Deign86", "Deign86/", "Deign86/a/b", "Deign86/..", "Deign86/a?x=1", "Deign86/a b", "deign86/apg-id-creator", ""] {
            assert!(allowed_repo(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn only_an_installer_from_one_of_our_releases_is_fetched() {
        let good = "https://github.com/Deign86/apg-id-creator/releases/download/v2.0.4/AlphaPremierIdMaker-Setup-v2.0.4.exe";
        assert_eq!(allowed_installer(&asset("AlphaPremierIdMaker-Setup-v2.0.4.exe", good)), Ok("AlphaPremierIdMaker-Setup-v2.0.4.exe"));
        assert!(allowed_installer(&asset("Alpha.Premier.Attendance_0.2.51_aarch64.dmg", "https://github.com/Deign86/alpha-premier-attendance/releases/download/v0.2.51/Alpha.Premier.Attendance_0.2.51_aarch64.dmg")).is_ok());
        for (name, url) in [
            ("setup.exe", "https://github.com/someone/else/releases/download/v1/setup.exe"),
            ("setup.exe", "http://github.com/Deign86/a/releases/download/v1/setup.exe"),
            ("setup.exe", "https://github.com.evil.test/Deign86/a/releases/download/v1/setup.exe"),
            ("setup.exe", "https://github.com/Deign86/a/releases/download/v1/other.exe"),
            ("setup.exe", "https://github.com/Deign86/a/releases/download/v1/../setup.exe"),
            ("setup.exe", "https://github.com/Deign86/a/raw/main/x/setup.exe"),
            ("setup.exe", "https://github.com/Deign86/a/releases/download/v1/setup.exe?x=1"),
            ("run.bat", "https://github.com/Deign86/a/releases/download/v1/run.bat"),
            ("latest.json", "https://github.com/Deign86/a/releases/download/v1/latest.json"),
            ("..exe", "https://github.com/Deign86/a/releases/download/v1/..exe"),
        ] {
            assert!(allowed_installer(&asset(name, url)).is_err(), "{url}");
        }
    }

    /// What every installed connector asks for (connected-apps.json, which apps/keystone/src/test/connected-apps.test.ts
    /// holds to the connectors): its repository and the installers of one real release. All of it is allowed.
    #[test]
    fn every_connected_app_is_allowed() {
        let apps: serde_json::Value = serde_json::from_str(include_str!("connected-apps.json")).unwrap();
        let apps = apps.as_object().unwrap();
        assert!(!apps.is_empty());
        for (id, app) in apps {
            let (repo, tag) = (app["repo"].as_str().unwrap(), app["tag"].as_str().unwrap());
            assert_eq!(allowed_repo(repo), Ok(repo), "{id}");
            let installers = app["installers"].as_array().unwrap();
            assert!(!installers.is_empty(), "{id} names no installer");
            for name in installers {
                let name = name.as_str().unwrap();
                let file = asset(name, &format!("https://github.com/{repo}/releases/download/{tag}/{name}"));
                assert_eq!(allowed_installer(&file), Ok(name), "{id}");
            }
        }
    }

    #[test]
    fn a_release_is_read_as_github_writes_it() {
        let body = serde_json::json!({"tag_name": "v2.0.4", "assets": [
            {"name": "a.exe", "browser_download_url": "https://github.com/Deign86/x/releases/download/v2.0.4/a.exe", "digest": "sha256:ab"},
            {"name": "old.dmg", "browser_download_url": "https://github.com/Deign86/x/releases/download/v2.0.4/old.dmg", "digest": null},
            {"name": "broken"},
        ]});
        let release = read_release(&body).unwrap();
        assert_eq!(release.version, "2.0.4");
        assert_eq!(release.assets.len(), 2);
        assert_eq!(release.assets[0].digest.as_deref(), Some("sha256:ab"));
        assert_eq!(release.assets[1].digest, None);
        assert!(read_release(&serde_json::json!({"message": "Not Found"})).is_err());
    }

    #[test]
    fn a_download_is_opened_only_when_it_matches_githubs_digest() {
        use sha2::{Digest, Sha256};
        let hash = Sha256::digest(b"installer");
        let hex: String = hash.iter().map(|b| format!("{b:02x}")).collect();
        assert!(matches_digest(&hash, &format!("sha256:{hex}")));
        assert!(matches_digest(&hash, &format!("sha256:{}", hex.to_uppercase())));
        assert!(!matches_digest(&Sha256::digest(b"installer!"), &format!("sha256:{hex}")));
        assert!(!matches_digest(&hash, &hex), "a digest of another kind is not a match");
        assert!(!matches_digest(&hash, "sha256:"));
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![read_file, write_file, locate_app, launch_app, cpu_arch, latest_release, install_from])
        .run(tauri::generate_context!())
        .expect("Keystone could not start");
}

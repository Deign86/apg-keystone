//! Keystone's native side: only what a web page cannot do. Reading and saving files, and finding, starting and
//! installing the other APG apps. Everything else is in the TypeScript app.

use serde::{Deserialize, Serialize};
use std::{fs, path::Path, process::Command};
use tauri::ipc::{InvokeBody, Request, Response};

#[tauri::command]
fn read_file(path: String) -> Result<Response, String> {
    fs::read(&path).map(Response::new).map_err(|e| format!("Cannot read {path}: {e}"))
}

/// Whether there is a file at the path. "No" is an answer (nothing saved yet); not being able to tell (no permission
/// to look in the folder, a failing disk) is an error, so the page never takes an unreadable file for a missing one.
fn exists(path: &Path) -> Result<bool, String> {
    path.try_exists().map_err(|e| format!("Cannot look for {}: {e}", path.display()))
}

#[tauri::command]
fn file_exists(path: String) -> Result<bool, String> {
    exists(Path::new(&path))
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

/// How long a connected app may take, as the page counts it too: packages/core/src/kernel/deadlines.json, the one
/// definition (core's `DEADLINES`). `answer` is for a question to GitHub; `install` is for a download.
struct Deadlines {
    answer: std::time::Duration,
    install: std::time::Duration,
}

/// The page gives up on a download when `install` is over, counted from just before it asks for one. This side stops
/// this much sooner, so an installer is never opened after the page has said it gave up.
const GIVES_UP_EARLY: std::time::Duration = std::time::Duration::from_secs(30);

fn deadlines() -> Result<Deadlines, String> {
    let said: serde_json::Value = serde_json::from_str(include_str!("../../../../packages/core/src/kernel/deadlines.json"))
        .map_err(|e| format!("deadlines.json could not be read: {e}"))?;
    let number = |key: &str| said.get(key).and_then(|v| v.as_u64()).ok_or(format!("deadlines.json has no {key}."));
    let install = std::time::Duration::from_secs(number("installMinutes")? * 60);
    Ok(Deadlines {
        answer: std::time::Duration::from_secs(number("answerSeconds")?),
        install: install.checked_sub(GIVES_UP_EARLY).filter(|d| !d.is_zero()).ok_or("deadlines.json leaves no time to install.")?,
    })
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
        .timeout(deadlines()?.answer)
        .send()
        .await
        .map_err(|_| "Could not reach GitHub. Check the internet connection.".to_string())?;
    if !answer.status().is_success() {
        return Err(format!("GitHub answered {} for {repo}'s latest release.", answer.status().as_u16()));
    }
    read_release(&answer.json().await.map_err(|e| format!("GitHub's answer could not be read: {e}"))?)
}

/// What a download that ran out of time says, whether the time ran out while it was arriving or just as it ended.
fn took_too_long(name: &str) -> String {
    format!("{name} took too long to arrive, so it was not opened. Try again.")
}

/// Writes what arrives to `partial` and answers its SHA-256. The request's own limit stops a download still running
/// when the time is up; that reads as an error from the next piece, and is told apart from a line that dropped.
async fn receive(answer: &mut reqwest::Response, partial: &Path, name: &str, late: impl Fn() -> bool) -> Result<Vec<u8>, String> {
    use sha2::{Digest, Sha256};
    use std::io::Write;
    let mut hash = Sha256::new();
    let mut file = fs::File::create(partial).map_err(|e| format!("Cannot write {}: {e}", partial.display()))?;
    loop {
        match answer.chunk().await {
            Ok(Some(chunk)) => {
                hash.update(&chunk);
                file.write_all(&chunk).map_err(|e| format!("Cannot write {}: {e}", partial.display()))?;
            }
            Ok(None) => return Ok(hash.finalize().to_vec()),
            Err(e) if e.is_timeout() || late() => return Err(took_too_long(name)),
            Err(e) => return Err(format!("The download of {name} stopped: {e}")),
        }
    }
}

/// Fetches a file into the folder under its name and answers where it is, checked against GitHub's digest when there
/// is one. The whole of it has `limit`. Whatever stops it, no half-written `.part` file is left behind.
async fn fetch(client: &reqwest::Client, url: &str, name: &str, digest: Option<&str>, folder: &Path, limit: std::time::Duration) -> Result<std::path::PathBuf, String> {
    let target = folder.join(name);
    let partial = folder.join(format!("{name}.part"));
    let started = std::time::Instant::now();
    let late = || started.elapsed() >= limit;
    // The limit covers the answer and every byte of the file after it.
    let mut answer = client.get(url).timeout(limit).send().await.map_err(|e| {
        if e.is_timeout() && late() { took_too_long(name) } else { "Could not reach GitHub. Check the internet connection.".to_string() }
    })?;
    if !answer.status().is_success() {
        return Err(format!("GitHub answered {} for {name}.", answer.status().as_u16()));
    }
    let hash = match receive(&mut answer, &partial, name, late).await {
        Ok(hash) => hash,
        Err(why) => {
            let _ = fs::remove_file(&partial);
            return Err(why);
        }
    };
    if digest.is_some_and(|digest| !matches_digest(&hash, digest)) {
        let _ = fs::remove_file(&partial);
        return Err(format!("{name} did not arrive as GitHub published it, so it was not opened. Try again."));
    }
    if late() {
        let _ = fs::remove_file(&partial);
        return Err(took_too_long(name));
    }
    let _ = fs::remove_file(&target);
    fs::rename(&partial, &target).map_err(|e| format!("Cannot save {}: {e}", target.display()))?;
    Ok(target)
}

/// Downloads an installer into the temporary folder, checks it, and opens it the way a double-click would (so a
/// setup program can ask for administrator rights, and a disk image mounts). The whole of it has `Deadlines::install`:
/// a download still running then is stopped, and one that only just made it is not opened late.
#[tauri::command]
async fn install_from(asset: ReleaseAsset) -> Result<(), String> {
    let name = allowed_installer(&asset)?;
    let folder = std::env::temp_dir().join("keystone-installers");
    fs::create_dir_all(&folder).map_err(|e| format!("Cannot create {}: {e}", folder.display()))?;
    let target = fetch(&web()?, &asset.url, name, asset.digest.as_deref(), &folder, deadlines()?.install).await?;
    tauri_plugin_opener::open_path(&target, None::<&str>).map_err(|e| format!("Could not open {name}: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn asset(name: &str, url: &str) -> ReleaseAsset {
        ReleaseAsset { name: name.into(), url: url.into(), digest: None }
    }

    #[test]
    fn a_missing_file_is_told_from_one_that_is_there() {
        let folder = std::env::temp_dir().join(format!("keystone-test-{}", std::process::id()));
        fs::create_dir_all(&folder).unwrap();
        let file = folder.join("state.json");
        assert_eq!(exists(&file), Ok(false));
        fs::write(&file, "{}").unwrap();
        assert_eq!(exists(&file), Ok(true));
        fs::remove_dir_all(&folder).unwrap();
        assert_eq!(exists(&file), Ok(false));
    }

    /// The page's deadlines (deadlines.json) are this side's too, and a download gives up before the page does.
    #[test]
    fn the_native_limits_are_the_pages_and_a_download_gives_up_first() {
        let page: serde_json::Value = serde_json::from_str(include_str!("../../../../packages/core/src/kernel/deadlines.json")).unwrap();
        let d = deadlines().unwrap();
        assert_eq!(d.answer.as_secs(), page["answerSeconds"].as_u64().unwrap());
        assert!(d.install < std::time::Duration::from_secs(page["installMinutes"].as_u64().unwrap() * 60));
        assert_eq!(d.install + GIVES_UP_EARLY, std::time::Duration::from_secs(page["installMinutes"].as_u64().unwrap() * 60));
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

    /// A computer that answers one request with the start of a file and then says no more, as a stalled line does.
    fn stalls_after(sent: &'static [u8], claimed: usize) -> String {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        std::thread::spawn(move || {
            let (mut line, _) = listener.accept().unwrap();
            let _ = line.read(&mut [0u8; 2048]);
            let _ = line.write_all(format!("HTTP/1.1 200 OK\r\nContent-Length: {claimed}\r\n\r\n").as_bytes());
            let _ = line.write_all(sent);
            let _ = line.flush();
            std::thread::sleep(std::time::Duration::from_secs(5));
        });
        format!("http://{address}/setup.exe")
    }

    fn fetched(url: &str, folder: &Path, limit: std::time::Duration) -> Result<std::path::PathBuf, String> {
        let client = reqwest::Client::builder().no_proxy().build().unwrap();
        tauri::async_runtime::block_on(fetch(&client, url, "setup.exe", None, folder, limit))
    }

    /// A download that is still arriving when its time is up says it took too long, and leaves no partial file.
    #[test]
    fn a_download_that_runs_out_of_time_says_so_and_leaves_no_partial_file() {
        let folder = std::env::temp_dir().join(format!("keystone-test-late-{}", std::process::id()));
        fs::create_dir_all(&folder).unwrap();
        let said = fetched(&stalls_after(b"half of it", 1000), &folder, std::time::Duration::from_millis(600));
        assert_eq!(said, Err("setup.exe took too long to arrive, so it was not opened. Try again.".to_string()));
        assert_eq!(fs::read_dir(&folder).unwrap().count(), 0, "nothing is left in the folder");
        fs::remove_dir_all(&folder).unwrap();
    }

    /// The same download with time to spare arrives whole, under its own name.
    #[test]
    fn a_download_in_time_is_saved_under_its_name() {
        let folder = std::env::temp_dir().join(format!("keystone-test-whole-{}", std::process::id()));
        fs::create_dir_all(&folder).unwrap();
        let saved = fetched(&stalls_after(b"all of it", 9), &folder, std::time::Duration::from_secs(4)).unwrap();
        assert_eq!(saved, folder.join("setup.exe"));
        assert_eq!(fs::read(&saved).unwrap(), b"all of it");
        assert!(!folder.join("setup.exe.part").exists());
        fs::remove_dir_all(&folder).unwrap();
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
        .invoke_handler(tauri::generate_handler![read_file, file_exists, write_file, locate_app, launch_app, cpu_arch, latest_release, install_from])
        .run(tauri::generate_context!())
        .expect("Keystone could not start");
}

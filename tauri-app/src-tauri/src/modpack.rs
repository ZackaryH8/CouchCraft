use base64::{engine::general_purpose::STANDARD, Engine as _};
use futures::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::io::Read;
use std::sync::Arc;
use tauri::{Emitter, Manager};
use tokio::sync::Semaphore;

use crate::install::{download_checked, sha1_ok, PrepareProgress};

// ── Modrinth API types ────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct MrVersion {
    id: String,
    name: String,
    game_versions: Vec<String>,
    loaders: Vec<String>,
    files: Vec<MrFile>,
}

#[derive(Deserialize)]
struct MrFile {
    url: String,
    filename: String,
    primary: bool,
    size: u64,
}

// ── .mrpack manifest types ────────────────────────────────────────────────────

#[derive(Deserialize)]
struct MrpackManifest {
    name: String,
    files: Vec<MrpackEntry>,
    dependencies: std::collections::HashMap<String, String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MrpackEntry {
    path: String,
    hashes: MrpackHashes,
    downloads: Vec<String>,
    file_size: u64,
    env: Option<MrpackEnv>,
}

#[derive(Deserialize)]
struct MrpackHashes {
    sha1: Option<String>,
}

#[derive(Deserialize)]
struct MrpackEnv {
    client: String,
}

// ── Output types ──────────────────────────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModpackVersionInfo {
    pub version_id: String,
    pub version_name: String,
    pub mc_versions: Vec<String>,
    pub loader_type: String,
    pub file_url: String,
    pub file_size: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledMod {
    pub filename: String,
    pub modrinth_project_id: Option<String>,
    pub modrinth_version_id: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MrpackInstallResult {
    pub name: String,
    pub mc_version: String,
    pub loader_type: String,
    pub loader_version: String,
    pub icon_data: Option<String>,
    pub installed_mods: Vec<InstalledMod>,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn modrinth_client() -> Result<Client, String> {
    Client::builder()
        .user_agent("CouchCraft/0.1 (github.com/couchcraft)")
        .build()
        .map_err(|e| e.to_string())
}

fn primary_file(files: &[MrFile]) -> Option<&MrFile> {
    files.iter().find(|f| f.primary)
        .or_else(|| files.iter().find(|f| f.filename.ends_with(".mrpack")))
        .or_else(|| files.first())
}

// Parse project_id and version_id from Modrinth CDN URLs:
// https://cdn.modrinth.com/data/{project_id}/versions/{version_id}/{filename}
fn parse_modrinth_ids(url: &str) -> (Option<String>, Option<String>) {
    let parts: Vec<&str> = url.split('/').collect();
    if let Some(data_pos) = parts.iter().position(|&s| s == "data") {
        let project_id = parts.get(data_pos + 1).map(|s| s.to_string());
        let version_id = parts.iter().position(|&s| s == "versions")
            .and_then(|p| parts.get(p + 1))
            .map(|s| s.to_string());
        return (project_id, version_id);
    }
    (None, None)
}

fn loader_from_deps(deps: &std::collections::HashMap<String, String>) -> (String, String) {
    for (key, ver) in deps {
        let loader = match key.as_str() {
            "fabric-loader" => "fabric",
            "quilt-loader"  => "quilt",
            "neoforge"      => "neoforge",
            "forge"         => "forge",
            _ => continue,
        };
        return (loader.to_string(), ver.clone());
    }
    ("vanilla".to_string(), String::new())
}

// ── Commands ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn list_modpack_versions(project_id: String) -> Result<Vec<ModpackVersionInfo>, String> {
    let client = modrinth_client()?;
    let url = format!("https://api.modrinth.com/v2/project/{}/version", project_id);

    let versions: Vec<MrVersion> = client
        .get(&url)
        .send().await.map_err(|e| format!("Fetch error: {e}"))?
        .json().await.map_err(|e| format!("Parse error: {e}"))?;

    let out = versions.into_iter().filter_map(|v| {
        let file = primary_file(&v.files)?;
        let loader = v.loaders.first()
            .map(|s| s.as_str())
            .and_then(|s| match s { "fabric"|"quilt"|"forge"|"neoforge"|"vanilla" => Some(s), _ => None })
            .unwrap_or("fabric")
            .to_string();
        Some(ModpackVersionInfo {
            version_id:   v.id,
            version_name: v.name,
            mc_versions:  v.game_versions,
            loader_type:  loader,
            file_url:     file.url.clone(),
            file_size:    file.size,
        })
    }).collect();

    Ok(out)
}

#[tauri::command]
pub async fn install_mrpack(
    app: tauri::AppHandle,
    instance_id: String,
    version_id: String,
    icon_url: Option<String>,
) -> Result<MrpackInstallResult, String> {
    let base    = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let mc_dir  = base.join("instances").join(&instance_id).join(".minecraft");
    let client  = modrinth_client()?;

    macro_rules! emit {
        ($stage:expr, $msg:expr, $done:expr, $total:expr) => {
            let _ = app.emit("prepare-progress", PrepareProgress {
                stage:   $stage.to_string(),
                message: $msg.to_string(),
                done:    $done,
                total:   $total,
            });
        };
    }

    // 1. Resolve version → get .mrpack file URL
    emit!("pack", "Fetching pack info…", 0, 1);
    let ver_url  = format!("https://api.modrinth.com/v2/version/{}", version_id);
    let version: MrVersion = client.get(&ver_url)
        .send().await.map_err(|e| e.to_string())?
        .json().await.map_err(|e| e.to_string())?;

    let pack_file = primary_file(&version.files)
        .ok_or("No .mrpack file found in version")?;

    // 2. Stream-download the .mrpack into memory with progress
    let resp  = client.get(&pack_file.url).send().await.map_err(|e| e.to_string())?;
    let total = resp.content_length().unwrap_or(0);
    let mut stream = resp.bytes_stream();
    let mut pack_bytes: Vec<u8> = Vec::with_capacity(total as usize);

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        pack_bytes.extend_from_slice(&chunk);
        let done = pack_bytes.len() as u32;
        let _ = app.emit("prepare-progress", PrepareProgress {
            stage:   "pack".into(),
            message: format!("Downloading pack… ({}%)",
                if total > 0 { pack_bytes.len() as u64 * 100 / total } else { 0 }),
            done,
            total: total.max(1) as u32,
        });
    }
    emit!("pack", "Pack downloaded", 1, 1);

    // 3. Parse ZIP: read manifest, extract overrides
    let cursor = std::io::Cursor::new(&pack_bytes);
    let mut zip = zip::ZipArchive::new(cursor).map_err(|e| e.to_string())?;

    // Read modrinth.index.json
    let manifest: MrpackManifest = {
        let mut entry = zip.by_name("modrinth.index.json")
            .map_err(|_| "modrinth.index.json not found in pack")?;
        let mut buf = Vec::new();
        entry.read_to_end(&mut buf).map_err(|e| e.to_string())?;
        serde_json::from_slice(&buf).map_err(|e| format!("Manifest parse: {e}"))?
    };

    // Extract overrides/ and client-overrides/ into .minecraft/
    emit!("overrides", "Extracting overrides…", 0, 1);
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i).map_err(|e| e.to_string())?;
        let name = entry.name().to_string();
        let rel = if let Some(r) = name.strip_prefix("overrides/") { r.to_string() }
                  else if let Some(r) = name.strip_prefix("client-overrides/") { r.to_string() }
                  else { continue };
        if rel.is_empty() || rel.ends_with('/') { continue; }
        let dest = mc_dir.join(&rel);
        if let Some(p) = dest.parent() { std::fs::create_dir_all(p).map_err(|e| e.to_string())?; }
        let mut out = std::fs::File::create(&dest).map_err(|e| e.to_string())?;
        std::io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
    }
    emit!("overrides", "Overrides extracted", 1, 1);

    // 4. Download mod files (client-required only)
    let client_files: Vec<_> = manifest.files.iter()
        .filter(|f| f.env.as_ref().map(|e| e.client != "unsupported").unwrap_or(true))
        .filter(|f| !f.downloads.is_empty())
        .collect::<Vec<_>>();

    let installed_mods: Vec<InstalledMod> = client_files.iter()
        .filter(|f| f.path.starts_with("mods/"))
        .map(|f| {
            let filename = std::path::Path::new(&f.path)
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_else(|| f.path.clone());
            let (project_id, version_id) = parse_modrinth_ids(&f.downloads[0]);
            InstalledMod { filename, modrinth_project_id: project_id, modrinth_version_id: version_id }
        })
        .collect();

    let files: Vec<_> = client_files.into_iter()
        .map(|f| (
            mc_dir.join(&f.path),
            f.downloads[0].clone(),
            f.hashes.sha1.clone(),
            f.file_size,
        ))
        .collect();

    let total_files = files.len() as u32;
    emit!("mods", "Installing mods…", 0, total_files);

    let sem = Arc::new(Semaphore::new(8));
    let mut handles = Vec::new();

    for (i, (dest_path, url, sha1, _size)) in files.into_iter().enumerate() {
        let client2  = client.clone();
        let sem2     = sem.clone();
        let app2     = app.clone();

        handles.push(tokio::spawn(async move {
            let _permit = sem2.acquire().await.unwrap();

            // Skip if file exists and hash matches
            if dest_path.exists() {
                if let Some(ref h) = sha1 {
                    if sha1_ok(&dest_path, h) {
                        let _ = app2.emit("prepare-progress", PrepareProgress {
                            stage: "mods".into(),
                            message: format!("Mods ({}/{})", i + 1, total_files),
                            done: (i + 1) as u32,
                            total: total_files,
                        });
                        return Ok::<(), String>(());
                    }
                }
            }

            download_checked(&client2, &url, &dest_path, sha1.as_deref()).await?;

            let _ = app2.emit("prepare-progress", PrepareProgress {
                stage: "mods".into(),
                message: format!("Mods ({}/{})", i + 1, total_files),
                done: (i + 1) as u32,
                total: total_files,
            });
            Ok(())
        }));
    }

    for h in handles { h.await.map_err(|e| e.to_string())??; }

    // 5. Download icon
    let icon_data: Option<String> = if let Some(url) = icon_url {
        match client.get(&url).send().await {
            Ok(resp) => match resp.bytes().await {
                Ok(bytes) => Some(STANDARD.encode(&bytes)),
                Err(_) => None,
            },
            Err(_) => None,
        }
    } else {
        None
    };

    // 6. Parse loader metadata from dependencies
    let mc_version = manifest.dependencies.get("minecraft").cloned().unwrap_or_default();
    let (loader_type, loader_version) = loader_from_deps(&manifest.dependencies);

    emit!("done", "Installation complete!", 1, 1);

    Ok(MrpackInstallResult {
        name: manifest.name,
        mc_version,
        loader_type,
        loader_version,
        icon_data,
        installed_mods,
    })
}

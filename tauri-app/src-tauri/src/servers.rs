use flate2::read::GzDecoder;
use serde::{Deserialize, Serialize};
use std::io::Read;
use std::path::PathBuf;
use tauri::Manager;

#[derive(Deserialize)]
struct ServersDat {
    servers: Option<Vec<ServerEntry>>,
}

#[derive(Deserialize)]
struct ServerEntry {
    name: Option<String>,
    ip: Option<String>,
    icon: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerInfo {
    pub name: String,
    pub ip: String,
    pub icon: Option<String>,
}

fn mc_root(app: &tauri::AppHandle, instance_id: &str) -> PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_default()
        .join("instances")
        .join(instance_id)
        .join(".minecraft")
}

fn try_parse(bytes: &[u8]) -> Option<ServersDat> {
    fastnbt::from_bytes::<ServersDat>(bytes).ok()
}

#[tauri::command]
pub async fn list_servers(
    app: tauri::AppHandle,
    instance_id: String,
) -> Result<Vec<ServerInfo>, String> {
    let dat_path = mc_root(&app, &instance_id).join("servers.dat");
    if !dat_path.exists() {
        return Ok(vec![]);
    }

    let bytes = std::fs::read(&dat_path).map_err(|e| e.to_string())?;

    // servers.dat may or may not be gzip-compressed; try raw first, then gzip.
    let parsed = try_parse(&bytes).or_else(|| {
        let mut dec = GzDecoder::new(&bytes[..]);
        let mut buf = Vec::new();
        dec.read_to_end(&mut buf).ok()?;
        try_parse(&buf)
    });

    let Some(dat) = parsed else {
        return Ok(vec![]);
    };
    let servers = dat
        .servers
        .unwrap_or_default()
        .into_iter()
        .filter_map(|s| {
            Some(ServerInfo {
                name: s.name?,
                ip: s.ip?,
                icon: s.icon,
            })
        })
        .collect();

    Ok(servers)
}

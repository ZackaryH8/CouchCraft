use base64::{engine::general_purpose::STANDARD, Engine as _};
use flate2::read::GzDecoder;
use serde::{Deserialize, Serialize};
use std::io::Read;
use std::path::PathBuf;
use tauri::Manager;

#[derive(Deserialize)]
struct LevelDat {
    #[serde(rename = "Data")]
    data: LevelData,
}

#[derive(Deserialize)]
struct LevelData {
    #[serde(rename = "LevelName", default)]
    level_name: String,
    #[serde(rename = "LastPlayed")]
    last_played: Option<i64>,
    #[serde(rename = "GameType")]
    game_type: Option<i32>,
    #[serde(rename = "Version")]
    version: Option<McVersion>,
}

#[derive(Deserialize)]
struct McVersion {
    #[serde(rename = "Name")]
    name: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldInfo {
    pub folder: String,
    pub level_name: String,
    pub game_mode: String,
    pub icon: Option<String>,
    pub last_played_ms: Option<i64>,
    pub mc_version: Option<String>,
}

fn mc_root(app: &tauri::AppHandle, instance_id: &str) -> PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_default()
        .join("instances")
        .join(instance_id)
        .join(".minecraft")
}

fn game_mode_str(mode: i32) -> &'static str {
    match mode {
        1 => "Creative",
        2 => "Adventure",
        3 => "Spectator",
        _ => "Survival",
    }
}

fn parse_level_dat(path: &PathBuf) -> Option<LevelData> {
    let bytes = std::fs::read(path).ok()?;
    let mut dec = GzDecoder::new(&bytes[..]);
    let mut buf = Vec::new();
    dec.read_to_end(&mut buf).ok()?;
    fastnbt::from_bytes::<LevelDat>(&buf).ok().map(|d| d.data)
}

#[tauri::command]
pub async fn list_worlds(
    app: tauri::AppHandle,
    instance_id: String,
) -> Result<Vec<WorldInfo>, String> {
    let saves_dir = mc_root(&app, &instance_id).join("saves");
    if !saves_dir.exists() {
        return Ok(vec![]);
    }

    let mut worlds = Vec::new();
    for entry in std::fs::read_dir(&saves_dir)
        .map_err(|e| e.to_string())?
        .flatten()
    {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let folder = entry.file_name().to_string_lossy().into_owned();
        if !path.join("level.dat").exists() {
            continue;
        }

        let data = parse_level_dat(&path.join("level.dat"));
        let icon = std::fs::read(path.join("icon.png"))
            .ok()
            .map(|bytes| STANDARD.encode(&bytes));
        worlds.push(WorldInfo {
            level_name: data
                .as_ref()
                .map(|d| d.level_name.clone())
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| folder.clone()),
            game_mode: data
                .as_ref()
                .and_then(|d| d.game_type)
                .map(game_mode_str)
                .unwrap_or("Survival")
                .to_string(),
            last_played_ms: data.as_ref().and_then(|d| d.last_played),
            mc_version: data
                .as_ref()
                .and_then(|d| d.version.as_ref())
                .and_then(|v| v.name.clone()),
            icon,
            folder,
        });
    }

    worlds.sort_by(|a, b| {
        b.last_played_ms
            .unwrap_or(0)
            .cmp(&a.last_played_ms.unwrap_or(0))
    });
    Ok(worlds)
}

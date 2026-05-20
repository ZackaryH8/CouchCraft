mod auth;
mod content;
mod files;
mod install;
mod logs;
mod modpack;
mod servers;
mod versions;
mod worlds;
use auth::{poll_device_code, refresh_mc_auth, start_device_code_flow};
use content::{
    delete_content_file, download_content, get_modrinth_best_version, search_modrinth,
    set_content_enabled,
};
use files::{delete_instance_path, list_instance_files, rename_instance_file};
use gilrs::{
    ff::{BaseEffect, BaseEffectType, Effect, EffectBuilder, Repeat, Replay, Ticks},
    Gilrs,
};
use install::{detect_java_runtimes, launch_game, prepare_instance};
use logs::{get_latest_crash_report, read_instance_log};
use modpack::{install_mrpack, install_mrpack_from_file, list_import_files, list_modpack_versions};
use serde::{Deserialize, Serialize};
use servers::list_servers;
use std::process::Command;
use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};
use versions::{fetch_loader_versions, fetch_mc_versions};
use worlds::list_worlds;

#[derive(Debug, Serialize, Deserialize)]
pub struct LaunchConfig {
    instance_id: String,
    username: String,
    uuid: String,
    access_token: String,
}

struct GamepadState {
    gilrs: Mutex<Option<Gilrs>>,
    active_effect: Mutex<Option<Effect>>,
}

impl GamepadState {
    fn new() -> Self {
        Self {
            gilrs: Mutex::new(Gilrs::new().ok()),
            active_effect: Mutex::new(None),
        }
    }
}

#[tauri::command]
async fn launch_minecraft(config: LaunchConfig) -> Result<String, String> {
    // This is a scaffolded launch command. In a real scenario, you would
    // build the full classpath by parsing the version.json file.
    // Example of spawning the process (requires java to be in PATH)
    // This uses --fullscreen for the 10-foot UI experience.
    let _child = Command::new("java")
        .args([
            "-Xmx2G",
            "-jar",
            "client.jar", // Placeholder
            "--username",
            &config.username,
            "--uuid",
            &config.uuid,
            "--accessToken",
            &config.access_token,
            "--gameDir",
            &format!("./instances/{}", config.instance_id),
            "--fullscreen",
        ])
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok(format!("Instance {} launched!", config.instance_id))
}

#[tauri::command]
fn rumble_gamepad(
    state: tauri::State<'_, GamepadState>,
    weak_magnitude: Option<f32>,
    strong_magnitude: Option<f32>,
    duration_ms: Option<u32>,
) -> Result<(), String> {
    let weak_magnitude = weak_magnitude.unwrap_or(0.35).clamp(0.0, 1.0);
    let strong_magnitude = strong_magnitude.unwrap_or(0.2).clamp(0.0, 1.0);
    let duration = Ticks::from_ms(duration_ms.unwrap_or(30));

    let mut guard = state.gilrs.lock().map_err(|e| e.to_string())?;
    let gilrs = guard.as_mut().ok_or("gamepad subsystem unavailable")?;
    while gilrs.next_event().is_some() {}

    let supported_gamepads = gilrs
        .gamepads()
        .filter_map(|(id, gamepad)| {
            if gamepad.is_connected() && gamepad.is_ff_supported() {
                Some(id)
            } else {
                None
            }
        })
        .collect::<Vec<_>>();

    if supported_gamepads.is_empty() {
        return Err("No connected gamepad with force feedback support found".into());
    }

    let weak = (weak_magnitude * 60_000.0).round() as u16;
    let strong = (strong_magnitude * 60_000.0).round() as u16;

    let effect = EffectBuilder::new()
        .add_effect(BaseEffect {
            kind: BaseEffectType::Strong { magnitude: strong },
            scheduling: Replay {
                play_for: duration,
                ..Default::default()
            },
            envelope: Default::default(),
        })
        .add_effect(BaseEffect {
            kind: BaseEffectType::Weak { magnitude: weak },
            scheduling: Replay {
                play_for: duration,
                ..Default::default()
            },
            envelope: Default::default(),
        })
        .repeat(Repeat::For(duration))
        .gamepads(&supported_gamepads)
        .finish(gilrs)
        .map_err(|e| e.to_string())?;

    effect.play().map_err(|e| e.to_string())?;

    let mut active_effect = state.active_effect.lock().map_err(|e| e.to_string())?;
    *active_effect = Some(effect);

    Ok(())
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
async fn create_instance_dirs(
    app: tauri::AppHandle,
    instance_id: String,
) -> Result<String, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let mc_dir = data_dir
        .join("instances")
        .join(&instance_id)
        .join(".minecraft");

    for subdir in &[
        "mods",
        "resourcepacks",
        "shaderpacks",
        "datapacks",
        "saves",
        "logs",
        "screenshots",
        "config",
    ] {
        std::fs::create_dir_all(mc_dir.join(subdir)).map_err(|e| e.to_string())?;
    }

    Ok(mc_dir.to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let gamepad_state = GamepadState::new();

    let migrations = vec![
        Migration {
            version: 1,
            description: "create_instances",
            sql: "CREATE TABLE IF NOT EXISTS instances (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    loader TEXT NOT NULL,
                    minecraft_version TEXT NOT NULL,
                    color TEXT NOT NULL,
                    icon_data TEXT,
                    loader_version TEXT NOT NULL DEFAULT '',
                    java_version INTEGER NOT NULL DEFAULT 17,
                    ram_mb INTEGER NOT NULL DEFAULT 2048,
                    jvm_args TEXT NOT NULL DEFAULT '',
                    notes TEXT NOT NULL DEFAULT '',
                    last_played_at INTEGER,
                    play_time_secs INTEGER NOT NULL DEFAULT 0,
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    created_at INTEGER NOT NULL DEFAULT (unixepoch())
                );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "create_settings",
            sql: "CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "create_accounts",
            sql: "CREATE TABLE IF NOT EXISTS accounts (
                    id TEXT PRIMARY KEY,
                    ms_refresh_token TEXT NOT NULL,
                    mc_access_token TEXT NOT NULL,
                    mc_username TEXT NOT NULL,
                    mc_uuid TEXT NOT NULL,
                    expires_at INTEGER NOT NULL,
                    added_at INTEGER NOT NULL DEFAULT (unixepoch())
                );",
            kind: MigrationKind::Up,
        },
        // Versions 4 and 5 were used by old migration names in early deployments.
        // create_content is at v6 and create_java_runtimes at v7 so they run
        // on databases that already have v4/v5 applied with different content.
        Migration {
            version: 6,
            description: "create_content",
            sql: "CREATE TABLE IF NOT EXISTS content (
                    id TEXT PRIMARY KEY,
                    instance_id TEXT NOT NULL,
                    category TEXT NOT NULL,
                    name TEXT NOT NULL,
                    filename TEXT NOT NULL,
                    version TEXT NOT NULL DEFAULT '',
                    source TEXT NOT NULL DEFAULT 'local',
                    modrinth_project_id TEXT,
                    modrinth_version_id TEXT,
                    enabled INTEGER NOT NULL DEFAULT 1,
                    from_modpack INTEGER NOT NULL DEFAULT 0,
                    installed_at INTEGER NOT NULL DEFAULT (unixepoch()),
                    update_checked_at INTEGER,
                    update_available INTEGER NOT NULL DEFAULT 0
                );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "create_java_runtimes",
            sql: "CREATE TABLE IF NOT EXISTS java_runtimes (
                    version INTEGER PRIMARY KEY,
                    path TEXT NOT NULL,
                    build_string TEXT NOT NULL DEFAULT '',
                    is_system INTEGER NOT NULL DEFAULT 0
                );",
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .setup(|app| {
            let window = app
                .get_webview_window("main")
                .ok_or("main webview window not found")?;

            let size = window
                .current_monitor()
                .ok()
                .flatten()
                .map(|m| {
                    let s = m.size();
                    (s.width, s.height)
                })
                .or_else(|| {
                    // Fallback: read resolution exported by startup.sh via swaymsg.
                    // current_monitor() returns None on Wayland before window mapping.
                    let res = std::env::var("COUCHCRAFT_RESOLUTION").ok()?;
                    let (w, h) = res.split_once('x')?;
                    Some((w.parse().ok()?, h.parse().ok()?))
                });

            if let Some((width, height)) = size {
                let _ =
                    window.set_size(tauri::Size::Physical(tauri::PhysicalSize { width, height }));
                let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
                    x: 0,
                    y: 0,
                }));
            }

            Ok(())
        })
        .manage(gamepad_state)
        .plugin(
            tauri_plugin_sql::Builder::new()
                .add_migrations("sqlite:couchcraft.db", migrations)
                .build(),
        )
        .plugin(tauri_plugin_gamepad::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            launch_minecraft,
            rumble_gamepad,
            quit_app,
            create_instance_dirs,
            fetch_mc_versions,
            fetch_loader_versions,
            search_modrinth,
            get_modrinth_best_version,
            download_content,
            set_content_enabled,
            delete_content_file,
            list_instance_files,
            rename_instance_file,
            delete_instance_path,
            list_worlds,
            list_servers,
            read_instance_log,
            get_latest_crash_report,
            prepare_instance,
            launch_game,
            detect_java_runtimes,
            start_device_code_flow,
            poll_device_code,
            refresh_mc_auth,
            list_modpack_versions,
            install_mrpack,
            install_mrpack_from_file,
            list_import_files,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

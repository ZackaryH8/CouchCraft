mod auth;
mod content;
mod files;
mod versions;
mod worlds;
mod servers;
mod logs;
mod install;
mod modpack;
use auth::{start_device_code_flow, poll_device_code, refresh_mc_auth};
use content::{search_modrinth, get_modrinth_best_version, download_content, set_content_enabled, delete_content_file};
use files::{list_instance_files, rename_instance_file, delete_instance_path};
use versions::{fetch_mc_versions, fetch_loader_versions};
use worlds::list_worlds;
use servers::list_servers;
use logs::{read_instance_log, get_latest_crash_report};
use install::{prepare_instance, launch_game, detect_java_runtimes};
use modpack::{list_modpack_versions, install_mrpack};
use tauri_plugin_sql::{Migration, MigrationKind};
use gilrs::{
    ff::{BaseEffect, BaseEffectType, Effect, EffectBuilder, Replay, Repeat, Ticks},
    Gilrs,
};
use serde::{Deserialize, Serialize};
use std::process::Command;
use std::sync::Mutex;
use tauri::Manager;

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
            "-jar", "client.jar", // Placeholder
            "--username", &config.username,
            "--uuid", &config.uuid,
            "--accessToken", &config.access_token,
            "--gameDir", &format!("./instances/{}", config.instance_id),
            "--fullscreen"
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
async fn create_instance_dirs(app: tauri::AppHandle, instance_id: String) -> Result<String, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let mc_dir = data_dir.join("instances").join(&instance_id).join(".minecraft");

    for subdir in &[
        "mods", "resourcepacks", "shaderpacks", "datapacks",
        "saves", "logs", "screenshots", "config",
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
            description: "initial_schema",
            sql: "
                CREATE TABLE IF NOT EXISTS instances (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    loader TEXT NOT NULL,
                    minecraft_version TEXT NOT NULL,
                    color TEXT NOT NULL,
                    mod_count TEXT NOT NULL DEFAULT 'No mods',
                    last_played TEXT NOT NULL DEFAULT 'Never',
                    playtime TEXT NOT NULL DEFAULT '0h',
                    status TEXT NOT NULL DEFAULT 'New',
                    summary TEXT NOT NULL DEFAULT '',
                    details TEXT NOT NULL DEFAULT '',
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    created_at INTEGER NOT NULL DEFAULT (unixepoch())
                );
                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "multi_account",
            sql: "
                CREATE TABLE IF NOT EXISTS accounts (
                    id TEXT PRIMARY KEY,
                    ms_refresh_token TEXT NOT NULL,
                    mc_access_token TEXT NOT NULL,
                    mc_username TEXT NOT NULL,
                    mc_uuid TEXT NOT NULL,
                    expires_at INTEGER NOT NULL,
                    added_at INTEGER NOT NULL DEFAULT (unixepoch())
                );
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "instance_icon_data",
            sql: "ALTER TABLE instances ADD COLUMN icon_data TEXT;",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "content_from_modpack",
            sql: "ALTER TABLE content ADD COLUMN from_modpack INTEGER NOT NULL DEFAULT 0;",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "instance_v2_content_java",
            sql: "
                ALTER TABLE instances ADD COLUMN loader_version TEXT NOT NULL DEFAULT '';
                ALTER TABLE instances ADD COLUMN java_version INTEGER NOT NULL DEFAULT 17;
                ALTER TABLE instances ADD COLUMN ram_mb INTEGER NOT NULL DEFAULT 2048;
                ALTER TABLE instances ADD COLUMN jvm_args TEXT NOT NULL DEFAULT '';
                ALTER TABLE instances ADD COLUMN notes TEXT NOT NULL DEFAULT '';
                ALTER TABLE instances ADD COLUMN last_played_at INTEGER;
                ALTER TABLE instances ADD COLUMN play_time_secs INTEGER NOT NULL DEFAULT 0;

                CREATE TABLE IF NOT EXISTS content (
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
                    installed_at INTEGER NOT NULL DEFAULT (unixepoch()),
                    update_checked_at INTEGER,
                    update_available INTEGER NOT NULL DEFAULT 0
                );

                CREATE TABLE IF NOT EXISTS java_runtimes (
                    version INTEGER PRIMARY KEY,
                    path TEXT NOT NULL,
                    build_string TEXT NOT NULL DEFAULT '',
                    is_system INTEGER NOT NULL DEFAULT 0
                );
            ",
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .setup(|app| {
            let window = app.get_webview_window("main")
                .ok_or("main webview window not found")?;

            let size = window.current_monitor().ok().flatten().map(|m| {
                let s = m.size();
                (s.width, s.height)
            }).or_else(|| {
                // Fallback: read resolution exported by startup.sh via swaymsg.
                // current_monitor() returns None on Wayland before window mapping.
                let res = std::env::var("COUCHCRAFT_RESOLUTION").ok()?;
                let (w, h) = res.split_once('x')?;
                Some((w.parse().ok()?, h.parse().ok()?))
            });

            if let Some((width, height)) = size {
                let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize { width, height }));
                let _ = window.set_position(tauri::Position::Physical(
                    tauri::PhysicalPosition { x: 0, y: 0 },
                ));
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

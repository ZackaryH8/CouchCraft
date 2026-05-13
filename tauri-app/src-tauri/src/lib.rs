mod auth;
use auth::{start_device_code_flow, poll_device_code, refresh_mc_auth};
use tauri_plugin_sql::{Migration, MigrationKind};
use gilrs::{
    ff::{BaseEffect, BaseEffectType, Effect, EffectBuilder, Replay, Ticks},
    Gilrs,
};
use serde::{Deserialize, Serialize};
use std::process::Command;
use std::sync::Mutex;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LaunchConfig {
    instance_id: String,
    username: String,
    uuid: String,
    access_token: String,
}

struct GamepadState {
    gilrs: Mutex<Gilrs>,
    active_effect: Mutex<Option<Effect>>,
}

impl GamepadState {
    fn new() -> Result<Self, String> {
        let gilrs = Gilrs::new().map_err(|e| e.to_string())?;

        Ok(Self {
            gilrs: Mutex::new(gilrs),
            active_effect: Mutex::new(None),
        })
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

    let mut gilrs = state.gilrs.lock().map_err(|e| e.to_string())?;
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
        .gamepads(&supported_gamepads)
        .finish(&mut gilrs)
        .map_err(|e| e.to_string())?;

    effect.play().map_err(|e| e.to_string())?;

    let mut active_effect = state.active_effect.lock().map_err(|e| e.to_string())?;
    *active_effect = Some(effect);

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let gamepad_state = GamepadState::new().expect("failed to initialize gilrs");

    let migrations = vec![Migration {
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
    }];

    tauri::Builder::default()
        .manage(gamepad_state)
        .plugin(
            tauri_plugin_sql::Builder::new()
                .add_migrations("sqlite:couchcraft.db", migrations)
                .build(),
        )
        .plugin(tauri_plugin_gamepad::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
        greet,
        launch_minecraft,
        rumble_gamepad,
        start_device_code_flow,
        poll_device_code,
        refresh_mc_auth,
    ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

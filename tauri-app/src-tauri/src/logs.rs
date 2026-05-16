use std::path::PathBuf;
use tauri::Manager;

fn mc_root(app: &tauri::AppHandle, instance_id: &str) -> PathBuf {
    app.path().app_data_dir().unwrap_or_default()
        .join("instances").join(instance_id).join(".minecraft")
}

#[tauri::command]
pub async fn read_instance_log(app: tauri::AppHandle, instance_id: String) -> Result<String, String> {
    let log_path = mc_root(&app, &instance_id).join("logs").join("latest.log");
    tokio::task::spawn_blocking(move || {
        if !log_path.exists() { return Ok(String::new()); }
        let bytes = std::fs::read(&log_path).map_err(|e| e.to_string())?;
        let content = if bytes.len() > 100_000 {
            String::from_utf8_lossy(&bytes[bytes.len() - 100_000..]).into_owned()
        } else {
            String::from_utf8_lossy(&bytes).into_owned()
        };
        Ok(content)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn get_latest_crash_report(app: tauri::AppHandle, instance_id: String) -> Result<Option<String>, String> {
    let crash_dir = mc_root(&app, &instance_id).join("crash-reports");
    tokio::task::spawn_blocking(move || {
        if !crash_dir.exists() { return Ok(None); }
        let latest = std::fs::read_dir(&crash_dir)
            .map_err(|e| e.to_string())?
            .flatten()
            .filter(|e| e.path().extension().and_then(|x| x.to_str()) == Some("txt"))
            .filter_map(|e| e.metadata().ok().and_then(|m| m.modified().ok()).map(|t| (t, e.path())))
            .max_by_key(|(t, _)| *t);
        match latest {
            None => Ok(None),
            Some((_, path)) => Ok(Some(std::fs::read_to_string(&path).map_err(|e| e.to_string())?)),
        }
    }).await.map_err(|e| e.to_string())?
}

use serde::Serialize;
use std::path::{Component, Path};
use tauri::Manager;

// ── Output type ───────────────────────────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub name: String,
    pub is_dir: bool,
    pub size_bytes: u64,
    pub modified_secs: Option<u64>,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/// Returns the `.minecraft/` root for a given instance.
fn mc_root(app: &tauri::AppHandle, instance_id: &str) -> Result<std::path::PathBuf, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(data_dir.join("instances").join(instance_id).join(".minecraft"))
}

/// Validates a subpath is safe (no `..` components) and returns the resolved
/// absolute path, verified to still be inside `base`.
fn safe_join(base: &Path, subpath: &str) -> Result<std::path::PathBuf, String> {
    if subpath.is_empty() {
        return base
            .canonicalize()
            .map_err(|e| format!("Base resolve error: {e}"));
    }

    let rel = Path::new(subpath);
    if rel.components().any(|c| c == Component::ParentDir) {
        return Err("Path traversal rejected".into());
    }

    let target = base.join(rel);

    // Create the target if it doesn't exist yet (e.g., listing a freshly
    // created instance that has the dirs but hasn't had files copied in).
    // For rename/delete the caller always works on existing paths, but for
    // listing we want a clean error rather than a cryptic io error.
    let canonical = target
        .canonicalize()
        .map_err(|e| format!("Path resolve error: {e}"))?;

    let canonical_base = base
        .canonicalize()
        .map_err(|e| format!("Base resolve error: {e}"))?;

    if !canonical.starts_with(&canonical_base) {
        return Err("Path traversal rejected".into());
    }

    Ok(canonical)
}

// ── Commands ──────────────────────────────────────────────────────────────────

/// Lists files and directories at `subpath` inside the instance's .minecraft dir.
/// An empty `subpath` lists the .minecraft root itself.
#[tauri::command]
pub async fn list_instance_files(
    app: tauri::AppHandle,
    instance_id: String,
    subpath: String,
) -> Result<Vec<FileEntry>, String> {
    let base   = mc_root(&app, &instance_id)?;
    let target = safe_join(&base, &subpath)?;

    let mut entries: Vec<FileEntry> = std::fs::read_dir(&target)
        .map_err(|e| format!("Read dir error: {e}"))?
        .filter_map(|e| e.ok())
        .map(|e| {
            let meta        = e.metadata().ok();
            let is_dir      = meta.as_ref().map(|m| m.is_dir()).unwrap_or(false);
            let size_bytes  = if is_dir { 0 } else { meta.as_ref().map(|m| m.len()).unwrap_or(0) };
            let modified_secs = meta.as_ref()
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs());
            FileEntry {
                name: e.file_name().to_string_lossy().into_owned(),
                is_dir,
                size_bytes,
                modified_secs,
            }
        })
        .collect();

    // Directories first, then files, both alphabetical (case-insensitive).
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(entries)
}

/// Renames a file or directory at `subpath` inside the instance's .minecraft dir.
/// `new_name` must be a plain filename with no path separators.
#[tauri::command]
pub async fn rename_instance_file(
    app: tauri::AppHandle,
    instance_id: String,
    subpath: String,
    new_name: String,
) -> Result<(), String> {
    if new_name.contains('/') || new_name.contains('\\') || new_name.contains("..") {
        return Err("Invalid filename".into());
    }
    if new_name.is_empty() {
        return Err("Filename cannot be empty".into());
    }

    let base    = mc_root(&app, &instance_id)?;
    let old     = safe_join(&base, &subpath)?;
    let new_path = old
        .parent()
        .ok_or("Cannot rename root")?
        .join(&new_name);

    std::fs::rename(&old, &new_path).map_err(|e| format!("Rename error: {e}"))?;
    Ok(())
}

/// Deletes a file or directory (recursively) at `subpath` inside .minecraft.
#[tauri::command]
pub async fn delete_instance_path(
    app: tauri::AppHandle,
    instance_id: String,
    subpath: String,
) -> Result<(), String> {
    let base   = mc_root(&app, &instance_id)?;
    let target = safe_join(&base, &subpath)?;

    if target.is_dir() {
        std::fs::remove_dir_all(&target).map_err(|e| format!("Delete dir error: {e}"))?;
    } else {
        std::fs::remove_file(&target).map_err(|e| format!("Delete file error: {e}"))?;
    }
    Ok(())
}

use futures::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::{Emitter, Manager};
use tokio::sync::Semaphore;

// ─── API types ────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct VersionManifest {
    versions: Vec<ManifestEntry>,
}

#[derive(Deserialize)]
struct ManifestEntry {
    id: String,
    url: String,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct VersionJson {
    id: String,
    main_class: String,
    libraries: Vec<Library>,
    downloads: Option<VersionDownloads>,
    asset_index: Option<AssetIndexRef>,
    assets: Option<String>,
    arguments: Option<Arguments>,
    minecraft_arguments: Option<String>,
    #[serde(default)]
    inherits_from: Option<String>,
}

#[derive(Deserialize, Clone)]
struct Library {
    name: String,
    downloads: Option<LibDownloads>,
    url: Option<String>,
    #[serde(default)]
    rules: Vec<LibRule>,
    natives: Option<HashMap<String, String>>,
    extract: Option<ExtractSpec>,
}

#[derive(Deserialize, Clone)]
struct LibDownloads {
    artifact: Option<LibArtifact>,
    classifiers: Option<HashMap<String, LibArtifact>>,
}

#[derive(Deserialize, Clone)]
struct LibArtifact {
    path: String,
    url: String,
    sha1: Option<String>,
}

#[derive(Deserialize, Clone)]
struct LibRule {
    action: String,
    os: Option<OsSpec>,
    features: Option<serde_json::Value>,
}

#[derive(Deserialize, Clone)]
struct OsSpec {
    name: Option<String>,
}

#[derive(Deserialize, Clone)]
struct ExtractSpec {
    #[serde(default)]
    exclude: Vec<String>,
}

#[derive(Deserialize, Clone)]
struct VersionDownloads {
    client: FileRef,
}

#[derive(Deserialize, Clone)]
struct FileRef {
    url: String,
    sha1: Option<String>,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AssetIndexRef {
    id: String,
    url: String,
    sha1: Option<String>,
}

#[derive(Deserialize, Clone)]
struct Arguments {
    #[serde(default)]
    game: Vec<serde_json::Value>,
    #[serde(default)]
    jvm: Vec<serde_json::Value>,
}

#[derive(Deserialize)]
struct AssetIndex {
    objects: HashMap<String, AssetObject>,
}

#[derive(Deserialize)]
struct AssetObject {
    hash: String,
}

// ─── Progress events ──────────────────────────────────────────────────────────

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PrepareProgress {
    pub stage: String,
    pub message: String,
    pub done: u32,
    pub total: u32,
}

// ─── Tauri commands ───────────────────────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrepareConfig {
    pub instance_id: String,
    pub mc_version: String,
    pub loader_type: String,
    pub loader_version: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchConfig {
    pub instance_id: String,
    pub mc_version: String,
    pub loader_type: String,
    pub loader_version: String,
    pub ram_mb: u32,
    pub jvm_args: String,
    pub java_path: String,
    pub username: String,
    pub uuid: String,
    pub access_token: String,
    pub quickplay_world: Option<String>,
    pub quickplay_server: Option<String>,
}

#[tauri::command]
pub async fn prepare_instance(app: tauri::AppHandle, config: PrepareConfig) -> Result<(), String> {
    let base = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let client = Client::builder()
        .user_agent("CouchCraft/1.0 (github.com/couchcraft)")
        .build()
        .map_err(|e| e.to_string())?;

    let emit = |stage: &str, msg: &str, done: u32, total: u32| {
        let _ = app.emit(
            "prepare-progress",
            PrepareProgress {
                stage: stage.to_string(),
                message: msg.to_string(),
                done,
                total,
            },
        );
    };

    // 1. Fetch version JSON (vanilla + loader layer)
    emit("versions", "Fetching version manifest…", 0, 1);
    let version = resolve_version(
        &client,
        &base,
        &config.mc_version,
        &config.loader_type,
        &config.loader_version,
    )
    .await?;
    emit("versions", "Version resolved", 1, 1);

    // 1b. Ensure a suitable JRE is available, downloading if needed
    let min_java = min_java_for_mc(&config.mc_version);
    emit("java", &format!("Checking Java {}…", min_java), 0, 1);
    {
        let app2 = app.clone();
        let mc = config.mc_version.clone();
        ensure_java(&client, &base, &mc, move |done, total| {
            let _ = app2.emit(
                "prepare-progress",
                PrepareProgress {
                    stage: "java".into(),
                    message: format!(
                        "Downloading Java {}… ({}%)",
                        min_java,
                        if total > 0 {
                            done as u64 * 100 / total as u64
                        } else {
                            0
                        }
                    ),
                    done,
                    total,
                },
            );
        })
        .await?;
    }
    emit("java", &format!("Java {} ready", min_java), 1, 1);

    // 2. Client JAR
    if let Some(dl) = &version.downloads {
        emit("client", "Downloading client jar…", 0, 1);
        let jar_path = base
            .join("versions")
            .join(&config.mc_version)
            .join(format!("{}.jar", config.mc_version));
        download_checked(
            &client,
            &dl.client.url,
            &jar_path,
            dl.client.sha1.as_deref(),
        )
        .await?;
        emit("client", "Client jar ready", 1, 1);
    }

    // 3. Libraries
    let libs = collect_libraries(&version);
    let total_libs = libs.len() as u32;
    emit("libraries", "Downloading libraries…", 0, total_libs);
    let sem = Arc::new(Semaphore::new(16));
    let mut handles = Vec::new();
    for (i, (path, url, sha1)) in libs.into_iter().enumerate() {
        let client2 = client.clone();
        let dest = base.join("libraries").join(&path);
        let sem2 = sem.clone();
        let app2 = app.clone();
        handles.push(tokio::spawn(async move {
            let _permit = sem2.acquire().await.map_err(|e| e.to_string())?;
            let result = download_checked(&client2, &url, &dest, sha1.as_deref()).await;
            let _ = app2.emit(
                "prepare-progress",
                PrepareProgress {
                    stage: "libraries".into(),
                    message: format!(
                        "Library {}",
                        dest.file_name().unwrap_or_default().to_string_lossy()
                    ),
                    done: (i + 1) as u32,
                    total: total_libs,
                },
            );
            result
        }));
    }
    for h in handles {
        h.await.map_err(|e| e.to_string())??;
    }

    // 4. Asset index + objects
    if let Some(idx_ref) = &version.asset_index {
        let idx_path = base
            .join("assets")
            .join("indexes")
            .join(format!("{}.json", idx_ref.id));
        emit("assets", "Downloading asset index…", 0, 1);
        download_checked(&client, &idx_ref.url, &idx_path, idx_ref.sha1.as_deref()).await?;

        let idx_bytes = std::fs::read(&idx_path).map_err(|e| e.to_string())?;
        let index: AssetIndex = serde_json::from_slice(&idx_bytes).map_err(|e| e.to_string())?;
        let objects: Vec<_> = index.objects.into_values().collect();
        let total_assets = objects.len() as u32;

        emit("assets", "Downloading assets…", 0, total_assets);
        let sem = Arc::new(Semaphore::new(32));
        let mut handles = Vec::new();
        for (i, obj) in objects.into_iter().enumerate() {
            let client2 = client.clone();
            let prefix = &obj.hash[..2];
            let dest = base
                .join("assets")
                .join("objects")
                .join(prefix)
                .join(&obj.hash);
            let url = format!(
                "https://resources.download.minecraft.net/{}/{}",
                prefix, obj.hash
            );
            let sha1 = obj.hash.clone();
            let sem2 = sem.clone();
            let app2 = app.clone();
            handles.push(tokio::spawn(async move {
                let _permit = sem2.acquire().await.map_err(|e| e.to_string())?;
                let result = download_checked(&client2, &url, &dest, Some(&sha1)).await;
                if i % 50 == 0 {
                    let _ = app2.emit(
                        "prepare-progress",
                        PrepareProgress {
                            stage: "assets".into(),
                            message: format!("Assets ({}/{})", i + 1, total_assets),
                            done: (i + 1) as u32,
                            total: total_assets,
                        },
                    );
                }
                result
            }));
        }
        for h in handles {
            h.await.map_err(|e| e.to_string())??;
        }
        emit("assets", "Assets ready", total_assets, total_assets);
    }

    emit("done", "Ready to launch!", 1, 1);
    Ok(())
}

#[tauri::command]
pub async fn launch_game(app: tauri::AppHandle, config: LaunchConfig) -> Result<(), String> {
    use std::process::Command;

    let base = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let client = Client::builder()
        .user_agent("CouchCraft/1.0")
        .build()
        .map_err(|e| e.to_string())?;

    let version = resolve_version(
        &client,
        &base,
        &config.mc_version,
        &config.loader_type,
        &config.loader_version,
    )
    .await?;

    let game_dir = base
        .join("instances")
        .join(&config.instance_id)
        .join(".minecraft");
    std::fs::create_dir_all(&game_dir).map_err(|e| e.to_string())?;
    let assets_dir = base.join("assets");
    let asset_id = version
        .asset_index
        .as_ref()
        .map(|a| a.id.as_str())
        .unwrap_or("legacy");

    // Build classpath
    let mut cp_entries: Vec<PathBuf> = Vec::new();
    let mut natives_dirs: Vec<PathBuf> = Vec::new();
    let natives_dir = base
        .join("instances")
        .join(&config.instance_id)
        .join("natives");
    std::fs::create_dir_all(&natives_dir).map_err(|e| e.to_string())?;

    for lib in &version.libraries {
        if !should_include(lib) {
            continue;
        }

        // Regular artifact
        if let Some(dl) = lib.downloads.as_ref().and_then(|d| d.artifact.as_ref()) {
            cp_entries.push(base.join("libraries").join(&dl.path));
        } else if lib.url.is_some() {
            // Fabric-style: url field + maven name
            let path = maven_path(&lib.name);
            let artifact_path = base.join("libraries").join(&path);
            if artifact_path.exists() {
                cp_entries.push(artifact_path);
            }
        }

        // Native classifier
        if let Some(classifiers) = lib.downloads.as_ref().and_then(|d| d.classifiers.as_ref()) {
            if let Some(native_key) = lib.natives.as_ref().and_then(|n| n.get("linux")) {
                if let Some(art) = classifiers.get(native_key) {
                    let native_jar = base.join("libraries").join(&art.path);
                    if native_jar.exists() {
                        let exclude = lib
                            .extract
                            .as_ref()
                            .map(|e| e.exclude.as_slice())
                            .unwrap_or(&[]);
                        extract_natives(&native_jar, &natives_dir, exclude)?;
                        natives_dirs.push(natives_dir.clone());
                    }
                }
            }
        }
    }

    // Client JAR
    let client_jar = base
        .join("versions")
        .join(&config.mc_version)
        .join(format!("{}.jar", config.mc_version));
    cp_entries.push(client_jar);

    let classpath = cp_entries
        .iter()
        .map(|p| p.to_string_lossy())
        .collect::<Vec<_>>()
        .join(":");

    let natives_path = natives_dir.to_string_lossy().into_owned();

    // Token map for argument substitution
    let mut tokens: HashMap<String, String> = HashMap::new();
    tokens.insert("auth_player_name".into(), config.username.clone());
    tokens.insert("auth_uuid".into(), config.uuid.clone());
    tokens.insert("auth_access_token".into(), config.access_token.clone());
    tokens.insert("user_type".into(), "msa".into());
    tokens.insert("version_name".into(), config.mc_version.clone());
    tokens.insert(
        "game_directory".into(),
        game_dir.to_string_lossy().into_owned(),
    );
    tokens.insert(
        "assets_root".into(),
        assets_dir.to_string_lossy().into_owned(),
    );
    tokens.insert("assets_index_name".into(), asset_id.to_string());
    tokens.insert("version_type".into(), "release".into());
    tokens.insert("natives_directory".into(), natives_path.clone());
    tokens.insert("launcher_name".into(), "CouchCraft".into());
    tokens.insert("launcher_version".into(), "1.0".into());
    tokens.insert("classpath".into(), classpath.clone());
    tokens.insert("clientid".into(), String::new());
    tokens.insert("auth_xuid".into(), String::new());
    tokens.insert("resolution_width".into(), "1920".into());
    tokens.insert("resolution_height".into(), "1080".into());

    // Build JVM args
    let mut jvm_args: Vec<String> = Vec::new();
    jvm_args.push(format!("-Xmx{}m", config.ram_mb));
    jvm_args.push(format!("-Xms{}m", (config.ram_mb / 2).max(512)));

    if let Some(args) = &version.arguments {
        // Modern version JSON already includes -Djava.library.path=${natives_directory}
        // and -cp ${classpath}, so only add heap args and let process_args handle the rest.
        jvm_args.extend(process_args(&args.jvm, &tokens));
    } else {
        // Legacy (pre-1.13): inject natives path and classpath manually
        jvm_args.push(format!("-Djava.library.path={}", natives_path));
        jvm_args.push("-cp".into());
        jvm_args.push(classpath.clone());
    }

    // Remove duplicates: -cp and ${classpath} may already be in jvm args
    // (they are in modern version.json); don't double-add
    if !config.jvm_args.trim().is_empty() {
        for arg in config.jvm_args.split_whitespace() {
            jvm_args.push(arg.to_string());
        }
    }

    // Game args
    let mut game_args: Vec<String> = Vec::new();
    if let Some(args) = &version.arguments {
        game_args.extend(process_args(&args.game, &tokens));
    } else if let Some(legacy) = &version.minecraft_arguments {
        game_args.extend(
            legacy
                .split_whitespace()
                .map(|s| substitute_tokens(s, &tokens)),
        );
    }

    // Quickplay
    if let Some(world) = &config.quickplay_world {
        game_args.push("--quickPlaySingleplayer".into());
        game_args.push(world.clone());
    } else if let Some(server) = &config.quickplay_server {
        game_args.push("--quickPlayMultiplayer".into());
        game_args.push(server.clone());
    }

    // Force fullscreen via options.txt — Minecraft ignores --fullscreen as a CLI arg.
    write_options_fullscreen(&game_dir);

    let java_bin = if !config.java_path.is_empty() {
        config.java_path.clone()
    } else {
        find_best_java(&base, config.mc_version.as_str())
    };

    // --sun-misc-unsafe-memory-access=allow only exists in Java 23–25 (JEP 471).
    // Strip it on Java <23 (including 21) and on Java 26+ where it was removed.
    let java_major = detect_java_major(&java_bin);
    if !(23..26).contains(&java_major) {
        jvm_args.retain(|arg| arg != "--sun-misc-unsafe-memory-access=allow");
    }

    // Redirect Java stdout+stderr to .minecraft/logs/latest.log
    let logs_dir = game_dir.join("logs");
    std::fs::create_dir_all(&logs_dir).map_err(|e| e.to_string())?;
    let log_path = logs_dir.join("latest.log");
    let log_file = std::fs::OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(&log_path)
        .map_err(|e| e.to_string())?;
    let log_file2 = log_file.try_clone().map_err(|e| e.to_string())?;

    let mut cmd = Command::new(&java_bin);
    cmd.args(&jvm_args)
        .arg(&version.main_class)
        .args(&game_args)
        .current_dir(&game_dir)
        .stdout(std::process::Stdio::from(log_file))
        .stderr(std::process::Stdio::from(log_file2));

    // Pass Wayland/X11 env and native lib path
    cmd.env(
        "WAYLAND_DISPLAY",
        std::env::var("WAYLAND_DISPLAY").unwrap_or_default(),
    );
    cmd.env("DISPLAY", std::env::var("DISPLAY").unwrap_or_default());
    cmd.env("LD_LIBRARY_PATH", &natives_path);

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to launch java: {}", e))?;

    let instance_id = config.instance_id.clone();
    let app2 = app.clone();
    let window = app.get_webview_window("main");

    tokio::task::spawn_blocking(move || {
        let launch_time = std::time::Instant::now();

        // Tail the game log until Minecraft signals it is past the Mojang
        // screen, then focus its window and hide the launcher.  This is
        // compositor-agnostic and event-driven — no polling or fixed delays.
        if wait_for_game_ready(&log_path, 120) {
            let _ = std::process::Command::new("swaymsg")
                .args(["[title=\"Minecraft*\"] focus"])
                .output();
        }
        if let Some(ref w) = window {
            let _ = w.hide();
        }

        let _ = child.wait();
        let elapsed_secs = launch_time.elapsed().as_secs();
        if let Some(w) = window {
            let _ = w.show();
        }
        let _ = app2.emit(
            "game-exited",
            serde_json::json!({
                "instanceId": instance_id,
                "elapsedSecs": elapsed_secs,
            }),
        );
    });

    Ok(())
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async fn resolve_version(
    client: &Client,
    base: &Path,
    mc_version: &str,
    loader_type: &str,
    loader_version: &str,
) -> Result<VersionJson, String> {
    let mut version = fetch_vanilla_version(client, base, mc_version).await?;

    match loader_type {
        "fabric" => {
            let url = format!(
                "https://meta.fabricmc.net/v2/versions/loader/{}/{}/profile/json",
                mc_version, loader_version
            );
            let overlay = client
                .get(&url)
                .send()
                .await
                .map_err(|e| e.to_string())?
                .json::<VersionJson>()
                .await
                .map_err(|e| e.to_string())?;
            merge_version(&mut version, &overlay);
        }
        "quilt" => {
            let url = format!(
                "https://meta.quiltmc.org/v3/versions/loader/{}/{}/profile/json",
                mc_version, loader_version
            );
            let overlay = client
                .get(&url)
                .send()
                .await
                .map_err(|e| e.to_string())?
                .json::<VersionJson>()
                .await
                .map_err(|e| e.to_string())?;
            merge_version(&mut version, &overlay);
        }
        _ => {} // vanilla, forge, neoforge: use vanilla json (forge TODO)
    }

    Ok(version)
}

async fn fetch_vanilla_version(
    client: &Client,
    base: &Path,
    mc_version: &str,
) -> Result<VersionJson, String> {
    let json_path = base
        .join("versions")
        .join(mc_version)
        .join(format!("{}.json", mc_version));

    if json_path.exists() {
        let bytes = std::fs::read(&json_path).map_err(|e| e.to_string())?;
        return serde_json::from_slice(&bytes).map_err(|e| e.to_string());
    }

    let manifest: VersionManifest = client
        .get("https://launchermeta.mojang.com/mc/game/version_manifest_v2.json")
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    let entry = manifest
        .versions
        .into_iter()
        .find(|v| v.id == mc_version)
        .ok_or_else(|| format!("MC version {} not found in manifest", mc_version))?;

    let json_bytes = client
        .get(&entry.url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .bytes()
        .await
        .map_err(|e| e.to_string())?;

    std::fs::create_dir_all(json_path.parent().ok_or("invalid version json path")?)
        .map_err(|e| e.to_string())?;
    std::fs::write(&json_path, &json_bytes).map_err(|e| e.to_string())?;

    serde_json::from_slice(&json_bytes).map_err(|e| e.to_string())
}

fn merge_version(base: &mut VersionJson, overlay: &VersionJson) {
    base.main_class = overlay.main_class.clone();
    // Prepend overlay libraries, then deduplicate by group:artifact (overlay wins)
    let mut merged = overlay.libraries.clone();
    merged.extend(base.libraries.iter().cloned());
    base.libraries = dedup_libraries(merged);
    // Merge arguments (Fabric/Quilt add JVM args like -DFabricMcEmu)
    if let Some(ov) = &overlay.arguments {
        match &mut base.arguments {
            Some(base_args) => {
                let mut jvm = ov.jvm.clone();
                jvm.extend(base_args.jvm.iter().cloned());
                base_args.jvm = jvm;
                let mut game = ov.game.clone();
                game.extend(base_args.game.iter().cloned());
                base_args.game = game;
            }
            None => base.arguments = Some(ov.clone()),
        }
    }
}

// Keep the first occurrence of each group:artifact pair (overlay libs come first, so they win).
// 4-part names (group:artifact:version:classifier) are native JARs and must never be deduped.
fn dedup_libraries(libs: Vec<Library>) -> Vec<Library> {
    let mut seen = std::collections::HashSet::new();
    libs.into_iter()
        .filter(|lib| {
            if lib.name.chars().filter(|&c| c == ':').count() >= 3 {
                return true; // classifier entry — always keep
            }
            let key: String = lib
                .name
                .splitn(3, ':')
                .take(2)
                .collect::<Vec<_>>()
                .join(":");
            seen.insert(key)
        })
        .collect()
}

// Returns (relative_path, url, Option<sha1>) for all libraries to download on Linux
fn collect_libraries(version: &VersionJson) -> Vec<(String, String, Option<String>)> {
    let mut out = Vec::new();
    for lib in &version.libraries {
        if !should_include(lib) {
            continue;
        }

        if let Some(dl) = lib.downloads.as_ref().and_then(|d| d.artifact.as_ref()) {
            out.push((dl.path.clone(), dl.url.clone(), dl.sha1.clone()));
        } else if let Some(url_base) = &lib.url {
            let path = maven_path(&lib.name);
            let url = format!(
                "{}/{}",
                url_base.trim_end_matches('/'),
                path.replace('\\', "/")
            );
            out.push((path, url, None));
        }

        // Native classifier
        if let Some(classifiers) = lib.downloads.as_ref().and_then(|d| d.classifiers.as_ref()) {
            if let Some(key) = lib.natives.as_ref().and_then(|n| n.get("linux")) {
                if let Some(art) = classifiers.get(key) {
                    out.push((art.path.clone(), art.url.clone(), art.sha1.clone()));
                }
            }
        }
    }
    out
}

fn should_include(lib: &Library) -> bool {
    if lib.rules.is_empty() {
        return true;
    }

    let mut result = false;

    // Unconditional allow?
    for rule in &lib.rules {
        if rule.action == "allow" && rule.os.is_none() && rule.features.is_none() {
            result = true;
        }
    }

    for rule in &lib.rules {
        if rule.features.is_some() {
            // Feature-gated rules (demo, custom resolution) — skip
            if rule.action == "allow" {
                result = false;
            }
            continue;
        }
        let os_match = match &rule.os {
            None => true,
            Some(os) => os.name.as_deref() == Some("linux") || os.name.is_none(),
        };
        if os_match {
            result = rule.action == "allow";
        }
    }

    result
}

fn maven_path(name: &str) -> String {
    // "group:artifact:version" → "group/artifact/version/artifact-version.jar"
    // "group:artifact:version:classifier" → "group/artifact/version/artifact-version-classifier.jar"
    let parts: Vec<&str> = name.splitn(4, ':').collect();
    if parts.len() < 3 {
        return name.to_string();
    }
    let (group, artifact, version) = (parts[0], parts[1], parts[2]);
    let group_path = group.replace('.', "/");
    if let Some(classifier) = parts.get(3) {
        format!(
            "{}/{}/{}/{}-{}-{}.jar",
            group_path, artifact, version, artifact, version, classifier
        )
    } else {
        format!(
            "{}/{}/{}/{}-{}.jar",
            group_path, artifact, version, artifact, version
        )
    }
}

pub(crate) async fn download_checked(
    client: &Client,
    url: &str,
    dest: &Path,
    sha1: Option<&str>,
) -> Result<(), String> {
    if dest.exists() {
        if let Some(hash) = sha1 {
            if sha1_ok(dest, hash) {
                return Ok(());
            }
        } else {
            return Ok(());
        }
    }

    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let bytes = client
        .get(url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .bytes()
        .await
        .map_err(|e| e.to_string())?;

    std::fs::write(dest, &bytes).map_err(|e| e.to_string())?;
    Ok(())
}

pub(crate) fn sha1_ok(path: &Path, expected: &str) -> bool {
    std::fs::read(path)
        .map(|bytes| {
            let mut h = Sha1::new();
            h.update(&bytes);
            format!("{:x}", h.finalize()) == expected
        })
        .unwrap_or(false)
}

fn extract_natives(jar: &Path, dest: &Path, exclude: &[String]) -> Result<(), String> {
    let file = std::fs::File::open(jar).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = entry.name().to_string();

        if name.starts_with("META-INF") {
            continue;
        }
        if exclude.iter().any(|ex| name.contains(ex.as_str())) {
            continue;
        }
        if !name.ends_with(".so") && !name.contains(".so.") {
            continue;
        }

        let dest_path = dest.join(&name);
        if let Some(p) = dest_path.parent() {
            std::fs::create_dir_all(p).map_err(|e| e.to_string())?;
        }
        let mut out = std::fs::File::create(&dest_path).map_err(|e| e.to_string())?;
        std::io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Returns the minimum Java version required for a given MC version string.
fn min_java_for_mc(mc_version: &str) -> u32 {
    let parts: Vec<u32> = mc_version
        .split('.')
        .filter_map(|s| s.parse().ok())
        .collect();
    let major = parts.first().copied().unwrap_or(1);
    // New year-based naming (e.g. "26.1.2"): requires Java 25+
    if major != 1 {
        return 25;
    }
    let minor = parts.get(1).copied().unwrap_or(0);
    let patch = parts.get(2).copied().unwrap_or(0);
    if minor > 20 || (minor == 20 && patch >= 5) {
        return 21;
    }
    if minor >= 17 {
        return 17;
    }
    8
}

/// Find the highest Java binary in a directory that meets `min_version`.
fn best_java_in_dir(dir: &Path, min: u32) -> Option<String> {
    let entries = std::fs::read_dir(dir).ok()?;
    let mut found: Vec<(u32, String)> = entries
        .flatten()
        .filter_map(|e| {
            let bin = find_java_in_dir(&e.path())?;
            let major = detect_java_major(&bin);
            if major >= min {
                Some((major, bin))
            } else {
                None
            }
        })
        .collect();
    found.sort_by_key(|(v, _)| std::cmp::Reverse(*v));
    found.into_iter().next().map(|(_, p)| p)
}

/// Walk one level into `dir` looking for `bin/java`.
fn find_java_in_dir(dir: &Path) -> Option<String> {
    // Adoptium extracts a subdirectory like jdk-21.0.7+6-jre/ containing bin/java
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let bin = entry.path().join("bin/java");
            if bin.exists() {
                return Some(bin.to_string_lossy().into_owned());
            }
        }
    }
    let direct = dir.join("bin/java");
    if direct.exists() {
        return Some(direct.to_string_lossy().into_owned());
    }
    None
}

/// Pick the best available Java for `mc_version`, checking managed JREs then system paths.
fn find_best_java(base: &Path, mc_version: &str) -> String {
    let min = min_java_for_mc(mc_version);

    // 1. Managed JREs downloaded by CouchCraft
    if let Some(p) = best_java_in_dir(&base.join("jre"), min) {
        return p;
    }

    // 2. System JREs in /usr/lib/jvm
    if let Ok(entries) = std::fs::read_dir("/usr/lib/jvm") {
        let mut found: Vec<(u32, String)> = entries
            .flatten()
            .filter_map(|e| {
                let bin = e.path().join("bin/java");
                if !bin.exists() {
                    return None;
                }
                let major = detect_java_major(&bin.to_string_lossy());
                if major >= min {
                    Some((major, bin.to_string_lossy().into_owned()))
                } else {
                    None
                }
            })
            .collect();
        found.sort_by_key(|(v, _)| std::cmp::Reverse(*v));
        if let Some((_, p)) = found.into_iter().next() {
            return p;
        }
    }

    // 3. Explicit known fallback paths
    let candidates = [
        "/usr/bin/java",
        "/usr/lib/jvm/java-26-openjdk-amd64/bin/java",
        "/usr/lib/jvm/java-25-openjdk-amd64/bin/java",
        "/usr/lib/jvm/java-21-openjdk-amd64/bin/java",
        "/usr/lib/jvm/java-17-openjdk-amd64/bin/java",
    ];
    candidates
        .iter()
        .find(|p| std::path::Path::new(p).exists())
        .map(|s| s.to_string())
        .unwrap_or_else(|| "java".to_string())
}

/// Download a JRE from Adoptium if no suitable Java is already available.
async fn ensure_java(
    client: &Client,
    base: &Path,
    mc_version: &str,
    emit: impl Fn(u32, u32) + Send,
) -> Result<(), String> {
    let min = min_java_for_mc(mc_version);

    // Already have a managed JRE that qualifies?
    if best_java_in_dir(&base.join("jre"), min).is_some() {
        return Ok(());
    }

    // System Java qualifies?
    if let Ok(entries) = std::fs::read_dir("/usr/lib/jvm") {
        for entry in entries.flatten() {
            let bin = entry.path().join("bin/java");
            if bin.exists() && detect_java_major(&bin.to_string_lossy()) >= min {
                return Ok(());
            }
        }
    }
    if std::path::Path::new("/usr/bin/java").exists() && detect_java_major("/usr/bin/java") >= min {
        return Ok(());
    }

    // Need to download from Adoptium
    let url = format!(
        "https://api.adoptium.net/v3/binary/latest/{}/ga/linux/x64/jre/hotspot/normal/eclipse",
        min
    );
    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let total = resp.content_length().unwrap_or(0);
    let mut stream = resp.bytes_stream();
    let mut data: Vec<u8> = Vec::new();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        data.extend_from_slice(&chunk);
        let done = if total > 0 {
            (data.len() as u64).min(total) as u32
        } else {
            data.len() as u32
        };
        emit(done, total.max(1) as u32);
    }

    // Extract tar.gz into {data}/jre/{min}/
    let dest = base.join("jre").join(min.to_string());
    std::fs::create_dir_all(&dest).map_err(|e| e.to_string())?;
    let gz = flate2::read::GzDecoder::new(std::io::Cursor::new(&data));
    let mut archive = tar::Archive::new(gz);
    archive.unpack(&dest).map_err(|e| e.to_string())?;

    Ok(())
}

/// Tauri command: list all Java runtimes — managed (downloaded) + system.
#[tauri::command]
pub async fn detect_java_runtimes(app: tauri::AppHandle) -> Vec<serde_json::Value> {
    let base = match app.path().app_data_dir() {
        Ok(p) => p,
        Err(_) => return Vec::new(),
    };

    let mut runtimes = Vec::new();

    // Managed JREs in {data}/jre/
    let jre_base = base.join("jre");
    if let Ok(entries) = std::fs::read_dir(&jre_base) {
        for entry in entries.flatten() {
            if let Some(bin) = find_java_in_dir(&entry.path()) {
                let major = detect_java_major(&bin);
                if major > 0 {
                    runtimes.push(serde_json::json!({
                        "version": major,
                        "path": bin,
                        "buildString": format!("CouchCraft managed Java {}", major),
                        "isSystem": false,
                    }));
                }
            }
        }
    }

    // System JREs in /usr/lib/jvm
    if let Ok(entries) = std::fs::read_dir("/usr/lib/jvm") {
        for entry in entries.flatten() {
            let bin = entry.path().join("bin/java");
            if !bin.exists() {
                continue;
            }
            let bin_str = bin.to_string_lossy().into_owned();
            let major = detect_java_major(&bin_str);
            if major == 0 {
                continue;
            }
            runtimes.push(serde_json::json!({
                "version": major,
                "path": bin_str,
                "buildString": entry.file_name().to_string_lossy(),
                "isSystem": true,
            }));
        }
    }

    // /usr/bin/java
    if std::path::Path::new("/usr/bin/java").exists() {
        let major = detect_java_major("/usr/bin/java");
        if major > 0 {
            runtimes.push(serde_json::json!({
                "version": major,
                "path": "/usr/bin/java",
                "buildString": format!("system java {}", major),
                "isSystem": true,
            }));
        }
    }

    runtimes.sort_by_key(|r| std::cmp::Reverse(r["version"].as_u64().unwrap_or(0)));
    runtimes
}

fn detect_java_major(java_bin: &str) -> u32 {
    // `java -version` writes to stderr: openjdk version "21.0.3" ... or "26" ...
    let Ok(output) = std::process::Command::new(java_bin)
        .arg("-version")
        .output()
    else {
        return 0;
    };
    let text = String::from_utf8_lossy(&output.stderr);
    // Find the quoted version string
    let Some(ver_str) = text.split('"').nth(1) else {
        return 0;
    };
    let parts: Vec<&str> = ver_str.splitn(2, '.').collect();
    let major: u32 = parts[0].parse().unwrap_or(0);
    // Old "1.x" scheme (Java 8 = "1.8.0_xxx")
    if major == 1 {
        return parts
            .get(1)
            .and_then(|s| s.splitn(2, '.').next())
            .and_then(|s| s.parse().ok())
            .unwrap_or(8);
    }
    major
}

fn write_options_fullscreen(game_dir: &Path) {
    let path = game_dir.join("options.txt");
    let existing = std::fs::read_to_string(&path).unwrap_or_default();

    let mut lines: Vec<String> = existing
        .lines()
        .filter(|l| !l.starts_with("fullscreen:"))
        .map(String::from)
        .collect();
    lines.push("fullscreen:true".into());

    let _ = std::fs::write(&path, lines.join("\n") + "\n");
}

/// Tail `log_path` until Minecraft logs "Time elapsed:" — the last line
/// logged before the main menu appears — or `timeout_secs` elapses.
fn wait_for_game_ready(log_path: &std::path::Path, timeout_secs: u64) -> bool {
    use std::io::{BufRead, BufReader, Seek, SeekFrom};

    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(timeout_secs);

    // The log file is created by the launcher before spawn, so it exists
    // immediately.  Open a separate read handle.
    let Ok(file) = std::fs::File::open(log_path) else {
        return false;
    };
    let mut reader = BufReader::new(file);
    // Start at the beginning of the freshly-truncated file.
    let _ = reader.seek(SeekFrom::Start(0));

    let mut line = String::new();
    while std::time::Instant::now() < deadline {
        line.clear();
        match reader.read_line(&mut line) {
            Ok(0) => {
                // Nothing new yet — yield and retry.
                std::thread::sleep(std::time::Duration::from_millis(100));
            }
            Ok(_) => {
                if line.contains("Time elapsed:") {
                    return true;
                }
            }
            Err(_) => break,
        }
    }
    false
}

fn process_args(args: &[serde_json::Value], tokens: &HashMap<String, String>) -> Vec<String> {
    let mut out = Vec::new();
    for arg in args {
        match arg {
            serde_json::Value::String(s) => out.push(substitute_tokens(s, tokens)),
            serde_json::Value::Object(obj) => {
                if let Some(rules) = obj.get("rules") {
                    if !eval_arg_rules(rules) {
                        continue;
                    }
                }
                match obj.get("value") {
                    Some(serde_json::Value::String(s)) => out.push(substitute_tokens(s, tokens)),
                    Some(serde_json::Value::Array(arr)) => {
                        for item in arr {
                            if let serde_json::Value::String(s) = item {
                                out.push(substitute_tokens(s, tokens));
                            }
                        }
                    }
                    _ => {}
                }
            }
            _ => {}
        }
    }
    out
}

fn substitute_tokens(s: &str, tokens: &HashMap<String, String>) -> String {
    let mut out = s.to_string();
    for (k, v) in tokens {
        out = out.replace(&format!("${{{}}}", k), v);
    }
    out
}

fn eval_arg_rules(rules: &serde_json::Value) -> bool {
    let Some(arr) = rules.as_array() else {
        return true;
    };
    for rule in arr {
        let action = rule
            .get("action")
            .and_then(|v| v.as_str())
            .unwrap_or("allow");

        // Feature-gated args (demo, quickplay support flag, etc.) — skip
        if rule.get("features").is_some() {
            if action == "allow" {
                return false;
            }
            continue;
        }

        if let Some(os) = rule.get("os") {
            let name = os.get("name").and_then(|v| v.as_str());
            let matches = name == Some("linux") || name.is_none();
            if action == "allow" && !matches {
                return false;
            }
            if action == "disallow" && matches {
                return false;
            }
        }
    }
    true
}

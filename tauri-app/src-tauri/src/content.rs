use serde::{Deserialize, Serialize};
use tauri::Manager;

// ── Modrinth deserialization types ────────────────────────────────────────────

#[derive(Deserialize)]
struct SearchResponse {
    hits: Vec<SearchHit>,
}

#[derive(Deserialize)]
struct SearchHit {
    project_id: String,
    slug: String,
    title: String,
    description: String,
    icon_url: Option<String>,
    downloads: u64,
    follows: u64,
    versions: Vec<String>,
    categories: Vec<String>,
}

#[derive(Deserialize)]
struct MrVersion {
    id: String,
    name: String,
    version_number: String,
    game_versions: Vec<String>,
    loaders: Vec<String>,
    #[serde(rename = "version_type")]
    version_type: String,
    files: Vec<MrFile>,
}

#[derive(Deserialize)]
struct MrFile {
    url: String,
    filename: String,
    primary: bool,
    size: u64,
}

// ── Output types (sent to frontend) ──────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModrinthHit {
    pub project_id: String,
    pub slug: String,
    pub title: String,
    pub description: String,
    pub icon_url: Option<String>,
    pub downloads: u64,
    pub follows: u64,
    pub categories: Vec<String>,
    pub versions: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModrinthVersionFile {
    pub version_id: String,
    pub version_name: String,
    pub version_number: String,
    pub url: String,
    pub filename: String,
    pub size_bytes: u64,
    pub loaders: Vec<String>,
    pub game_versions: Vec<String>,
    pub version_type: String,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn modrinth_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("CouchCraft/0.1 (github.com/couchcraft)")
        .build()
        .map_err(|e| e.to_string())
}

fn content_subdir(category: &str) -> Result<&'static str, String> {
    match category {
        "mod"          => Ok("mods"),
        "resourcepack" => Ok("resourcepacks"),
        "datapack"     => Ok("datapacks"),
        "shader"       => Ok("shaderpacks"),
        other          => Err(format!("Unknown content category: {other}")),
    }
}

/// Whether to include a loader facet for this project type.
/// Resource packs, shaders, and data packs are cross-loader.
fn uses_loader_facet(project_type: &str) -> bool {
    project_type == "mod"
}

fn best_version(mut versions: Vec<MrVersion>) -> Option<MrVersion> {
    // Prefer release > beta > alpha; Modrinth returns newest first within each type.
    let rank = |v: &MrVersion| match v.version_type.as_str() {
        "release" => 0u8,
        "beta"    => 1,
        _         => 2,
    };
    versions.sort_by_key(rank);
    versions.into_iter().next()
}

// ── Commands ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn search_modrinth(
    query: String,
    project_type: String,
    mc_version: String,
    loader: String,
    offset: u32,
) -> Result<Vec<ModrinthHit>, String> {
    let client = modrinth_client()?;

    let mut facet_groups: Vec<String> = vec![
        format!(r#"["project_type:{}"]"#, project_type),
    ];
    if !mc_version.is_empty() {
        facet_groups.push(format!(r#"["versions:{}"]"#, mc_version));
    }
    if uses_loader_facet(&project_type) && !loader.is_empty() && loader != "vanilla" {
        facet_groups.push(format!(r#"["categories:{}"]"#, loader));
    }
    let facets = format!("[{}]", facet_groups.join(","));

    let resp = client
        .get("https://api.modrinth.com/v2/search")
        .query(&[
            ("query",  query.as_str()),
            ("facets", facets.as_str()),
            ("limit",  "20"),
            ("offset", &offset.to_string()),
        ])
        .send()
        .await
        .map_err(|e| format!("Modrinth search error: {e}"))?
        .json::<SearchResponse>()
        .await
        .map_err(|e| format!("Modrinth parse error: {e}"))?;

    Ok(resp.hits.into_iter().map(|h| ModrinthHit {
        project_id:  h.project_id,
        slug:        h.slug,
        title:       h.title,
        description: h.description,
        icon_url:    h.icon_url,
        downloads:   h.downloads,
        follows:     h.follows,
        categories:  h.categories,
        versions:    h.versions,
    }).collect())
}

#[tauri::command]
pub async fn get_modrinth_best_version(
    project_id: String,
    mc_version: String,
    loader: String,
    project_type: String,
) -> Result<Option<ModrinthVersionFile>, String> {
    let client = modrinth_client()?;
    let url = format!("https://api.modrinth.com/v2/project/{}/version", project_id);

    let add_loader = uses_loader_facet(&project_type) && !loader.is_empty() && loader != "vanilla";

    // Build query params for the filtered request.
    let gv_json  = format!(r#"["{}"]"#, mc_version);
    let ldr_json = format!(r#"["{}"]"#, loader);

    let mut params: Vec<(&str, &str)> = vec![];
    if !mc_version.is_empty() { params.push(("game_versions", &gv_json)); }
    if add_loader             { params.push(("loaders",       &ldr_json)); }

    let versions: Vec<MrVersion> = client
        .get(&url)
        .query(&params)
        .send()
        .await
        .map_err(|e| format!("Version fetch error: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Version parse error: {e}"))?;

    // If the loader-filtered request found nothing, retry without loader constraint.
    let versions = if versions.is_empty() && add_loader {
        let fallback: Vec<(&str, &str)> = if !mc_version.is_empty() {
            vec![("game_versions", &gv_json)]
        } else {
            vec![]
        };
        client
            .get(&url)
            .query(&fallback)
            .send()
            .await
            .map_err(|e| format!("Fallback fetch error: {e}"))?
            .json::<Vec<MrVersion>>()
            .await
            .map_err(|e| format!("Fallback parse error: {e}"))?
    } else {
        versions
    };

    let version = match best_version(versions) {
        Some(v) => v,
        None    => return Ok(None),
    };

    let file = version.files.iter().find(|f| f.primary).or_else(|| version.files.first());

    Ok(file.map(|f| ModrinthVersionFile {
        version_id:     version.id.clone(),
        version_name:   version.name.clone(),
        version_number: version.version_number.clone(),
        url:            f.url.clone(),
        filename:       f.filename.clone(),
        size_bytes:     f.size,
        loaders:        version.loaders.clone(),
        game_versions:  version.game_versions.clone(),
        version_type:   version.version_type.clone(),
    }))
}

#[tauri::command]
pub async fn download_content(
    app: tauri::AppHandle,
    url: String,
    instance_id: String,
    filename: String,
    category: String,
) -> Result<(), String> {
    let subdir  = content_subdir(&category)?;
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let dest = data_dir
        .join("instances")
        .join(&instance_id)
        .join(".minecraft")
        .join(subdir)
        .join(&filename);

    let client = modrinth_client()?;
    let bytes = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Download error: {e}"))?
        .bytes()
        .await
        .map_err(|e| format!("Read error: {e}"))?;

    std::fs::write(&dest, &bytes).map_err(|e| format!("Write error: {e}"))?;
    Ok(())
}

#[tauri::command]
pub async fn delete_content_file(
    app: tauri::AppHandle,
    instance_id: String,
    filename: String,
    category: String,
) -> Result<(), String> {
    let subdir   = content_subdir(&category)?;
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let path = data_dir
        .join("instances")
        .join(&instance_id)
        .join(".minecraft")
        .join(subdir)
        .join(&filename);

    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| format!("Delete error: {e}"))?;
    }
    Ok(())
}

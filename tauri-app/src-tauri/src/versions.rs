use serde::{Deserialize, Serialize};

// ── Output types (serialized to frontend) ────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McVersion {
    pub id: String,
    pub version_type: String, // "release" | "snapshot" | "old_beta" | "old_alpha"
}

#[derive(Debug, Clone, Serialize)]
pub struct LoaderVersion {
    pub version: String,
    pub stable: bool,
}

// ── Mojang manifest ───────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct ManifestResponse {
    versions: Vec<ManifestEntry>,
}

#[derive(Deserialize)]
struct ManifestEntry {
    id: String,
    #[serde(rename = "type")]
    version_type: String,
}

#[tauri::command]
pub async fn fetch_mc_versions() -> Result<Vec<McVersion>, String> {
    let resp = reqwest::get("https://launchermeta.mojang.com/mc/game/version_manifest_v2.json")
        .await
        .map_err(|e| format!("Failed to reach Mojang: {e}"))?;

    let manifest: ManifestResponse = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse manifest: {e}"))?;

    Ok(manifest
        .versions
        .into_iter()
        .map(|v| McVersion {
            id: v.id,
            version_type: v.version_type,
        })
        .collect())
}

// ── Fabric ────────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct FabricEntry {
    version: String,
    stable: bool,
}

async fn fetch_fabric_versions() -> Result<Vec<LoaderVersion>, String> {
    let entries: Vec<FabricEntry> = reqwest::get("https://meta.fabricmc.net/v2/versions/loader")
        .await
        .map_err(|e| format!("Fabric API error: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Fabric parse error: {e}"))?;

    Ok(entries
        .into_iter()
        .map(|e| LoaderVersion {
            version: e.version,
            stable: e.stable,
        })
        .collect())
}

// ── Quilt ─────────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct QuiltEntry {
    version: String,
}

async fn fetch_quilt_versions() -> Result<Vec<LoaderVersion>, String> {
    let entries: Vec<QuiltEntry> = reqwest::get("https://meta.quiltmc.org/v3/versions/loader")
        .await
        .map_err(|e| format!("Quilt API error: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Quilt parse error: {e}"))?;

    Ok(entries
        .into_iter()
        .map(|e| {
            let stable = !e.version.contains("beta")
                && !e.version.contains("alpha")
                && !e.version.contains("rc");
            LoaderVersion {
                version: e.version,
                stable,
            }
        })
        .collect())
}

// ── Maven XML helper ──────────────────────────────────────────────────────────

fn parse_maven_version_tags(xml: &str) -> Vec<String> {
    xml.lines()
        .filter_map(|line| {
            let t = line.trim();
            if t.starts_with("<version>") && t.ends_with("</version>") {
                Some(t[9..t.len() - 10].to_string())
            } else {
                None
            }
        })
        .collect()
}

// ── Forge ─────────────────────────────────────────────────────────────────────

async fn fetch_forge_versions(mc_version: &str) -> Result<Vec<LoaderVersion>, String> {
    let xml = reqwest::get(
        "https://files.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml",
    )
    .await
    .map_err(|e| format!("Forge API error: {e}"))?
    .text()
    .await
    .map_err(|e| format!("Forge response error: {e}"))?;

    let prefix = format!("{mc_version}-");

    // Collect and reverse so newest versions come first.
    let mut versions: Vec<LoaderVersion> = parse_maven_version_tags(&xml)
        .into_iter()
        .filter(|v| v.starts_with(&prefix))
        .map(|v| {
            // "1.20.1-47.3.0" → "47.3.0"
            let forge_ver = v[prefix.len()..].to_string();
            LoaderVersion {
                version: forge_ver,
                stable: true,
            }
        })
        .collect();

    versions.reverse();
    Ok(versions)
}

// ── NeoForge ──────────────────────────────────────────────────────────────────
// NeoForge versions: "{major}.{minor}.{build}" where major.minor mirrors the MC version.
// Old MC format: "1.21.1" → NeoForge prefix "21.1."
// New MC format: "26.1.0" → NeoForge prefix "26.1."

fn mc_to_neoforge_prefix(mc_version: &str) -> Option<String> {
    let parts: Vec<&str> = mc_version.split('.').collect();
    if parts.len() < 2 {
        return None;
    }
    if parts[0] != "1" {
        // New naming convention (e.g. "26.1.0"): use parts[0].parts[1] directly.
        let major = parts[0];
        let minor = parts.get(1).copied().unwrap_or("0");
        Some(format!("{major}.{minor}."))
    } else {
        // Legacy format (e.g. "1.21.1"): strip the leading "1.", use parts[1].parts[2].
        let major = parts[1];
        let minor = parts.get(2).copied().unwrap_or("0");
        Some(format!("{major}.{minor}."))
    }
}

async fn fetch_neoforge_versions(mc_version: &str) -> Result<Vec<LoaderVersion>, String> {
    let xml = reqwest::get(
        "https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml",
    )
    .await
    .map_err(|e| format!("NeoForge API error: {e}"))?
    .text()
    .await
    .map_err(|e| format!("NeoForge response error: {e}"))?;

    let prefix = mc_to_neoforge_prefix(mc_version)
        .ok_or_else(|| format!("Invalid MC version for NeoForge: {mc_version}"))?;

    let mut versions: Vec<LoaderVersion> = parse_maven_version_tags(&xml)
        .into_iter()
        .filter(|v| v.starts_with(&prefix))
        .map(|v| LoaderVersion {
            version: v,
            stable: true,
        })
        .collect();

    versions.reverse();
    Ok(versions)
}

// ── Unified command ───────────────────────────────────────────────────────────

#[tauri::command]
pub async fn fetch_loader_versions(
    loader: String,
    mc_version: String,
) -> Result<Vec<LoaderVersion>, String> {
    match loader.as_str() {
        "fabric" => fetch_fabric_versions().await,
        "quilt" => fetch_quilt_versions().await,
        "forge" => fetch_forge_versions(&mc_version).await,
        "neoforge" => fetch_neoforge_versions(&mc_version).await,
        _ => Ok(vec![]),
    }
}

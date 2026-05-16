use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

const CLIENT_ID: &str = "c8b4fed7-2925-4a9f-8224-65e41c6e92d5";
const DEVICE_CODE_URL: &str = "https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode";
const TOKEN_URL: &str = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";
const XBL_URL: &str = "https://user.auth.xboxlive.com/user/authenticate";
const XSTS_URL: &str = "https://xsts.auth.xboxlive.com/xsts/authorize";
const MC_LOGIN_URL: &str = "https://api.minecraftservices.com/launcher/login";
const MC_PROFILE_URL: &str = "https://api.minecraftservices.com/minecraft/profile";

// ── Types returned to the frontend ───────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct DeviceCodeInfo {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: u32,
    pub interval: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AuthAccount {
    pub ms_refresh_token: String,
    pub mc_access_token: String,
    pub mc_username: String,
    pub mc_uuid: String,
    pub expires_at: i64,
}

// ── Microsoft API response types ──────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct MsDeviceCodeResponse {
    device_code: String,
    user_code: String,
    verification_uri: String,
    expires_in: u32,
    interval: u32,
}

#[derive(Debug, Deserialize)]
struct MsTokenResponse {
    access_token: Option<String>,
    refresh_token: Option<String>,
    error: Option<String>,
}

// ── Xbox Live types ───────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
struct XblRequest {
    #[serde(rename = "Properties")]
    properties: XblProperties,
    #[serde(rename = "RelyingParty")]
    relying_party: String,
    #[serde(rename = "TokenType")]
    token_type: String,
}

#[derive(Debug, Serialize)]
struct XblProperties {
    #[serde(rename = "AuthMethod")]
    auth_method: String,
    #[serde(rename = "SiteName")]
    site_name: String,
    #[serde(rename = "RpsTicket")]
    rps_ticket: String,
}

#[derive(Debug, Deserialize)]
struct XTokenResponse {
    #[serde(rename = "Token")]
    token: String,
    #[serde(rename = "DisplayClaims")]
    display_claims: DisplayClaims,
}

#[derive(Debug, Deserialize)]
struct DisplayClaims {
    xui: Vec<Xui>,
}

#[derive(Debug, Deserialize)]
struct Xui {
    uhs: String,
}

#[derive(Debug, Serialize)]
struct XstsRequest {
    #[serde(rename = "Properties")]
    properties: XstsProperties,
    #[serde(rename = "RelyingParty")]
    relying_party: String,
    #[serde(rename = "TokenType")]
    token_type: String,
}

#[derive(Debug, Serialize)]
struct XstsProperties {
    #[serde(rename = "SandboxId")]
    sandbox_id: String,
    #[serde(rename = "UserTokens")]
    user_tokens: Vec<String>,
}

#[derive(Debug, Serialize)]
struct McLoginRequest {
    xtoken: String,
    platform: String,
}

#[derive(Debug, Deserialize)]
struct McLoginResponse {
    access_token: String,
    expires_in: i64,
}

#[derive(Debug, Deserialize)]
struct McProfileResponse {
    id: String,
    name: String,
}

// ── Commands ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn start_device_code_flow() -> Result<DeviceCodeInfo, String> {
    let client = Client::new();

    let body = client
        .post(DEVICE_CODE_URL)
        .form(&[
            ("client_id", CLIENT_ID),
            ("scope", "XboxLive.signin offline_access"),
            ("response_type", "device_code"),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?
        .text()
        .await
        .map_err(|e| e.to_string())?;

    let resp: MsDeviceCodeResponse = serde_json::from_str(&body)
        .map_err(|e| format!("Unexpected response: {} — body: {}", e, body))?;

    Ok(DeviceCodeInfo {
        device_code: resp.device_code,
        user_code: resp.user_code,
        verification_uri: resp.verification_uri,
        expires_in: resp.expires_in,
        interval: resp.interval,
    })
}

#[tauri::command]
pub async fn poll_device_code(device_code: String) -> Result<Option<AuthAccount>, String> {
    let client = Client::new();

    let body = client
        .post(TOKEN_URL)
        .form(&[
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
            ("client_id", CLIENT_ID),
            ("device_code", device_code.as_str()),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?
        .text()
        .await
        .map_err(|e| e.to_string())?;

    let resp: MsTokenResponse = serde_json::from_str(&body)
        .map_err(|e| format!("poll token — unexpected response: {} — body: {}", e, body))?;

    match resp.error.as_deref() {
        Some("authorization_pending") | Some("slow_down") => return Ok(None),
        Some(err) => return Err(err.to_string()),
        None => {}
    }

    let ms_access_token = resp.access_token.ok_or("No access token in response")?;
    let ms_refresh_token = resp.refresh_token.ok_or("No refresh token in response")?;

    let account = run_mc_auth_chain(&client, ms_access_token, ms_refresh_token).await?;
    Ok(Some(account))
}

#[tauri::command]
pub async fn refresh_mc_auth(refresh_token: String) -> Result<AuthAccount, String> {
    let client = Client::new();

    let body = client
        .post(TOKEN_URL)
        .form(&[
            ("grant_type", "refresh_token"),
            ("client_id", CLIENT_ID),
            ("refresh_token", refresh_token.as_str()),
            ("scope", "XboxLive.signin offline_access"),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?
        .text()
        .await
        .map_err(|e| e.to_string())?;

    let resp: MsTokenResponse = serde_json::from_str(&body)
        .map_err(|e| format!("refresh — unexpected response: {} — body: {}", e, body))?;

    if let Some(err) = resp.error {
        return Err(err);
    }

    let ms_access_token = resp.access_token.ok_or("No access token in response")?;
    let ms_refresh_token = resp.refresh_token.ok_or("No refresh token in response")?;

    run_mc_auth_chain(&client, ms_access_token, ms_refresh_token).await
}

// ── Internal auth chain ───────────────────────────────────────────────────────

async fn run_mc_auth_chain(
    client: &Client,
    ms_access_token: String,
    ms_refresh_token: String,
) -> Result<AuthAccount, String> {
    // Step 1: Xbox Live user token
    let xbl_body = client
        .post(XBL_URL)
        .header("Accept", "application/json")
        .header("x-xbl-contract-version", "1")
        .json(&XblRequest {
            properties: XblProperties {
                auth_method: "RPS".into(),
                site_name: "user.auth.xboxlive.com".into(),
                rps_ticket: format!("d={}", ms_access_token),
            },
            relying_party: "http://auth.xboxlive.com".into(),
            token_type: "JWT".into(),
        })
        .send()
        .await
        .map_err(|e| e.to_string())?
        .text()
        .await
        .map_err(|e| e.to_string())?;

    let xbl_resp: XTokenResponse = serde_json::from_str(&xbl_body)
        .map_err(|e| format!("XBL — unexpected response: {} — body: {}", e, xbl_body))?;

    // Step 2: XSTS token for Mojang services
    let xsts_body = client
        .post(XSTS_URL)
        .header("Accept", "application/json")
        .header("x-xbl-contract-version", "1")
        .json(&XstsRequest {
            properties: XstsProperties {
                sandbox_id: "RETAIL".into(),
                user_tokens: vec![xbl_resp.token],
            },
            relying_party: "rp://api.minecraftservices.com/".into(),
            token_type: "JWT".into(),
        })
        .send()
        .await
        .map_err(|e| e.to_string())?
        .text()
        .await
        .map_err(|e| e.to_string())?;

    let xsts_resp: XTokenResponse = serde_json::from_str(&xsts_body)
        .map_err(|e| format!("XSTS — unexpected response: {} — body: {}", e, xsts_body))?;

    // Use UHS from XSTS response (authoritative)
    let uhs = xsts_resp
        .display_claims
        .xui
        .first()
        .ok_or("No UHS in XSTS response")?
        .uhs
        .clone();

    // Step 3: Minecraft launcher login
    let mc_body = client
        .post(MC_LOGIN_URL)
        .header("Accept", "application/json")
        .json(&McLoginRequest {
            xtoken: format!("XBL3.0 x={};{}", uhs, xsts_resp.token),
            platform: "PC_LAUNCHER".into(),
        })
        .send()
        .await
        .map_err(|e| e.to_string())?
        .text()
        .await
        .map_err(|e| e.to_string())?;

    let mc_resp: McLoginResponse = serde_json::from_str(&mc_body)
        .map_err(|e| format!("MC login — unexpected response: {} — body: {}", e, mc_body))?;

    let expires_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
        + mc_resp.expires_in;

    // Step 4: Minecraft profile
    let profile_body = client
        .get(MC_PROFILE_URL)
        .header("Authorization", format!("Bearer {}", mc_resp.access_token))
        .send()
        .await
        .map_err(|e| e.to_string())?
        .text()
        .await
        .map_err(|e| e.to_string())?;

    let profile: McProfileResponse = serde_json::from_str(&profile_body)
        .map_err(|e| format!("MC profile — unexpected response: {} — body: {}", e, profile_body))?;

    Ok(AuthAccount {
        ms_refresh_token,
        mc_access_token: mc_resp.access_token,
        mc_username: profile.name,
        mc_uuid: profile.id,
        expires_at,
    })
}

mod mobile_services;
mod biometrics;
mod llm;
mod translation;
mod transport;
use base64::{engine::general_purpose::STANDARD, Engine};
use biometrics::{lock_session, lock_status, set_biometric_lock, set_lock_options, unlock};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{Manager, State};
use transport::{connection, read_limited, request, Session, IMAGE_LIMIT, JSON_LIMIT};

#[derive(Default)]
struct AppState(Mutex<Option<Session>>, tokio::sync::Mutex<()>);

/// Persisted single-server configuration for v1.0: just the ComfyUI address.
#[derive(Default, Serialize, Deserialize)]
struct ServerConfig {
    url: Option<String>,
}

async fn read_config(app: &tauri::AppHandle) -> Result<ServerConfig, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    match tokio::fs::read(dir.join("server.json")).await {
        Ok(bytes) => serde_json::from_slice(&bytes)
            .map_err(|_| "Adresse enregistrée invalide".to_string()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(ServerConfig::default()),
        Err(e) => Err(e.to_string()),
    }
}

async fn write_config(app: &tauri::AppHandle, config: &ServerConfig) -> Result<(), String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| e.to_string())?;
    let temp = dir.join("server.tmp");
    tokio::fs::write(
        &temp,
        serde_json::to_vec(config).map_err(|e| e.to_string())?,
    )
    .await
    .map_err(|e| e.to_string())?;
    tokio::fs::rename(&temp, dir.join("server.json"))
        .await
        .map_err(|e| e.to_string())?;
    // Older releases stored PC-pairing profiles; they are meaningless in v1.0.
    let _ = tokio::fs::remove_file(dir.join("profiles.json")).await;
    let _ = tokio::fs::remove_file(dir.join("pairing.json")).await;
    Ok(())
}

fn current(state: &State<AppState>) -> Result<Session, String> {
    state
        .0
        .lock()
        .map_err(|_| "État indisponible")?
        .clone()
        .ok_or_else(|| "Connectez un serveur ComfyUI".to_string())
}

fn set_session(state: &State<AppState>, session: Option<Session>) -> Result<(), String> {
    *state.0.lock().map_err(|_| "État indisponible")? = session;
    Ok(())
}

/// Probe a ComfyUI server: `/api/system_stats` must answer with a `devices`
/// array, which is how every ComfyUI build identifies itself.
async fn probe(app: &tauri::AppHandle, session: &Session) -> Result<(), String> {
    let bytes = read_limited(
        request(session, "/api/system_stats", None).await?,
        JSON_LIMIT,
    )
    .await?;
    let stats: serde_json::Value =
        serde_json::from_slice(&bytes).map_err(|_| "Réponse ComfyUI invalide")?;
    if !stats
        .get("devices")
        .is_some_and(serde_json::Value::is_array)
    {
        return Err("Cette adresse ne répond pas comme un serveur ComfyUI".into());
    }
    biometrics::guard(app).await?;
    Ok(())
}

#[tauri::command]
async fn connect_server(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    url: String,
) -> Result<String, String> {
    biometrics::guard(&app).await?;
    let _guard = state.1.lock().await;
    biometrics::guard(&app).await?;
    let session = connection(&url)?;
    probe(&app, &session).await?;
    let origin = session.url.clone();
    write_config(
        &app,
        &ServerConfig {
            url: Some(origin.clone()),
        },
    )
    .await?;
    set_session(&state, Some(session))?;
    Ok(origin)
}

#[tauri::command]
async fn restore(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<Option<String>, String> {
    biometrics::guard(&app).await?;
    let _guard = state.1.lock().await;
    biometrics::guard(&app).await?;
    let config = read_config(&app).await?;
    if let Some(url) = config.url {
        if let Ok(session) = connection(&url) {
            let origin = session.url.clone();
            set_session(&state, Some(session))?;
            return Ok(Some(origin));
        }
    }
    set_session(&state, None)?;
    Ok(None)
}

#[tauri::command]
async fn disconnect(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    biometrics::guard(&app).await?;
    let _guard = state.1.lock().await;
    biometrics::guard(&app).await?;
    write_config(&app, &ServerConfig::default()).await?;
    set_session(&state, None)?;
    Ok(())
}

#[tauri::command]
async fn api(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    path: String,
    body: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    biometrics::guard(&app).await?;
    let response = request(&current(&state)?, &path, body).await?;
    let bytes = read_limited(response, JSON_LIMIT).await?;
    biometrics::guard(&app).await?;
    serde_json::from_slice(&bytes).map_err(|_| "Réponse JSON du serveur invalide".into())
}

#[tauri::command]
async fn image(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<String, String> {
    biometrics::guard(&app).await?;
    let r = request(&current(&state)?, &path, None).await?;
    let mime = r
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/octet-stream")
        .split(';')
        .next()
        .unwrap()
        .to_string();
    if !["image/png", "image/jpeg", "image/webp", "image/gif"].contains(&mime.as_str()) {
        return Err("Format image non pris en charge".into());
    }
    let bytes = read_limited(r, IMAGE_LIMIT).await?;
    biometrics::guard(&app).await?;
    Ok(format!("data:{mime};base64,{}", STANDARD.encode(bytes)))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .plugin(tauri_plugin_pocket::init())
        .invoke_handler(tauri::generate_handler![
            mobile_services::update_action,
            mobile_services::voice_action,
            llm::llm_get,
            llm::llm_save,
            llm::llm_models,
            llm::llm_chat,
            translation::translate_text, translation::set_app_language,
            lock_status,
            unlock,
            lock_session,
            set_biometric_lock,
            set_lock_options,
            restore,
            disconnect,
            connect_server,
            api,
            image,
            save_image
        ])
        .run(tauri::generate_context!())
        .expect("Erreur au démarrage de 绘画");
}

#[tauri::command]
async fn save_image(
    app: tauri::AppHandle,
    data_url: String,
    filename: String,
) -> Result<String, String> {
    biometrics::guard(&app).await?;
    let (prefix, data) = data_url.split_once(',').ok_or("Image invalide")?;
    let (mime, ext) = match prefix {
        "data:image/png;base64" => ("image/png", "png"),
        "data:image/jpeg;base64" => ("image/jpeg", "jpg"),
        "data:image/webp;base64" => ("image/webp", "webp"),
        "data:image/gif;base64" => ("image/gif", "gif"),
        _ => return Err("Format invalide".into()),
    };
    if data.len() > IMAGE_LIMIT.div_ceil(3) * 4 {
        return Err("Image supérieure à 64 Mo".into());
    }
    let bytes = STANDARD.decode(data).map_err(|_| "Image invalide")?;
    if bytes.len() > IMAGE_LIMIT {
        return Err("Image supérieure à 64 Mo".into());
    }
    let stem = std::path::Path::new(&filename)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("image")
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
        .take(80)
        .collect::<String>();
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos();
    let name = format!("{stem}_{stamp}.{ext}");
    #[cfg(target_os = "android")]
    {
        let dir = app.path().app_cache_dir().map_err(|e| e.to_string())?;
        tokio::fs::create_dir_all(&dir)
            .await
            .map_err(|e| e.to_string())?;
        let path = dir.join(&name);
        tokio::fs::write(&path, &bytes)
            .await
            .map_err(|e| e.to_string())?;
        let handle = app
            .state::<tauri_plugin_pocket::Pocket<tauri::Wry>>()
            .0
            .clone();
        let args = serde_json::json!({"path":path.to_string_lossy(),"filename":name,"mime":mime});
        let result = tauri::async_runtime::spawn_blocking(move || {
            handle.run_mobile_plugin::<serde_json::Value>("save", args)
        })
        .await
        .map_err(|e| e.to_string())?;
        let _ = tokio::fs::remove_file(path).await;
        result.map_err(|e| e.to_string())?;
        Ok("Image enregistrée dans Photos / 绘画".into())
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = mime;
        let dir = app
            .path()
            .download_dir()
            .map_err(|e| e.to_string())?
            .join("绘画");
        tokio::fs::create_dir_all(&dir)
            .await
            .map_err(|e| e.to_string())?;
        tokio::fs::write(dir.join(&name), bytes)
            .await
            .map_err(|e| e.to_string())?;
        Ok(format!("Image enregistrée dans Téléchargements/绘画/{name}"))
    }
}

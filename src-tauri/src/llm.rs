//! OpenAI-compatible chat completion client used by the prompt assistant.
//!
//! The WebView cannot reach arbitrary hosts (the CSP only allows `'self'` and
//! the IPC bridge), so every request to a user supplied endpoint is issued from
//! Rust. Configuration lives next to `server.json` inside the app config dir.

use reqwest::{Client, Url};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::Duration;

const RESPONSE_LIMIT: usize = 4 * 1024 * 1024;
const REQUEST_LIMIT: usize = 4 * 1024 * 1024;

#[derive(Default, Serialize, Deserialize, Clone)]
pub(crate) struct LlmConfig {
    pub base_url: Option<String>,
    pub model: Option<String>,
    pub api_key: Option<String>,
    pub temperature: Option<f64>,
}

/// Shape returned to the UI. The key itself is never handed back.
#[derive(Serialize)]
pub(crate) struct LlmView {
    base_url: String,
    model: String,
    temperature: f64,
    has_key: bool,
}

#[derive(Serialize)]
pub(crate) struct ChatReply {
    content: String,
    model: String,
}

pub(crate) async fn read(app: &tauri::AppHandle) -> Result<LlmConfig, String> {
    use tauri::Manager;
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    match tokio::fs::read(dir.join("llm.json")).await {
        Ok(bytes) => serde_json::from_slice(&bytes).map_err(|_| "配置已损坏".to_string()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(LlmConfig::default()),
        Err(e) => Err(e.to_string()),
    }
}

pub(crate) async fn write(app: &tauri::AppHandle, config: &LlmConfig) -> Result<(), String> {
    use tauri::Manager;
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| e.to_string())?;
    let temp = dir.join("llm.tmp");
    tokio::fs::write(
        &temp,
        serde_json::to_vec(config).map_err(|e| e.to_string())?,
    )
    .await
    .map_err(|e| e.to_string())?;
    tokio::fs::rename(&temp, dir.join("llm.json"))
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub(crate) fn view(config: &LlmConfig) -> LlmView {
    LlmView {
        base_url: config.base_url.clone().unwrap_or_default(),
        model: config.model.clone().unwrap_or_default(),
        temperature: config.temperature.unwrap_or(0.7),
        has_key: config.api_key.as_ref().is_some_and(|k| !k.is_empty()),
    }
}

/// Accepts `https://api.openai.com`, `https://api.example.com/v1` or a full
/// `/chat/completions` URL and returns the trimmed base without a trailing slash.
pub(crate) fn normalize_base(input: &str) -> Result<String, String> {
    let raw = input.trim();
    if raw.is_empty() {
        return Err("请填写 API 地址".into());
    }
    if raw.chars().count() > 500 || raw.chars().any(char::is_whitespace) {
        return Err("API 地址无效".into());
    }
    let with_scheme = if raw.contains("://") {
        raw.to_string()
    } else {
        format!("https://{raw}")
    };
    let url = Url::parse(&with_scheme).map_err(|_| "API 地址无效")?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("API 地址必须使用 http 或 https".into());
    }
    if url.host_str().is_none() || url.fragment().is_some() || url.password().is_some() {
        return Err("API 地址无效".into());
    }
    let mut base = format!("{}://{}", url.scheme(), url.host_str().unwrap_or_default());
    if let Some(port) = url.port() {
        base.push_str(&format!(":{port}"));
    }
    let path = url.path().trim_end_matches('/');
    if !path.is_empty() {
        base.push_str(path);
    }
    Ok(base)
}

/// Some providers document the base without `/v1`; others with it. Only append
/// when the caller did not already point at a version segment.
fn endpoint(base: &str, route: &str) -> String {
    let trimmed = base.trim_end_matches('/');
    let has_version = trimmed
        .rsplit('/')
        .next()
        .is_some_and(|last| last.starts_with('v') && last[1..].chars().all(|c| c.is_ascii_digit()) && last.len() > 1);
    let root = if trimmed.ends_with("/chat/completions") || trimmed.ends_with("/models") {
        trimmed.rsplit_once('/').map(|(a, _)| a).unwrap_or(trimmed).to_string()
    } else if has_version {
        trimmed.to_string()
    } else {
        format!("{trimmed}/v1")
    };
    let root = root.trim_end_matches("/chat/completions").trim_end_matches("/models").to_string();
    format!("{}{}", root.trim_end_matches('/'), route)
}

fn client() -> Result<Client, String> {
    Client::builder()
        .redirect(reqwest::redirect::Policy::limited(3))
        .timeout(Duration::from_secs(120))
        .connect_timeout(Duration::from_secs(12))
        .build()
        .map_err(|_| "无法初始化网络连接".to_string())
}

fn failed(error: reqwest::Error) -> String {
    if error.is_timeout() {
        "请求超时，请检查 API 地址和网络。".into()
    } else if error.is_connect() {
        "无法连接到该 API，请检查地址是否正确。".into()
    } else {
        format!("请求失败：{error}")
    }
}

async fn send(mut builder: reqwest::RequestBuilder, key: Option<&str>) -> Result<reqwest::Response, String> {
    if let Some(key) = key.filter(|k| !k.is_empty()) {
        builder = builder.header("Authorization", format!("Bearer {key}"));
    }
    let response = builder
        .header("User-Agent", "huihua")
        .send()
        .await
        .map_err(failed)?;
    if response.status().is_success() {
        return Ok(response);
    }
    let code = response.status();
    let body = response.text().await.unwrap_or_default();
    let text: String = body.chars().take(600).collect();
    Err(match code.as_u16() {
        401 | 403 => "API 鉴权失败，请检查密钥。".to_string(),
        404 => "API 地址不存在，请确认是否包含 /v1。".to_string(),
        429 => "API 请求过于频繁，请稍后再试。".to_string(),
        _ if text.is_empty() => format!("API 返回 {code}"),
        _ => format!("API 返回 {code}：{text}"),
    })
}

#[tauri::command]
pub(crate) async fn llm_get(app: tauri::AppHandle) -> Result<LlmView, String> {
    Ok(view(&read(&app).await?))
}

#[tauri::command]
pub(crate) async fn llm_save(
    app: tauri::AppHandle,
    base_url: String,
    model: String,
    api_key: Option<String>,
    temperature: Option<f64>,
) -> Result<LlmView, String> {
    let mut config = read(&app).await?;
    config.base_url = Some(normalize_base(&base_url)?);
    let model = model.trim();
    if model.chars().count() > 200 {
        return Err("模型名称过长".into());
    }
    config.model = Some(model.to_string());
    // An omitted key keeps the stored one; an empty string clears it.
    if let Some(key) = api_key {
        let key = key.trim();
        if key.chars().count() > 400 {
            return Err("密钥过长".into());
        }
        config.api_key = if key.is_empty() {
            None
        } else {
            Some(key.to_string())
        };
    }
    config.temperature = Some(
        temperature
            .filter(|t| t.is_finite())
            .map(|t| t.clamp(0.0, 2.0))
            .unwrap_or(0.7),
    );
    write(&app, &config).await?;
    Ok(view(&config))
}

#[tauri::command]
pub(crate) async fn llm_models(
    app: tauri::AppHandle,
    base_url: Option<String>,
    api_key: Option<String>,
) -> Result<Vec<String>, String> {
    let stored = read(&app).await?;
    let base = match base_url.filter(|b| !b.trim().is_empty()) {
        Some(value) => normalize_base(&value)?,
        None => stored
            .base_url
            .clone()
            .ok_or_else(|| "请先填写 API 地址".to_string())?,
    };
    let key = api_key
        .filter(|k| !k.trim().is_empty())
        .or(stored.api_key)
        .unwrap_or_default();
    let response = send(client()?.get(endpoint(&base, "/models")), Some(&key)).await?;
    let bytes = response.bytes().await.map_err(failed)?;
    if bytes.len() > RESPONSE_LIMIT {
        return Err("API 返回内容过大".into());
    }
    let value: Value = serde_json::from_slice(&bytes).map_err(|_| "API 返回的不是 JSON".to_string())?;
    let mut names: Vec<String> = value
        .get("data")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.get("id").and_then(Value::as_str))
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default();
    names.sort();
    names.dedup();
    Ok(names)
}

#[tauri::command]
pub(crate) async fn llm_chat(
    app: tauri::AppHandle,
    messages: Vec<Value>,
    json_mode: Option<bool>,
) -> Result<ChatReply, String> {
    let config = read(&app).await?;
    let base = config
        .base_url
        .clone()
        .ok_or_else(|| "请先在设置中配置 AI 提示词接口".to_string())?;
    let model = config
        .model
        .clone()
        .filter(|m| !m.is_empty())
        .ok_or_else(|| "请先选择或填写模型".to_string())?;
    if messages.is_empty() || messages.len() > 64 {
        return Err("对话内容无效".into());
    }
    let mut body = json!({
        "model": model,
        "messages": messages,
        "temperature": config.temperature.unwrap_or(0.7),
        "stream": false,
    });
    if json_mode.unwrap_or(false) {
        body["response_format"] = json!({ "type": "json_object" });
    }
    let raw = serde_json::to_vec(&body).map_err(|e| e.to_string())?;
    if raw.len() > REQUEST_LIMIT {
        return Err("请求内容过大".into());
    }
    let response = send(
        client()?
            .post(endpoint(&base, "/chat/completions"))
            .header("Content-Type", "application/json")
            .body(raw),
        config.api_key.as_deref(),
    )
    .await?;
    let bytes = response.bytes().await.map_err(failed)?;
    if bytes.len() > RESPONSE_LIMIT {
        return Err("API 返回内容过大".into());
    }
    let value: Value = serde_json::from_slice(&bytes).map_err(|_| "API 返回的不是 JSON".to_string())?;
    let content = value
        .pointer("/choices/0/message/content")
        .and_then(Value::as_str)
        .or_else(|| value.pointer("/choices/0/text").and_then(Value::as_str))
        .ok_or_else(|| "API 没有返回文本内容".to_string())?
        .to_string();
    Ok(ChatReply {
        content,
        model: value
            .get("model")
            .and_then(Value::as_str)
            .unwrap_or(&model)
            .to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_bases() {
        assert_eq!(
            normalize_base("api.openai.com").unwrap(),
            "https://api.openai.com"
        );
        assert_eq!(
            normalize_base(" https://api.deepseek.com/v1/ ").unwrap(),
            "https://api.deepseek.com/v1"
        );
        assert_eq!(
            normalize_base("http://192.168.1.9:1234").unwrap(),
            "http://192.168.1.9:1234"
        );
        for bad in ["", "   ", "ftp://x", "https://x/#f", "https://u:p@x"] {
            assert!(normalize_base(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn appends_version_only_when_missing() {
        assert_eq!(
            endpoint("https://api.openai.com", "/chat/completions"),
            "https://api.openai.com/v1/chat/completions"
        );
        assert_eq!(
            endpoint("https://api.deepseek.com/v1", "/chat/completions"),
            "https://api.deepseek.com/v1/chat/completions"
        );
        assert_eq!(
            endpoint("https://x.test/v1/chat/completions", "/chat/completions"),
            "https://x.test/v1/chat/completions"
        );
        assert_eq!(endpoint("https://x.test/v1", "/models"), "https://x.test/v1/models");
        assert_eq!(
            endpoint("https://ark.example.com/api/v3", "/models"),
            "https://ark.example.com/api/v3/models"
        );
    }
}

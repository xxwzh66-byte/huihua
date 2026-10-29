use reqwest::{Client, Response, StatusCode, Url};
use std::time::Duration;

pub(crate) const IMAGE_LIMIT: usize = 64 * 1024 * 1024;
pub(crate) const JSON_LIMIT: usize = 32 * 1024 * 1024;

#[derive(Clone)]
pub(crate) struct Session {
    pub url: String,
    pub client: Client,
}

/// Normalises user input such as `192.168.1.20:8188` or
/// `http://comfy.local:8188/` into an origin string.
pub(crate) fn normalize_url(input: &str) -> Result<String, String> {
    let raw = input.trim();
    if raw.is_empty() {
        return Err("Indiquez l’adresse du serveur ComfyUI".into());
    }
    if raw.chars().count() > 300 || raw.contains(char::is_whitespace) {
        return Err("Adresse invalide".into());
    }
    let with_scheme = if raw.contains("://") {
        raw.to_string()
    } else {
        format!("http://{raw}")
    };
    let url = Url::parse(&with_scheme).map_err(|_| "Adresse invalide")?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("Le protocole doit être http ou https".into());
    }
    if url.host_str().is_none() {
        return Err("Adresse invalide".into());
    }
    if url.fragment().is_some() || url.password().is_some() {
        return Err("Adresse invalide".into());
    }
    let mut origin = format!(
        "{}://{}",
        url.scheme(),
        url.host_str().unwrap_or_default()
    );
    if let Some(port) = url.port() {
        origin.push_str(&format!(":{port}"));
    }
    // A ComfyUI instance may live under a sub-path (reverse proxy). Keep it,
    // stripped of trailing slashes, so `/api/...` can be appended safely.
    let path = url.path().trim_end_matches('/');
    if !path.is_empty() {
        origin.push_str(path);
    }
    Ok(origin)
}

pub(crate) fn connection(input: &str) -> Result<Session, String> {
    let url = normalize_url(input)?;
    let client = Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(120))
        .connect_timeout(Duration::from_secs(10))
        .build()
        .map_err(|_| "Initialisation de la connexion impossible")?;
    Ok(Session { url, client })
}

/// Only ComfyUI API routes may be requested; the legacy `/bridge/` companion
/// routes no longer exist in v1.0.
fn request_url(base: &str, path: &str) -> Result<Url, String> {
    if !path.starts_with("/api/") || path.contains('\\') || path.contains('#') {
        return Err("Route interdite".into());
    }
    let url = Url::parse(&format!("{}{}", base.trim_end_matches('/'), path))
        .map_err(|_| "Route invalide")?;
    if !url.path().starts_with("/api/") {
        return Err("Route interdite".into());
    }
    Ok(url)
}

fn network_error(error: reqwest::Error) -> String {
    if error.is_timeout() {
        "Le serveur ComfyUI n’a pas répondu à temps. Vérifiez qu’il est démarré.".into()
    } else if error.is_connect() {
        "Impossible de joindre le serveur ComfyUI. Vérifiez l’adresse, le port et le réseau.".into()
    } else {
        "Connexion interrompue pendant le transfert. Réessayez.".into()
    }
}

fn status_error(code: StatusCode, path: &str) -> Option<&'static str> {
    match code.as_u16() {
        401 | 403 => Some("Le serveur ComfyUI a refusé la requête."),
        502 | 503 if path.starts_with("/api/") => {
            Some("Le serveur répond, mais ComfyUI n’est pas encore prêt.")
        }
        429 => Some("Le serveur reçoit trop de demandes. Patientez quelques secondes."),
        _ => None,
    }
}

pub(crate) async fn request(
    session: &Session,
    path: &str,
    body: Option<serde_json::Value>,
) -> Result<Response, String> {
    let url = request_url(&session.url, path)?;
    let builder = if let Some(value) = body {
        session.client.post(url).json(&value)
    } else {
        session.client.get(url)
    };
    let response = builder.send().await.map_err(network_error)?;
    if response.status().is_success() {
        return Ok(response);
    }
    let code = response.status();
    if let Some(message) = status_error(code, path) {
        return Err(message.into());
    }
    let body = read_limited(response, 4096).await.unwrap_or_default();
    let message: String = String::from_utf8_lossy(&body).chars().take(1800).collect();
    Err(if message.is_empty() {
        format!("Le serveur a répondu {code}.")
    } else {
        format!("Serveur {code} : {message}")
    })
}

fn append_bounded(bytes: &mut Vec<u8>, chunk: &[u8], limit: usize) -> Result<(), String> {
    if chunk.len() > limit.saturating_sub(bytes.len()) {
        return Err("Réponse du serveur trop volumineuse".into());
    }
    bytes.extend_from_slice(chunk);
    Ok(())
}

pub(crate) async fn read_limited(mut response: Response, limit: usize) -> Result<Vec<u8>, String> {
    if response
        .content_length()
        .is_some_and(|length| length > limit as u64)
    {
        return Err("Réponse du serveur trop volumineuse".into());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(network_error)? {
        append_bounded(&mut bytes, &chunk, limit)?;
    }
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_addresses_and_adds_a_default_scheme() {
        assert_eq!(normalize_url("192.168.1.20:8188").unwrap(), "http://192.168.1.20:8188");
        assert_eq!(normalize_url(" http://pc:8189/ ").unwrap(), "http://pc:8189");
        assert_eq!(
            normalize_url("https://comfy.example.com/sub/").unwrap(),
            "https://comfy.example.com/sub"
        );
        assert_eq!(normalize_url("comfy.local").unwrap(), "http://comfy.local");
    }

    #[test]
    fn rejects_invalid_addresses() {
        for url in [
            "",
            "   ",
            "ftp://pc:8189",
            "http:///path",
            "http://pc:8189/#x",
            "http://pc:8189/?a=1#b",
            "http://user:pass@pc:8189",
            "http://pc:8189/a b",
        ] {
            assert!(normalize_url(url).is_err(), "{url}");
        }
    }

    #[test]
    fn only_comfy_routes_are_reachable() {
        assert!(request_url("http://pc:8188", "/api/view?filename=a..png").is_ok());
        for path in [
            "/bridge/info",
            "/api/../private",
            "/api/%2e%2e/private",
            "//example.com/api/view",
            "/api/view#fragment",
            "/api/\\private",
        ] {
            assert!(request_url("http://pc:8188", path).is_err(), "{path}");
        }
    }

    #[test]
    fn bound_is_enforced_before_appending_each_chunk() {
        let mut bytes = Vec::new();
        assert!(append_bounded(&mut bytes, b"1234", 5).is_ok());
        assert!(append_bounded(&mut bytes, b"56", 5).is_err());
        assert_eq!(bytes, b"1234");
        assert!(append_bounded(&mut bytes, b"5", 5).is_ok());
        assert!(append_bounded(&mut bytes, b"6", 5).is_err());
    }

    #[test]
    fn upstream_failures_are_reported() {
        assert!(status_error(StatusCode::UNAUTHORIZED, "/api/prompt").is_some());
        assert!(status_error(StatusCode::BAD_GATEWAY, "/api/system_stats")
            .unwrap()
            .contains("ComfyUI"));
        assert_eq!(status_error(StatusCode::BAD_REQUEST, "/api/prompt"), None);
    }
}

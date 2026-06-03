//! 全局 HTTP 客户端模块
//!
//! 提供支持全局代理配置的 HTTP 客户端。
//! 所有需要发送 HTTP 请求的模块都应使用此模块提供的客户端。

use once_cell::sync::OnceCell;
use reqwest::Client;
use std::collections::HashMap;
use std::env;
use std::net::IpAddr;
use std::sync::RwLock;
use std::time::Duration;

/// 全局共享 HTTP 客户端实例。
/// 直连 / 跟随系统代理，供 CC Switch 自身的对外请求（余额、用量、模型列表、
/// Skills 下载等）复用。供应商转发用的「按供应商出站代理」客户端由 `get_for` 管理。
static GLOBAL_CLIENT: OnceCell<RwLock<Client>> = OnceCell::new();

/// CC Switch 代理服务器当前监听的端口
static CC_SWITCH_PROXY_PORT: OnceCell<RwLock<u16>> = OnceCell::new();

/// 按供应商出站代理 URL 缓存的客户端。
/// key 为代理 URL，空串代表直连（强制 `.no_proxy()`，不走系统代理）。
static CLIENT_CACHE: OnceCell<RwLock<HashMap<String, Client>>> = OnceCell::new();

/// 设置 CC Switch 代理服务器的监听端口
///
/// 应在代理服务器启动时调用，以便系统代理检测能正确识别自己的端口
pub fn set_proxy_port(port: u16) {
    if let Some(lock) = CC_SWITCH_PROXY_PORT.get() {
        if let Ok(mut current_port) = lock.write() {
            *current_port = port;
            log::debug!("[HttpClient] Updated CC Switch proxy port to {port}");
        }
    } else {
        let _ = CC_SWITCH_PROXY_PORT.set(RwLock::new(port));
        log::debug!("[HttpClient] Initialized CC Switch proxy port to {port}");
    }
}

/// 获取 CC Switch 代理服务器的监听端口
fn get_proxy_port() -> u16 {
    CC_SWITCH_PROXY_PORT
        .get()
        .and_then(|lock| lock.read().ok())
        .map(|port| *port)
        .unwrap_or(15721) // 默认端口作为回退
}

/// 初始化全局共享 HTTP 客户端
///
/// 应在应用启动时调用一次。该客户端用于 CC Switch 自身的对外请求
/// （余额/用量查询、模型列表、Skills 下载等），默认直连并跟随系统代理。
/// 供应商转发用的「按供应商出站代理」客户端由 `get_for` 单独管理。
pub fn init() -> Result<(), String> {
    let client = build_client(None, false)?;
    // 已初始化则忽略（该共享客户端无需热更新）
    let _ = GLOBAL_CLIENT.set(RwLock::new(client));
    log::info!("[HttpClient] Global shared client initialized (direct / follow system proxy)");
    Ok(())
}

/// 获取全局共享 HTTP 客户端
///
/// 用于 CC Switch 自身的对外请求；直连 / 跟随系统代理。
pub fn get() -> Client {
    GLOBAL_CLIENT
        .get()
        .and_then(|lock| lock.read().ok())
        .map(|c| c.clone())
        .unwrap_or_else(|| {
            log::warn!("[HttpClient] Client not initialized, using fallback");
            build_client(None, false).unwrap_or_default()
        })
}

/// 按指定供应商出站代理 URL 获取 HTTP 客户端（带缓存）。
///
/// 转发时根据 `Provider::resolve_proxy_url` 的结果选择客户端：
/// - `Some(url)`：走该出站代理。
/// - `None`/空串：强制直连（`.no_proxy()`），不走系统代理。
///
/// 结果按 key 缓存（空串 = 直连），避免每个请求重建客户端。
/// 构建失败时回退到全局共享客户端，保证转发不被代理配置问题阻断。
pub fn get_for(proxy_url: Option<&str>) -> Client {
    let effective = proxy_url.filter(|s| !s.trim().is_empty());

    // key 为代理 URL；空串代表直连
    let key = effective.unwrap_or("").to_string();

    let cache = CLIENT_CACHE.get_or_init(|| RwLock::new(HashMap::new()));

    if let Ok(map) = cache.read() {
        if let Some(client) = map.get(&key) {
            return client.clone();
        }
    }

    match build_client(effective, true) {
        Ok(client) => {
            if let Ok(mut map) = cache.write() {
                map.insert(key, client.clone());
            }
            client
        }
        Err(e) => {
            log::warn!(
                "[HttpClient] get_for build failed for {}: {e}; falling back to global client",
                effective
                    .map(mask_url)
                    .unwrap_or_else(|| "direct".to_string())
            );
            get()
        }
    }
}

/// 构建 HTTP 客户端
///
/// - `proxy_url = Some(url)`：使用该出站代理。
/// - `proxy_url = None` 且 `force_direct = true`：强制直连（`.no_proxy()`），忽略系统代理。
/// - `proxy_url = None` 且 `force_direct = false`：跟随系统代理（指向 CC Switch 自身端口时防自环）。
fn build_client(proxy_url: Option<&str>, force_direct: bool) -> Result<Client, String> {
    let mut builder = Client::builder()
        .timeout(Duration::from_secs(600))
        .connect_timeout(Duration::from_secs(30))
        .pool_max_idle_per_host(10)
        .tcp_keepalive(Duration::from_secs(60))
        // 禁用 reqwest 自动解压：防止 reqwest 覆盖客户端原始 accept-encoding header。
        // 响应解压由 response_processor 根据 content-encoding 手动处理。
        .no_gzip()
        .no_brotli()
        .no_deflate();

    // 有代理地址则使用代理，否则跟随系统代理
    if let Some(url) = proxy_url {
        // 先验证 URL 格式和 scheme
        let parsed = url::Url::parse(url)
            .map_err(|e| format!("Invalid proxy URL '{}': {}", mask_url(url), e))?;

        let scheme = parsed.scheme();
        if !["http", "https", "socks5", "socks5h"].contains(&scheme) {
            return Err(format!(
                "Invalid proxy scheme '{}' in URL '{}'. Supported: http, https, socks5, socks5h",
                scheme,
                mask_url(url)
            ));
        }

        let proxy = reqwest::Proxy::all(url)
            .map_err(|e| format!("Invalid proxy URL '{}': {}", mask_url(url), e))?;
        builder = builder.proxy(proxy);
        log::debug!("[HttpClient] Proxy configured: {}", mask_url(url));
    } else if force_direct {
        // 强制直连：不走任何代理，连系统/环境变量代理也忽略
        builder = builder.no_proxy();
        log::debug!("[HttpClient] Direct connection (no proxy, ignoring system proxy)");
    } else {
        // 未指定代理时，让 reqwest 自动检测系统代理（环境变量）
        // 若系统代理指向本机 CC Switch 端口，禁用系统代理避免自环
        if system_proxy_points_to_loopback() {
            builder = builder.no_proxy();
            log::warn!(
                "[HttpClient] System proxy points to localhost, bypassing to avoid recursion"
            );
        } else {
            log::debug!("[HttpClient] Following system proxy (no explicit proxy configured)");
        }
    }

    builder
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))
}

fn system_proxy_points_to_loopback() -> bool {
    const KEYS: [&str; 6] = [
        "HTTP_PROXY",
        "http_proxy",
        "HTTPS_PROXY",
        "https_proxy",
        "ALL_PROXY",
        "all_proxy",
    ];

    KEYS.iter()
        .filter_map(|key| env::var(key).ok())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .any(|value| proxy_points_to_loopback(&value))
}

fn proxy_points_to_loopback(value: &str) -> bool {
    fn host_is_loopback(host: &str) -> bool {
        if host.eq_ignore_ascii_case("localhost") {
            return true;
        }
        host.parse::<IpAddr>()
            .map(|ip| ip.is_loopback())
            .unwrap_or(false)
    }

    // 检查是否指向 CC Switch 自己的代理端口
    // 只有指向自己的代理才需要跳过，避免递归
    fn is_cc_switch_proxy_port(port: Option<u16>) -> bool {
        let cc_switch_port = get_proxy_port();
        port == Some(cc_switch_port)
    }

    if let Ok(parsed) = url::Url::parse(value) {
        if let Some(host) = parsed.host_str() {
            // 只有当主机是 loopback 且端口是 CC Switch 的端口时才返回 true
            return host_is_loopback(host) && is_cc_switch_proxy_port(parsed.port());
        }
        return false;
    }

    let with_scheme = format!("http://{value}");
    if let Ok(parsed) = url::Url::parse(&with_scheme) {
        if let Some(host) = parsed.host_str() {
            return host_is_loopback(host) && is_cc_switch_proxy_port(parsed.port());
        }
    }

    false
}

/// 隐藏 URL 中的敏感信息（用于日志）
pub fn mask_url(url: &str) -> String {
    if let Ok(parsed) = url::Url::parse(url) {
        // 隐藏用户名和密码，保留 scheme、host 和端口
        let host = parsed.host_str().unwrap_or("?");
        match parsed.port() {
            Some(port) => format!("{}://{}:{}", parsed.scheme(), host, port),
            None => format!("{}://{}", parsed.scheme(), host),
        }
    } else {
        // URL 解析失败，返回部分内容
        if url.len() > 20 {
            format!("{}...", &url[..20])
        } else {
            url.to_string()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Mutex, OnceLock};

    fn env_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    #[test]
    fn test_mask_url() {
        assert_eq!(mask_url("http://127.0.0.1:7890"), "http://127.0.0.1:7890");
        assert_eq!(
            mask_url("http://user:pass@127.0.0.1:7890"),
            "http://127.0.0.1:7890"
        );
        assert_eq!(
            mask_url("socks5://admin:secret@proxy.example.com:1080"),
            "socks5://proxy.example.com:1080"
        );
        // 无端口的 URL 不应显示 ":?"
        assert_eq!(
            mask_url("http://proxy.example.com"),
            "http://proxy.example.com"
        );
        assert_eq!(
            mask_url("https://user:pass@proxy.example.com"),
            "https://proxy.example.com"
        );
    }

    #[test]
    fn test_build_client_direct() {
        // 强制直连
        assert!(build_client(None, true).is_ok());
        // 跟随系统代理
        assert!(build_client(None, false).is_ok());
    }

    #[test]
    fn test_build_client_with_http_proxy() {
        let result = build_client(Some("http://127.0.0.1:7890"), true);
        assert!(result.is_ok());
    }

    #[test]
    fn test_build_client_with_socks5_proxy() {
        let result = build_client(Some("socks5://127.0.0.1:1080"), true);
        assert!(result.is_ok());
    }

    #[test]
    fn test_build_client_invalid_url() {
        // reqwest::Proxy::all 对某些无效 URL 不会立即报错
        // 使用明确无效的 scheme 来触发错误
        let result = build_client(Some("invalid-scheme://127.0.0.1:7890"), true);
        assert!(result.is_err(), "Should reject invalid proxy scheme");
    }

    #[test]
    fn test_proxy_points_to_loopback() {
        // 设置 CC Switch 代理端口为 15721（默认值）
        set_proxy_port(15721);

        // 只有指向 CC Switch 自己端口的 loopback 地址才返回 true
        assert!(proxy_points_to_loopback("http://127.0.0.1:15721"));
        assert!(proxy_points_to_loopback("socks5://localhost:15721"));
        assert!(proxy_points_to_loopback("127.0.0.1:15721"));

        // 其他 loopback 端口不应该被跳过（允许使用其他本地代理工具）
        assert!(!proxy_points_to_loopback("http://127.0.0.1:7890"));
        assert!(!proxy_points_to_loopback("socks5://localhost:1080"));

        // 非 loopback 地址不应该被跳过
        assert!(!proxy_points_to_loopback("http://192.168.1.10:7890"));
        assert!(!proxy_points_to_loopback("http://192.168.1.10:15721"));
    }

    #[test]
    fn test_system_proxy_points_to_loopback() {
        let _guard = env_lock().lock().unwrap();

        // 设置 CC Switch 代理端口
        set_proxy_port(15721);

        let keys = [
            "HTTP_PROXY",
            "http_proxy",
            "HTTPS_PROXY",
            "https_proxy",
            "ALL_PROXY",
            "all_proxy",
        ];

        for key in &keys {
            std::env::remove_var(key);
        }

        // 指向 CC Switch 端口的代理应该被跳过
        std::env::set_var("HTTP_PROXY", "http://127.0.0.1:15721");
        assert!(system_proxy_points_to_loopback());

        // 指向其他端口的本地代理不应该被跳过
        std::env::set_var("HTTP_PROXY", "http://127.0.0.1:7890");
        assert!(!system_proxy_points_to_loopback());

        // 非 loopback 地址不应该被跳过
        std::env::set_var("HTTP_PROXY", "http://10.0.0.2:7890");
        assert!(!system_proxy_points_to_loopback());

        for key in &keys {
            std::env::remove_var(key);
        }
    }
}

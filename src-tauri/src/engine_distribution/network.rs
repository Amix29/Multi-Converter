#[cfg(target_os = "windows")]
use std::io;
#[cfg(not(target_os = "windows"))]
use std::net::{TcpStream, ToSocketAddrs};
#[cfg(target_os = "windows")]
use std::ptr::{null, null_mut};
#[cfg(not(target_os = "windows"))]
use std::time::Duration;
#[cfg(target_os = "windows")]
use windows_sys::Win32::Networking::WinHttp::{
    WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY, WINHTTP_FLAG_SECURE, WINHTTP_QUERY_FLAG_NUMBER,
    WINHTTP_QUERY_STATUS_CODE, WinHttpCloseHandle, WinHttpConnect, WinHttpOpen, WinHttpOpenRequest,
    WinHttpQueryHeaders, WinHttpReceiveResponse, WinHttpSendRequest,
};

const DEFAULT_HTTPS_PORT: u16 = 443;

pub fn https_url_available(url: &str) -> bool {
    if !url.starts_with("https://") {
        return false;
    }
    https_head_status(url)
        .map(|status| (200..400).contains(&status))
        .unwrap_or(false)
}

#[cfg(target_os = "windows")]
fn https_head_status(url: &str) -> Result<u32, String> {
    let mut request = open_https_request(url, "HEAD")?;
    request.send()?;
    request.status_code()
}

#[cfg(not(target_os = "windows"))]
fn https_head_status(url: &str) -> Result<u32, String> {
    let parsed = parse_https_url(url)?;
    let addresses = (parsed.host.as_str(), parsed.port)
        .to_socket_addrs()
        .map_err(|error| format!("HTTPS DNS lookup failed: {error}"))?;
    for address in addresses {
        if TcpStream::connect_timeout(&address, Duration::from_secs(4)).is_ok() {
            return Ok(204);
        }
    }
    Err("HTTPS host is unreachable.".to_string())
}

#[cfg(target_os = "windows")]
struct WinHttpRequest {
    session: *mut core::ffi::c_void,
    connection: *mut core::ffi::c_void,
    request: *mut core::ffi::c_void,
}

#[cfg(target_os = "windows")]
impl WinHttpRequest {
    fn send(&mut self) -> Result<(), String> {
        unsafe {
            if WinHttpSendRequest(self.request, null(), 0, null(), 0, 0, 0) == 0 {
                return Err(format!(
                    "HTTPS request failed: {}",
                    io::Error::last_os_error()
                ));
            }
            if WinHttpReceiveResponse(self.request, null_mut()) == 0 {
                return Err(format!(
                    "HTTPS response failed: {}",
                    io::Error::last_os_error()
                ));
            }
        }
        Ok(())
    }

    fn status_code(&self) -> Result<u32, String> {
        query_header_number(
            self.request,
            WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
        )
    }
}

#[cfg(target_os = "windows")]
impl Drop for WinHttpRequest {
    fn drop(&mut self) {
        unsafe {
            if !self.request.is_null() {
                WinHttpCloseHandle(self.request);
            }
            if !self.connection.is_null() {
                WinHttpCloseHandle(self.connection);
            }
            if !self.session.is_null() {
                WinHttpCloseHandle(self.session);
            }
        }
    }
}

#[cfg(target_os = "windows")]
fn open_https_request(url: &str, method: &str) -> Result<WinHttpRequest, String> {
    let parsed = parse_https_url(url)?;
    let agent = wide_null("Multi-Converter");
    let host = wide_null(&parsed.host);
    let path = wide_null(&parsed.path);
    let verb = wide_null(method);
    unsafe {
        let session = WinHttpOpen(
            agent.as_ptr(),
            WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY,
            null(),
            null(),
            0,
        );
        if session.is_null() {
            return Err(format!(
                "HTTPS session failed: {}",
                io::Error::last_os_error()
            ));
        }
        let connection = WinHttpConnect(session, host.as_ptr(), parsed.port, 0);
        if connection.is_null() {
            WinHttpCloseHandle(session);
            return Err(format!(
                "HTTPS connection failed: {}",
                io::Error::last_os_error()
            ));
        }
        let request = WinHttpOpenRequest(
            connection,
            verb.as_ptr(),
            path.as_ptr(),
            null(),
            null(),
            null(),
            WINHTTP_FLAG_SECURE,
        );
        if request.is_null() {
            WinHttpCloseHandle(connection);
            WinHttpCloseHandle(session);
            return Err(format!(
                "HTTPS request failed: {}",
                io::Error::last_os_error()
            ));
        }
        Ok(WinHttpRequest {
            session,
            connection,
            request,
        })
    }
}

#[cfg(target_os = "windows")]
fn query_header_number(handle: *mut core::ffi::c_void, query: u32) -> Result<u32, String> {
    let mut value = 0u32;
    let mut len = std::mem::size_of::<u32>() as u32;
    let mut index = 0u32;
    unsafe {
        if WinHttpQueryHeaders(
            handle,
            query,
            null(),
            (&mut value as *mut u32).cast(),
            &mut len,
            &mut index,
        ) == 0
        {
            return Err(format!(
                "HTTPS header query failed: {}",
                io::Error::last_os_error()
            ));
        }
    }
    Ok(value)
}

#[cfg(target_os = "windows")]
struct ParsedHttpsUrl {
    host: String,
    port: u16,
    path: String,
}

#[cfg(not(target_os = "windows"))]
struct ParsedHttpsUrl {
    host: String,
    port: u16,
}

fn parse_https_url(url: &str) -> Result<ParsedHttpsUrl, String> {
    let rest = url
        .strip_prefix("https://")
        .ok_or_else(|| "Only HTTPS engine download URLs are supported.".to_string())?;
    let (host_port, path) = rest
        .split_once('/')
        .map(|(host, path)| (host, format!("/{path}")))
        .unwrap_or((rest, "/".to_string()));
    if host_port.is_empty() || host_port.contains('@') {
        return Err("Invalid HTTPS engine download URL.".to_string());
    }
    let (host, port) = if let Some((host, port)) = host_port.rsplit_once(':') {
        (
            host.to_string(),
            port.parse::<u16>()
                .map_err(|_| "Invalid HTTPS engine download port.".to_string())?,
        )
    } else {
        (host_port.to_string(), DEFAULT_HTTPS_PORT)
    };
    if host.is_empty() {
        return Err("Invalid HTTPS engine download host.".to_string());
    }
    #[cfg(not(target_os = "windows"))]
    let _ = path;
    Ok(ParsedHttpsUrl {
        host,
        port,
        #[cfg(target_os = "windows")]
        path,
    })
}

#[cfg(target_os = "windows")]
fn wide_null(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

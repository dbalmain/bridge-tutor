use std::env;
use std::panic::{catch_unwind, AssertUnwindSafe};

use serde::Deserialize;
use serde_json::Value;
use tiny_http::{Header, Method, Response, Server, StatusCode};

fn json_header() -> Header {
    Header::from_bytes(
        &b"Content-Type"[..],
        &b"application/json; charset=utf-8"[..],
    )
    .expect("valid header")
}

fn cors_header() -> Header {
    Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).expect("valid header")
}

fn respond(request: tiny_http::Request, status: u16, body: String) {
    let mut response = Response::from_string(body)
        .with_status_code(StatusCode(status))
        .with_header(json_header())
        .with_header(cors_header());
    if request.method() == &Method::Options {
        response = response
            .with_header(
                Header::from_bytes(
                    &b"Access-Control-Allow-Methods"[..],
                    &b"GET, POST, OPTIONS"[..],
                )
                .expect("valid header"),
            )
            .with_header(
                Header::from_bytes(&b"Access-Control-Allow-Headers"[..], &b"Content-Type"[..])
                    .expect("valid header"),
            );
    }
    let _ = request.respond(response);
}

fn path_of(url: &str) -> &str {
    url.split('?').next().unwrap_or(url)
}

fn progress_from(v: &Value) -> String {
    match v.get("progress") {
        Some(Value::String(s)) => s.clone(),
        Some(obj) => obj.to_string(),
        None => "{}".into(),
    }
}

fn family_from(v: &Value) -> String {
    v.get("family")
        .and_then(Value::as_str)
        .unwrap_or("all")
        .to_string()
}

fn leaves_from(v: &Value) -> Vec<String> {
    v.get("leaves")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(|x| x.as_str().map(str::to_string))
                .filter(|s| !s.is_empty())
                .collect()
        })
        .unwrap_or_default()
}

fn seed_from(v: &Value) -> u32 {
    v.get("seed")
        .and_then(Value::as_u64)
        .map(|n| n as u32)
        .unwrap_or(1)
}

fn is_error_json(s: &str) -> bool {
    serde_json::from_str::<Value>(s)
        .ok()
        .and_then(|v| v.get("error").map(|_| ()))
        .is_some()
}

#[derive(Deserialize)]
struct ApplyBody {
    leaf_id: Option<String>,
    correct: Option<bool>,
}

pub fn serve() {
    let port = env::var("SYSTEM_PORT").unwrap_or_else(|_| "8788".into());
    let addr = format!("127.0.0.1:{port}");
    let server = Server::http(&addr).unwrap_or_else(|e| {
        eprintln!("bridge-system: cannot bind {addr}: {e}");
        std::process::exit(1);
    });
    eprintln!("bridge-system listening on http://{addr}");

    for mut request in server.incoming_requests() {
        let method = request.method().clone();
        let url = request.url().to_string();
        let path = path_of(&url);

        if method == Method::Options {
            respond(request, 204, String::new());
            continue;
        }

        let body = if method == Method::Post {
            std::io::read_to_string(request.as_reader()).unwrap_or_default()
        } else {
            String::new()
        };

        let outcome = catch_unwind(AssertUnwindSafe(|| dispatch(&method, path, &body)));
        match outcome {
            Ok((status, json)) => respond(request, status, json),
            Err(_) => {
                eprintln!("bridge-system: handler panicked on {path}");
                respond(request, 500, r#"{"error":"internal error"}"#.into());
            }
        }
    }
}

fn dispatch(method: &Method, path: &str, body: &str) -> (u16, String) {
    let payload: Value = serde_json::from_str(body).unwrap_or(Value::Null);
    let route = path.strip_prefix("/api/system").unwrap_or(path);

    match (method, route) {
        (&Method::Get, "/health" | "/health/") => (
            200,
            serde_json::json!({ "ok": true, "system": crate::system::SYSTEM_ID }).to_string(),
        ),
        (&Method::Get, "/catalog" | "/catalog/") => (200, crate::api::catalog_json()),
        (&Method::Post, "/next-drill" | "/next-drill/") => {
            let json = crate::api::next_drill_json(
                &progress_from(&payload),
                seed_from(&payload),
                &family_from(&payload),
                &leaves_from(&payload),
            );
            let status = if is_error_json(&json) { 400 } else { 200 };
            (status, json)
        }
        (&Method::Post, "/apply" | "/apply/" | "/apply-result" | "/apply-result/") => {
            let parsed: ApplyBody = serde_json::from_value(payload.clone()).unwrap_or(ApplyBody {
                leaf_id: None,
                correct: None,
            });
            let Some(leaf_id) = parsed.leaf_id.filter(|s| !s.is_empty()) else {
                return (400, r#"{"error":"missing leaf_id"}"#.into());
            };
            let json = crate::api::apply_result_json(
                &progress_from(&payload),
                &leaf_id,
                parsed.correct.unwrap_or(false),
            );
            let status = if is_error_json(&json) { 400 } else { 200 };
            (status, json)
        }
        (&Method::Post, "/weights" | "/weights/") => (
            200,
            crate::api::weights_json(&progress_from(&payload), &family_from(&payload)),
        ),
        (&Method::Post, "/decide" | "/decide/") => {
            let json = crate::api::decide_json(body, "[]");
            let status = if is_error_json(&json) { 400 } else { 200 };
            (status, json)
        }
        _ => (
            404,
            serde_json::json!({ "error": format!("no route {path}") }).to_string(),
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;
    use tiny_http::Method;

    #[test]
    fn health_and_catalog_and_404() {
        let (st, body) = dispatch(&Method::Get, "/api/system/health", "");
        assert_eq!(st, 200);
        let v: Value = serde_json::from_str(&body).unwrap();
        assert_eq!(v["ok"], true);

        let (st, body) = dispatch(&Method::Get, "/catalog", "");
        assert_eq!(st, 200);
        let v: Value = serde_json::from_str(&body).unwrap();
        assert!(v["leaves"].as_array().unwrap().len() > 20);

        let (st, body) = dispatch(&Method::Get, "/nope", "");
        assert_eq!(st, 404);
        let v: Value = serde_json::from_str(&body).unwrap();
        assert!(v["error"].as_str().unwrap().contains("nope"));
    }

    #[test]
    fn decide_route_uses_the_tree() {
        let body = serde_json::json!({
            "cards": ["SA","SJ","S2","HA","H8","H3","DA","D9","D8","D4","CA","C7","C6"],
            "dealer": "N",
            "auction": ["1D","Pass"]
        })
        .to_string();
        let (st, json) = dispatch(&Method::Post, "/api/system/decide", &body);
        assert_eq!(st, 200);
        let v: Value = serde_json::from_str(&json).unwrap();
        assert_eq!(v["bid"], "3NT");
    }

    #[test]
    fn apply_requires_leaf_id() {
        let (st, json) = dispatch(&Method::Post, "/apply", "{}");
        assert_eq!(st, 400);
        let v: Value = serde_json::from_str(&json).unwrap();
        assert!(v["error"].as_str().unwrap().contains("leaf_id"));
    }
}

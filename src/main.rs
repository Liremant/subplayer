mod library;
mod mp4;
mod posters;
mod store;

use axum::extract::{Query, State};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;
use std::path::PathBuf;
use std::sync::Arc;
use tower_http::services::{ServeDir, ServeFile};

struct AppState {
    media: PathBuf,
    poster_dir: PathBuf,
    store: store::Store,
    http: reqwest::Client,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProgressInput {
    id: String,
    t: f64,
    #[serde(default)]
    dur: f64,
    #[serde(default)]
    shift: Option<f64>,
}

#[derive(Deserialize)]
struct PosterSearch {
    kind: String,
    q: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PosterPick {
    kind: String,
    /// Series slug or movie folder id — decides the poster file name.
    id: String,
    url: String,
}

#[tokio::main]
async fn main() {
    let media = PathBuf::from(env_or("SUBPLAYER_MEDIA", "media"));
    let data = PathBuf::from(env_or("SUBPLAYER_DATA", "data"));
    let dist = PathBuf::from(env_or("SUBPLAYER_DIST", "web/dist"));
    let port: u16 = env_or("SUBPLAYER_PORT", "3000").parse().unwrap_or(3000);

    std::fs::create_dir_all(&data).ok();
    let poster_dir = posters::dir(&data);
    let state = Arc::new(AppState {
        media: media.clone(),
        poster_dir: poster_dir.clone(),
        store: store::Store::new(&data),
        http: reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .user_agent("subplayer/0.1 (personal media library)")
            .build()
            .expect("http client"),
    });

    let index = dist.join("index.html");
    let app = Router::new()
        .route("/api/library", get(get_library))
        .route("/api/settings", get(get_settings).put(put_settings))
        .route("/api/progress", post(post_progress))
        .route("/api/posters/search", get(search_posters))
        .route("/api/posters", post(pick_poster))
        .nest_service("/media", ServeDir::new(&media))
        .nest_service("/posters", ServeDir::new(&poster_dir))
        .fallback_service(ServeDir::new(&dist).fallback(ServeFile::new(&index)))
        .with_state(state);

    // A missing bundle looks like a broken server, not an unbuilt frontend — say so.
    if !index.is_file() {
        eprintln!(
            "warning: {} not found — the UI will 404.\n         build it first: cd web && pnpm install && pnpm build",
            index.display()
        );
    }
    if !media.is_dir() {
        eprintln!(
            "warning: media folder {} does not exist — the catalog will be empty",
            media.display()
        );
    }

    let addr = format!("127.0.0.1:{port}");
    let listener = match tokio::net::TcpListener::bind(&addr).await {
        Ok(listener) => listener,
        Err(e) if e.kind() == std::io::ErrorKind::AddrInUse => {
            eprintln!("error: {addr} is already in use — another subplayer is running, or set SUBPLAYER_PORT");
            std::process::exit(1);
        }
        Err(e) => {
            eprintln!("error: cannot bind {addr}: {e}");
            std::process::exit(1);
        }
    };
    println!("subplayer on http://{addr}  (media: {})", media.display());
    axum::serve(listener, app).await.unwrap();
}

/// The catalog: movies and series, each episode carrying its saved position.
async fn get_library(State(st): State<Arc<AppState>>) -> Json<library::Library> {
    let media = st.media.clone();
    let poster_dir = st.poster_dir.clone();
    let mut lib = tokio::task::spawn_blocking(move || library::scan(&media, &poster_dir))
        .await
        .unwrap_or_default();
    let progress = st.store.progress();

    let mut attach = |item: &mut library::Item| item.progress = progress.get(&item.id).cloned();
    lib.movies.iter_mut().for_each(&mut attach);
    for series in &mut lib.series {
        series.episodes.iter_mut().for_each(&mut attach);
    }
    Json(lib)
}

async fn get_settings(State(st): State<Arc<AppState>>) -> Json<store::Settings> {
    Json(st.store.settings())
}

async fn put_settings(
    State(st): State<Arc<AppState>>,
    Json(settings): Json<store::Settings>,
) -> Json<store::Settings> {
    Json(st.store.save_settings(settings))
}

async fn post_progress(
    State(st): State<Arc<AppState>>,
    Json(input): Json<ProgressInput>,
) -> Json<serde_json::Value> {
    st.store.save_progress(
        &input.id,
        store::Progress {
            t: input.t,
            dur: input.dur,
            shift: input.shift,
            updated: 0,
        },
    );
    Json(serde_json::json!({ "ok": true }))
}

async fn search_posters(
    State(st): State<Arc<AppState>>,
    Query(q): Query<PosterSearch>,
) -> Json<serde_json::Value> {
    let found = posters::search(&st.http, &q.kind, &q.q).await;
    Json(serde_json::json!({ "candidates": found }))
}

/// Downloads the chosen poster so the library keeps working offline.
async fn pick_poster(
    State(st): State<Arc<AppState>>,
    Json(pick): Json<PosterPick>,
) -> Json<serde_json::Value> {
    let slug = if pick.kind == "series" {
        pick.id.clone()
    } else {
        posters::slug(pick.id.rsplit('/').next().unwrap_or(&pick.id))
    };
    match posters::download(&st.http, &st.poster_dir, &slug, &pick.url).await {
        Some(name) => Json(serde_json::json!({ "poster": format!("/posters/{name}") })),
        None => Json(serde_json::json!({ "poster": null, "error": "не удалось скачать картинку" })),
    }
}

fn env_or(key: &str, default: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| default.to_string())
}

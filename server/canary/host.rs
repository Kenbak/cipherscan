// SPDX-License-Identifier: AGPL-3.0-only
//! Conventional-host launcher for pinned upstream Canary (not an enclave).
//! Only paths, stable credential loading, loopback binding and shutdown differ.
use std::{future::IntoFuture as _, path::PathBuf};
use canaryd::{api::router, runtime::{IdentitySource, Runtime, RuntimeOptions}};
use tokio_util::sync::CancellationToken;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let config_path = PathBuf::from(std::env::var("CANARY_CONFIG")?);
    let state = PathBuf::from(std::env::var("CANARY_STATE")?);
    let credential = PathBuf::from(std::env::var("CREDENTIALS_DIRECTORY")?).join("seed");
    let seed = zeroize::Zeroizing::new(std::fs::read_to_string(credential)?);
    let runtime = Runtime::initialize(RuntimeOptions {
        config_path, database_path: state.join("canary.sqlite3"),
        metadata_path: state.join("metadata.json"),
        identity_source: IdentitySource::Stable(seed),
    }).await?;
    let listener = tokio::net::TcpListener::bind("127.0.0.1:3187").await?;
    let cancellation = CancellationToken::new();
    let signal = cancellation.clone();
    tokio::spawn(async move {
        let mut term = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()).expect("SIGTERM handler");
        tokio::select! { _ = term.recv() => {}, _ = tokio::signal::ctrl_c() => {} }
        signal.cancel();
    });
    let monitor = runtime.clone();
    let token = cancellation.clone();
    let mut task = tokio::spawn(async move { monitor.run_until_cancelled(token).await });
    let server = axum::serve(listener, router(runtime.api_state()))
        .with_graceful_shutdown(cancellation.clone().cancelled_owned()).into_future();
    tokio::pin!(server);
    tokio::select! {
        result = &mut task => { cancellation.cancel(); server.await?; result??; }
        result = &mut server => { cancellation.cancel(); result?; task.await??; }
    }
    Ok(())
}

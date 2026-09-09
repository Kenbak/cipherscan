//! Evaluation adapter only: the upstream runtime and router, with local paths,
//! loopback-only HTTP, an ephemeral identity, and a bounded lifetime.
use std::{path::PathBuf, time::Duration};
use canaryd::{api::router, runtime::{IdentitySource, Runtime, RuntimeOptions}};
use tokio_util::sync::CancellationToken;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let mut args = std::env::args().skip(1);
    let config_path = PathBuf::from(args.next().expect("config path"));
    let state_dir = PathBuf::from(args.next().expect("state directory"));
    let port: u16 = args.next().expect("loopback port").parse()?;
    let seconds: u64 = args.next().expect("duration seconds").parse()?;
    anyhow::ensure!(args.next().is_none() && (30..=600).contains(&seconds), "duration must be 30..600 seconds");
    let runtime = Runtime::initialize(RuntimeOptions {
        config_path,
        database_path: state_dir.join("canary.sqlite3"),
        metadata_path: state_dir.join("metadata.json"),
        identity_source: IdentitySource::Ephemeral,
    }).await?;
    let listener = tokio::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, port)).await?;
    let stop = CancellationToken::new();
    let monitor = runtime.clone();
    let monitor_stop = stop.clone();
    let mut monitor_task = tokio::spawn(async move { monitor.run_until_cancelled(monitor_stop).await });
    let server = axum::serve(listener, router(runtime.api_state()))
        .with_graceful_shutdown(stop.clone().cancelled_owned()).into_future();
    use std::future::IntoFuture;
    tokio::pin!(server);
    println!("Evaluation only: http://127.0.0.1:{port}; ephemeral keys; stops after {seconds}s");
    tokio::select! {
        result = &mut monitor_task => { stop.cancel(); server.await?; result??; }
        result = &mut server => { stop.cancel(); result?; monitor_task.await??; }
        _ = tokio::time::sleep(Duration::from_secs(seconds)) => {
            stop.cancel(); server.await?; monitor_task.await??;
        }
        _ = tokio::signal::ctrl_c() => { stop.cancel(); server.await?; monitor_task.await??; }
    }
    Ok(())
}

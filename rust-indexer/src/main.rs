//! CipherScan Rust Indexer
//!
//! Fast indexer that reads directly from Zebra's RocksDB state database.
//! ~100-1000x faster than JSON-RPC for backfills.
//!
//! Usage:
//!   cargo run --release
//!   cargo run --release -- --backfill
//!   cargo run --release -- --live

use rocksdb::{DB, Options, IteratorMode};
use std::path::Path;
use std::time::Instant;

// Zebra state path (adjust for your setup)
const ZEBRA_STATE_PATH: &str = "/root/.cache/zebra/state/v27/mainnet";

// PostgreSQL connection (from environment)
// const DATABASE_URL: &str = "postgres://zcash_user:password@localhost/zcash_explorer_mainnet";

fn main() {
    println!("════════════════════════════════════════════════════════════");
    println!("🚀 CipherScan Rust Indexer v0.1.0");
    println!("════════════════════════════════════════════════════════════");
    
    // Check if Zebra state exists
    let state_path = Path::new(ZEBRA_STATE_PATH);
    if !state_path.exists() {
        eprintln!("❌ Zebra state not found at: {}", ZEBRA_STATE_PATH);
        eprintln!("   Make sure Zebra is running and synced.");
        std::process::exit(1);
    }
    
    println!("📂 Zebra state path: {}", ZEBRA_STATE_PATH);
    
    // Open RocksDB in read-only mode
    let mut opts = Options::default();
    opts.set_error_if_exists(false);
    opts.create_if_missing(false);
    
    println!("🔓 Opening RocksDB (read-only)...");
    let start = Instant::now();
    
    match DB::open_for_read_only(&opts, ZEBRA_STATE_PATH, false) {
        Ok(db) => {
            let elapsed = start.elapsed();
            println!("✅ RocksDB opened in {:?}", elapsed);
            
            // Get some stats
            analyze_database(&db);
        }
        Err(e) => {
            eprintln!("❌ Failed to open RocksDB: {}", e);
            eprintln!("");
            eprintln!("Possible causes:");
            eprintln!("  1. Zebra is using the DB exclusively");
            eprintln!("  2. Wrong path");
            eprintln!("  3. Permissions issue");
            std::process::exit(1);
        }
    }
}

/// Analyze the database structure
fn analyze_database(db: &DB) {
    println!("");
    println!("📊 Analyzing database structure...");
    println!("────────────────────────────────────────────────────────────");
    
    // Count entries by prefix
    let mut prefix_counts: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    let mut total_entries = 0;
    let mut sample_keys: Vec<String> = Vec::new();
    
    let start = Instant::now();
    let iter = db.iterator(IteratorMode::Start);
    
    for item in iter {
        match item {
            Ok((key, _value)) => {
                total_entries += 1;
                
                // Get first few bytes as prefix identifier
                if key.len() >= 4 {
                    let prefix = hex::encode(&key[0..4]);
                    *prefix_counts.entry(prefix.clone()).or_insert(0) += 1;
                    
                    // Save first few samples of each prefix
                    if sample_keys.len() < 20 && !sample_keys.iter().any(|s| s.starts_with(&prefix)) {
                        sample_keys.push(format!("{}: {} bytes", hex::encode(&key[..std::cmp::min(16, key.len())]), key.len()));
                    }
                }
                
                // Progress every 1M entries
                if total_entries % 1_000_000 == 0 {
                    let elapsed = start.elapsed();
                    let rate = total_entries as f64 / elapsed.as_secs_f64();
                    println!("   Scanned {} entries ({:.0} entries/sec)...", total_entries, rate);
                }
                
                // Stop after 10M entries for this test
                if total_entries >= 10_000_000 {
                    println!("   (stopped at 10M entries for quick analysis)");
                    break;
                }
            }
            Err(e) => {
                eprintln!("   Error reading entry: {}", e);
                break;
            }
        }
    }
    
    let elapsed = start.elapsed();
    let rate = total_entries as f64 / elapsed.as_secs_f64();
    
    println!("");
    println!("📈 Results:");
    println!("   Total entries scanned: {}", total_entries);
    println!("   Time: {:?}", elapsed);
    println!("   Rate: {:.0} entries/sec", rate);
    println!("");
    
    println!("🔑 Key prefixes found (first 4 bytes → count):");
    let mut sorted_prefixes: Vec<_> = prefix_counts.iter().collect();
    sorted_prefixes.sort_by(|a, b| b.1.cmp(a.1));
    
    for (prefix, count) in sorted_prefixes.iter().take(15) {
        let percent = (*count as f64 / total_entries as f64) * 100.0;
        println!("   {} → {:>8} ({:.1}%)", prefix, count, percent);
    }
    
    println!("");
    println!("🔍 Sample keys:");
    for key in sample_keys.iter().take(10) {
        println!("   {}", key);
    }
    
    println!("");
    println!("════════════════════════════════════════════════════════════");
    println!("✅ Database analysis complete!");
    println!("");
    println!("Next steps:");
    println!("  1. Identify key prefixes (blocks, transactions, UTXOs, etc.)");
    println!("  2. Implement parsing for each type");
    println!("  3. Write to PostgreSQL");
    println!("════════════════════════════════════════════════════════════");
}

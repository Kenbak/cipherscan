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

// Known Zebra column families (from Zebra source code)
const COLUMN_FAMILIES: &[&str] = &[
    "default",
    "hash_by_height",
    "height_by_hash",
    "block_header_by_height",
    "tx_loc_by_hash",
    "utxo_by_outpoint",
    "sprout_nullifiers",
    "sapling_nullifiers",
    "orchard_nullifiers",
    "sprout_anchors",
    "sapling_anchors",
    "orchard_anchors",
    "sprout_note_commitment_tree",
    "sapling_note_commitment_tree",
    "orchard_note_commitment_tree",
    "history_tree",
    "tip_chain_value_pool",
];

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

    // First, list column families
    println!("🔍 Listing column families...");
    match DB::list_cf(&Options::default(), ZEBRA_STATE_PATH) {
        Ok(cfs) => {
            println!("   Found {} column families:", cfs.len());
            for cf in &cfs {
                println!("      - {}", cf);
            }
        }
        Err(e) => {
            println!("   Could not list CFs: {}", e);
        }
    }

    // Open RocksDB with column families
    let mut opts = Options::default();
    opts.set_error_if_exists(false);
    opts.create_if_missing(false);
    opts.set_max_open_files(256);  // Limit open files to avoid "Too many open files"

    println!("\n🔓 Opening RocksDB with column families (read-only)...");
    let start = Instant::now();

    // Get actual column families from the database
    let cf_names = match DB::list_cf(&Options::default(), ZEBRA_STATE_PATH) {
        Ok(cfs) => cfs,
        Err(_) => COLUMN_FAMILIES.iter().map(|s| s.to_string()).collect(),
    };

    match DB::open_cf_for_read_only(&opts, ZEBRA_STATE_PATH, &cf_names, false) {
        Ok(db) => {
            let elapsed = start.elapsed();
            println!("✅ RocksDB opened in {:?}", elapsed);

            // Get some stats
            analyze_database_cf(&db, &cf_names);
        }
        Err(e) => {
            eprintln!("❌ Failed to open RocksDB: {}", e);
            eprintln!("");
            eprintln!("Trying without column families...");

            // Fallback: open without CFs
            match DB::open_for_read_only(&opts, ZEBRA_STATE_PATH, false) {
                Ok(db) => {
                    println!("✅ Opened without CFs");
                    analyze_database(&db);
                }
                Err(e2) => {
                    eprintln!("❌ Also failed: {}", e2);
                    std::process::exit(1);
                }
            }
        }
    }
}

/// Analyze database with column families
fn analyze_database_cf(db: &DB, cf_names: &[String]) {
    println!("");
    println!("📊 Analyzing column families...");
    println!("────────────────────────────────────────────────────────────");

    for cf_name in cf_names {
        if let Some(cf) = db.cf_handle(cf_name.as_str()) {
            let iter = db.iterator_cf(cf, IteratorMode::Start);
            let mut count = 0;
            let mut sample_key: Option<String> = None;

            for item in iter {
                match item {
                    Ok((key, _value)) => {
                        count += 1;
                        if sample_key.is_none() && key.len() > 0 {
                            sample_key = Some(hex::encode(&key[..std::cmp::min(32, key.len())]));
                        }
                        if count >= 100000 {
                            break; // Sample first 100k per CF
                        }
                    }
                    Err(_) => break,
                }
            }

            let sample = sample_key.unwrap_or_else(|| "N/A".to_string());
            if count > 0 {
                println!("   ✅ {:30} → {:>7} entries (sample: {}...)", cf_name, count, &sample[..std::cmp::min(16, sample.len())]);
            } else {
                println!("   ⬚ {:30} → empty", cf_name);
            }
        } else {
            println!("   ❌ {:30} → not found", cf_name);
        }
    }

    println!("");

    // Decode some entries from hash_by_height
    decode_blocks(db);

    println!("════════════════════════════════════════════════════════════");
    println!("✅ Column family analysis complete!");
    println!("════════════════════════════════════════════════════════════");
}

/// Decode blocks from hash_by_height column family
fn decode_blocks(db: &DB) {
    println!("════════════════════════════════════════════════════════════");
    println!("🔍 Decoding blocks from hash_by_height...");
    println!("────────────────────────────────────────────────────────────");

    if let Some(cf) = db.cf_handle("hash_by_height") {
        println!("   ✅ Got CF handle");
        
        let iter = db.iterator_cf(cf, IteratorMode::Start);
        let mut count = 0;
        let mut last_height = 0u32;

        for item in iter {
            match item {
                Ok((key, value)) => {
                    // Debug: show first few raw entries
                    if count < 3 {
                        println!("   Raw entry {}: key={} ({} bytes), value={} ({} bytes)",
                            count,
                            hex::encode(&key[..std::cmp::min(8, key.len())]),
                            key.len(),
                            hex::encode(&value[..std::cmp::min(8, value.len())]),
                            value.len()
                        );
                    }
                    
                    // Key = height (4 bytes, little-endian in Zebra)
                    // Value = block hash (32 bytes)
                    if key.len() >= 4 && value.len() >= 32 {
                        let height = u32::from_le_bytes(key[0..4].try_into().unwrap());

                        // Reverse the hash for display (Zcash uses reversed byte order)
                        let mut hash_bytes = value[0..32].to_vec();
                        hash_bytes.reverse();
                        let hash = hex::encode(&hash_bytes);

                        // Show first 5 blocks
                        if count < 8 {
                            println!("   Block {:>7}: {}", height, hash);
                        } else if count == 8 {
                            println!("   ...");
                        }

                        last_height = height;
                    }
                    
                    count += 1;
                    
                    // Stop after 1 million to avoid long wait
                    if count >= 1_000_000 {
                        println!("   (stopped at 1M entries)");
                        break;
                    }
                }
                Err(e) => {
                    println!("   ❌ Error: {}", e);
                    break;
                }
            }
        }

        println!("");
        println!("   📊 Total entries scanned: {}", count);
        println!("   📈 Last height seen: {}", last_height);
    } else {
        println!("   ❌ hash_by_height CF handle not found");
    }
    println!("");
}

/// Analyze the database structure (fallback without CFs)
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
        let percent = (**count as f64 / total_entries as f64) * 100.0;
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

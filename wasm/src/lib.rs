use wasm_bindgen::prelude::*;

// 🎯 OFFICIAL 3-CRATE SOLUTION (zcash_primitives 0.25 + orchard 0.11)
use zcash_note_encryption::{try_note_decryption, Domain, ShieldedOutput};
use orchard::{
    keys::{FullViewingKey, Scope, PreparedIncomingViewingKey},
    note_encryption::OrchardDomain,
};
use zcash_address::unified::{Container, Encoding, Fvk, Ufvk};

// Use zcash_primitives for transaction parsing
use zcash_primitives::transaction::Transaction;
use std::io::Cursor;

// For JSON serialization
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize)]
pub struct DecryptedOutput {
    pub memo: String,
    pub amount: f64, // Amount in ZEC
}

#[cfg(feature = "wee_alloc")]
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

#[wasm_bindgen(start)]
pub fn main() {
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
}

#[wasm_bindgen]
pub fn test_wasm() -> String {
    "WASM module loaded successfully".to_string()
}

#[wasm_bindgen]
pub fn detect_key_type(viewing_key: &str) -> String {
    if viewing_key.starts_with("uviewtest") {
        "ufvk-testnet".to_string()
    } else if viewing_key.starts_with("uview") {
        "ufvk-mainnet".to_string()
    } else {
        "unknown".to_string()
    }
}

/// Orchard memo decryption - The Official Way™
#[wasm_bindgen]
pub fn decrypt_memo(tx_hex: &str, viewing_key: &str) -> Result<String, String> {
    // Step 1: Parse UFVK
    let (_network, ufvk) = Ufvk::decode(viewing_key)
        .map_err(|e| format!("UFVK decode failed: {:?}", e))?;

    // Step 2: Extract Orchard FVK
    let orchard_fvk_bytes = ufvk.items().iter().find_map(|fvk| {
        match fvk {
            Fvk::Orchard(data) => Some(data.clone()),
            _ => None,
        }
    }).ok_or("No Orchard FVK found in UFVK")?;

    // Step 3: Parse FullViewingKey
    let fvk = FullViewingKey::from_bytes(&orchard_fvk_bytes)
        .ok_or("FVK parse failed")?;

    // Step 4: Parse transaction with zcash_primitives
    let tx_bytes = hex::decode(tx_hex)
        .map_err(|e| format!("Hex decode failed: {:?}", e))?;

    let mut cursor = Cursor::new(&tx_bytes[..]);
    let tx = Transaction::read(&mut cursor, zcash_primitives::consensus::BranchId::Nu5)
        .map_err(|e| format!("TX parse: {:?}", e))?;

    // Step 5: Get Orchard actions
    let orchard_actions = match tx.orchard_bundle() {
        Some(bundle) => {
            let actions: Vec<_> = bundle.actions().iter().collect();
            actions
        },
        None => {
            return Err("No Orchard bundle in transaction".to_string());
        }
    };

    // Step 6: Try to decrypt all actions and collect valid outputs (memo + amount)
    let mut found_outputs = Vec::new();

    for action in orchard_actions.iter() {
        // Create domain for THIS specific action
        let domain = OrchardDomain::for_action(*action);

        // Try both External and Internal scopes
        for scope in [Scope::External, Scope::Internal] {
            let ivk = fvk.to_ivk(scope);
            let prepared_ivk = PreparedIncomingViewingKey::new(&ivk);

            if let Some((note, _recipient, memo)) = try_note_decryption(&domain, &prepared_ivk, *action) {
                let memo_bytes = memo.as_slice();
                let memo_len = memo_bytes.iter().position(|&b| b == 0).unwrap_or(memo_bytes.len());

                // Skip empty memos
                if memo_len == 0 {
                    continue;
                }

                // Validate UTF-8 and skip invalid text
                if let Ok(memo_text) = String::from_utf8(memo_bytes[..memo_len].to_vec()) {
                    // Skip if memo is only whitespace
                    if !memo_text.trim().is_empty() {
                        // Extract amount from note (in zatoshis, convert to ZEC)
                        let amount_zatoshis = note.value().inner();
                        let amount_zec = amount_zatoshis as f64 / 100_000_000.0;

                        found_outputs.push(DecryptedOutput {
                            memo: memo_text,
                            amount: amount_zec,
                        });
                    }
                }
            }
        }
    }

    // Return the first valid output found as JSON
    if let Some(output) = found_outputs.first() {
        serde_json::to_string(output)
            .map_err(|e| format!("JSON serialization failed: {:?}", e))
    } else {
        Err("No memo found or viewing key doesn't match any outputs.".to_string())
    }
}

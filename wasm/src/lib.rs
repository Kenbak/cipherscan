use wasm_bindgen::prelude::*;

// 🎯 OFFICIAL 3-CRATE SOLUTION (zcash_primitives 0.25 + orchard 0.11)
use zcash_note_encryption::{try_note_decryption, try_compact_note_decryption};
use orchard::{
    keys::{FullViewingKey, Scope, PreparedIncomingViewingKey},
    note_encryption::{OrchardDomain, CompactAction},
    note::ExtractedNoteCommitment,
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

/// Decrypt a compact block output (from Lightwalletd)
/// This is MUCH faster than decrypt_memo because it doesn't need the full TX
#[wasm_bindgen]
pub fn decrypt_compact_output(
    nullifier_hex: &str,
    cmu_hex: &str,
    ephemeral_key_hex: &str,
    ciphertext_hex: &str,
    viewing_key: &str,
) -> Result<String, String> {
    use web_sys::console;

    console::log_1(&format!("🔍 [WASM] Starting compact decryption...").into());
    console::log_1(&format!("  nullifier: {}...", &nullifier_hex[..16]).into());
    console::log_1(&format!("  cmx: {}...", &cmu_hex[..16]).into());
    console::log_1(&format!("  ephemeralKey: {}...", &ephemeral_key_hex[..16]).into());
    console::log_1(&format!("  ciphertext length: {} chars", ciphertext_hex.len()).into());

    // Step 1: Parse UFVK
    console::log_1(&"📝 [WASM] Parsing UFVK...".into());
    let (_network, ufvk) = Ufvk::decode(viewing_key)
        .map_err(|e| format!("UFVK decode failed: {:?}", e))?;
    console::log_1(&"✅ [WASM] UFVK parsed".into());

    // Step 2: Extract Orchard FVK
    console::log_1(&"📝 [WASM] Extracting Orchard FVK...".into());
    let orchard_fvk_bytes = ufvk.items().iter().find_map(|fvk| {
        match fvk {
            Fvk::Orchard(data) => Some(data.clone()),
            _ => None,
        }
    }).ok_or("No Orchard FVK found in UFVK")?;
    console::log_1(&format!("✅ [WASM] Orchard FVK extracted ({} bytes)", orchard_fvk_bytes.len()).into());

    // Step 3: Parse FullViewingKey
    console::log_1(&"📝 [WASM] Parsing FullViewingKey...".into());
    let fvk = FullViewingKey::from_bytes(&orchard_fvk_bytes)
        .ok_or("FVK parse failed")?;
    console::log_1(&"✅ [WASM] FullViewingKey parsed".into());

    // Step 4: Parse compact output data
    console::log_1(&"📝 [WASM] Decoding hex data...".into());
    let nullifier_bytes = hex::decode(nullifier_hex)
        .map_err(|e| format!("Nullifier hex decode failed: {:?}", e))?;
    let cmu_bytes = hex::decode(cmu_hex)
        .map_err(|e| format!("CMU hex decode failed: {:?}", e))?;
    let ephemeral_key_bytes = hex::decode(ephemeral_key_hex)
        .map_err(|e| format!("Ephemeral key hex decode failed: {:?}", e))?;
    let ciphertext_bytes = hex::decode(ciphertext_hex)
        .map_err(|e| format!("Ciphertext hex decode failed: {:?}", e))?;

    console::log_1(&format!("✅ [WASM] Hex decoded: nullifier={} bytes, cmu={} bytes, epk={} bytes, ct={} bytes",
        nullifier_bytes.len(), cmu_bytes.len(), ephemeral_key_bytes.len(), ciphertext_bytes.len()).into());

    // Step 5: Convert to proper types
    console::log_1(&"📝 [WASM] Converting to Orchard types...".into());
    let nullifier_array: [u8; 32] = nullifier_bytes.try_into().map_err(|_| "Invalid nullifier length")?;
    let nullifier = orchard::note::Nullifier::from_bytes(&nullifier_array)
        .into_option()
        .ok_or("Invalid nullifier")?;
    console::log_1(&"✅ [WASM] Nullifier parsed".into());

    let cmu_array: [u8; 32] = cmu_bytes.try_into().map_err(|_| "Invalid CMU length")?;
    let cmu = ExtractedNoteCommitment::from_bytes(&cmu_array)
        .into_option()
        .ok_or("Invalid CMU")?;
    console::log_1(&"✅ [WASM] CMU parsed".into());

    let ephemeral_key_array: [u8; 32] = ephemeral_key_bytes.try_into().map_err(|_| "Invalid ephemeral key length")?;
    console::log_1(&"✅ [WASM] Ephemeral key parsed".into());

    // Ciphertext should be 52 bytes for compact format
    if ciphertext_bytes.len() != 52 {
        return Err(format!("Invalid ciphertext length: expected 52, got {}", ciphertext_bytes.len()));
    }
    let ciphertext: [u8; 52] = ciphertext_bytes.try_into().unwrap();
    console::log_1(&"✅ [WASM] Ciphertext parsed (52 bytes)".into());

    // Step 6: Create CompactAction with real nullifier
    console::log_1(&"📝 [WASM] Creating CompactAction...".into());
    let compact_action = CompactAction::from_parts(
        nullifier,
        cmu,
        ephemeral_key_array.into(),
        ciphertext,
    );
    console::log_1(&"✅ [WASM] CompactAction created".into());

    // Step 7: Try to decrypt with both External and Internal scopes
    console::log_1(&"🔓 [WASM] Attempting decryption with External and Internal scopes...".into());
    for scope in [Scope::External, Scope::Internal] {
        let scope_name = match scope {
            Scope::External => "External",
            Scope::Internal => "Internal",
        };
        console::log_1(&format!("  Trying scope: {}", scope_name).into());

        let ivk = fvk.to_ivk(scope);
        let prepared_ivk = PreparedIncomingViewingKey::new(&ivk);

        // Create domain for this compact action
        let domain = OrchardDomain::for_compact_action(&compact_action);
        console::log_1(&format!("  Domain created for {}", scope_name).into());

        // Try compact note decryption
        console::log_1(&format!("  Calling try_compact_note_decryption for {}...", scope_name).into());
        if let Some((note, _recipient)) = try_compact_note_decryption(&domain, &prepared_ivk, &compact_action) {
            console::log_1(&format!("✅ [WASM] MATCH FOUND with {} scope!", scope_name).into());
            // Compact decryption doesn't give us the memo directly
            // We need to extract it from the ciphertext manually
            // For now, we'll return a placeholder memo with the amount

            // Extract amount from note (in zatoshis, convert to ZEC)
            let amount_zatoshis = note.value().inner();
            let amount_zec = amount_zatoshis as f64 / 100_000_000.0;

            let output = DecryptedOutput {
                memo: "[Compact block - memo not available]".to_string(),
                amount: amount_zec,
            };

            return serde_json::to_string(&output)
                .map_err(|e| format!("JSON serialization failed: {:?}", e));
        } else {
            console::log_1(&format!("  ❌ No match with {} scope", scope_name).into());
        }
    }

    console::log_1(&"❌ [WASM] No match found with any scope".into());
    Err("No memo found or viewing key doesn't match this output.".to_string())
}

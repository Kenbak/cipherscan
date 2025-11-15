use wasm_bindgen::prelude::*;
use web_sys::console;

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

#[cfg(feature = "wee_alloc")]
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

#[wasm_bindgen(start)]
pub fn main() {
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
}

fn log(s: &str) {
    console::log_1(&JsValue::from_str(s));
}

#[wasm_bindgen]
pub fn test_wasm() -> String {
    log("🦀 Zcash WASM - Official 3-crate solution!");
    "WASM module is working!".to_string()
}

#[wasm_bindgen]
pub fn detect_key_type(viewing_key: &str) -> String {
    log(&format!("🔍 Detecting key type for: {}...", &viewing_key[..20.min(viewing_key.len())]));
    if viewing_key.starts_with("uview") {
        if viewing_key.contains("test") {
            log("✅ Detected: Unified Full Viewing Key (testnet)");
            "ufvk-testnet".to_string()
        } else {
            log("✅ Detected: Unified Full Viewing Key (mainnet)");
            "ufvk-mainnet".to_string()
        }
    } else {
        log("⚠️ Unknown key type");
        "unknown".to_string()
    }
}

#[wasm_bindgen]
pub fn decrypt_memo(tx_hex: &str, viewing_key: &str) -> Result<String, String> {
    log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    log("🔓 OFFICIAL 3-CRATE SOLUTION");
    log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    log(&format!("📦 Transaction hex length: {} chars ({} bytes)", tx_hex.len(), tx_hex.len() / 2));
    log(&format!("🔑 Viewing key prefix: {}...", &viewing_key[..20.min(viewing_key.len())]));

    // Step 1: Parse UFVK
    log("");
    log("🔍 STEP 1: Parse UFVK");
    let (_network, ufvk) = Ufvk::decode(viewing_key)
        .map_err(|e| format!("UFVK decode failed: {:?}", e))?;
    log("  ✅ UFVK decoded");

    // Step 2: Extract Orchard FVK
    log("");
    log("🔍 STEP 2: Extract Orchard FVK");
    let orchard_fvk_bytes = ufvk.items().iter().find_map(|fvk| {
        match fvk {
            Fvk::Orchard(data) => Some(data.clone()),
            _ => None,
        }
    }).ok_or("No Orchard FVK found in UFVK")?;
    log(&format!("  ✅ Orchard FVK ({} bytes)", orchard_fvk_bytes.len()));

    // Step 3: Parse FullViewingKey
    log("");
    log("🔍 STEP 3: Parse FullViewingKey");
    let fvk = FullViewingKey::from_bytes(&orchard_fvk_bytes)
        .ok_or("FVK parse failed")?;
    log("  ✅ FVK parsed");

    // Step 4: Parse transaction with zcash_primitives
    log("");
    log("🔍 STEP 4: Parse transaction");

    let tx_bytes = hex::decode(tx_hex)
        .map_err(|e| format!("Hex decode failed: {:?}", e))?;

    let mut cursor = Cursor::new(&tx_bytes[..]);
    let tx = Transaction::read(&mut cursor, zcash_primitives::consensus::BranchId::Nu5)
        .map_err(|e| format!("TX parse: {:?}", e))?;

    log("  ✅ Transaction parsed");

    // Step 5: Get Orchard actions
    log("");
    log("🔍 STEP 5: Extract Orchard actions");

    let orchard_actions = match tx.orchard_bundle() {
        Some(bundle) => {
            let actions: Vec<_> = bundle.actions().iter().collect();
            log(&format!("  📊 Found {} Orchard actions", actions.len()));
            actions
        },
        None => {
            return Err("No Orchard bundle in transaction".to_string());
        }
    };

    // Step 6: Try to decrypt
    log("");
    log("🔍 STEP 6: Decrypt with zcash_note_encryption");

    for (i, action) in orchard_actions.iter().enumerate() {
        log(&format!("  🌳 Action {}...", i));

        // Create domain for THIS specific action
        let domain = OrchardDomain::for_action(*action);

        // Try both External and Internal scopes
        for scope in [Scope::External, Scope::Internal] {
            let ivk = fvk.to_ivk(scope);
            let prepared_ivk = PreparedIncomingViewingKey::new(&ivk);

            log(&format!("    🔍 Trying scope: {:?}", scope));

            if let Some((_note, _recipient, memo)) = try_note_decryption(&domain, &prepared_ivk, *action) {
                log(&format!("    ✅ Decrypted with {:?} scope!", scope));

                let memo_bytes = memo.as_slice();
                let memo_len = memo_bytes.iter().position(|&b| b == 0).unwrap_or(memo_bytes.len());
                let memo_text = String::from_utf8_lossy(&memo_bytes[..memo_len]);

                log(&format!("    📝 Memo: {}", memo_text));
                return Ok(memo_text.to_string());
            }
        }

        log("    ❌ Decryption failed for this action (both scopes).");
    }

    Err("No memo found or viewing key doesn't match any outputs.".to_string())
}

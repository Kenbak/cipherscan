use wasm_bindgen::prelude::*;

// 🎯 OFFICIAL 3-CRATE SOLUTION (zcash_primitives 0.25 + orchard 0.11)
use zcash_note_encryption::{try_note_decryption, try_compact_note_decryption, batch};
use orchard::{
    keys::{FullViewingKey, Scope, PreparedIncomingViewingKey},
    note_encryption::{OrchardDomain, CompactAction},
    note::ExtractedNoteCommitment,
};
use zcash_address::unified::{Container, Encoding, Fvk, Ufvk, Address as UnifiedAddress, Receiver};

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

#[derive(Serialize, Deserialize)]
pub struct UnifiedAddressComponents {
    pub network: String,
    pub has_transparent: bool,
    pub has_sapling: bool,
    pub has_orchard: bool,
    pub transparent_address: Option<String>,
    pub sapling_address: Option<String>,
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

/// Decode a unified address and return its component receivers
#[wasm_bindgen]
pub fn decode_unified_address(ua_string: &str) -> Result<String, String> {
    // Decode the unified address
    let (network, ua) = UnifiedAddress::decode(ua_string)
        .map_err(|e| format!("Failed to decode unified address: {:?}", e))?;

    let is_mainnet = ua_string.starts_with("u1");

    let network_name = if is_mainnet { "mainnet" } else { "testnet" };

    let mut components = UnifiedAddressComponents {
        network: network_name.to_string(),
        has_transparent: false,
        has_sapling: false,
        has_orchard: false,
        transparent_address: None,
        sapling_address: None,
    };

    // Iterate through receivers
    for receiver in ua.items() {
        match receiver {
            Receiver::P2pkh(data) => {
                components.has_transparent = true;
                // Encode as t1 address (mainnet) or tm (testnet)
                let prefix: &[u8] = if is_mainnet { &[0x1C, 0xB8] } else { &[0x1D, 0x25] };
                let mut addr_bytes = prefix.to_vec();
                addr_bytes.extend_from_slice(&data);
                components.transparent_address = Some(bs58::encode(&addr_bytes).with_check().into_string());
            },
            Receiver::P2sh(data) => {
                components.has_transparent = true;
                // Encode as t3 address (mainnet) or t2 (testnet)
                let prefix: &[u8] = if is_mainnet { &[0x1C, 0xBD] } else { &[0x1C, 0xBA] };
                let mut addr_bytes = prefix.to_vec();
                addr_bytes.extend_from_slice(&data);
                components.transparent_address = Some(bs58::encode(&addr_bytes).with_check().into_string());
            },
            Receiver::Sapling(data) => {
                components.has_sapling = true;
                // Encode as zs address using bech32
                // For sapling, we just show the raw hex since bech32 encoding is complex
                components.sapling_address = Some(format!("zs1...{}", hex::encode(&data[..4])));
            },
            Receiver::Orchard(_) => {
                components.has_orchard = true;
                // Orchard receivers can't be encoded as standalone addresses
            },
            _ => {
                // Unknown receiver type, skip
            }
        }
    }

    serde_json::to_string(&components)
        .map_err(|e| format!("JSON serialization failed: {:?}", e))
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
    cmx_hex: &str,
    ephemeral_key_hex: &str,
    ciphertext_hex: &str,
    viewing_key: &str,
) -> Result<String, String> {
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

    // Step 4: Parse compact output data
    let nullifier_bytes = hex::decode(nullifier_hex)
        .map_err(|e| format!("Nullifier hex decode failed: {:?}", e))?;
    let cmx_bytes = hex::decode(cmx_hex)
        .map_err(|e| format!("CMX hex decode failed: {:?}", e))?;
    let ephemeral_key_bytes = hex::decode(ephemeral_key_hex)
        .map_err(|e| format!("Ephemeral key hex decode failed: {:?}", e))?;
    let ciphertext_bytes = hex::decode(ciphertext_hex)
        .map_err(|e| format!("Ciphertext hex decode failed: {:?}", e))?;

    // Step 5: Convert to proper types
    let nullifier_array: [u8; 32] = nullifier_bytes.try_into().map_err(|_| "Invalid nullifier length")?;
    let nullifier = orchard::note::Nullifier::from_bytes(&nullifier_array)
        .into_option()
        .ok_or("Invalid nullifier")?;

    let cmx_array: [u8; 32] = cmx_bytes.try_into().map_err(|_| "Invalid CMX length")?;
    let cmx = ExtractedNoteCommitment::from_bytes(&cmx_array)
        .into_option()
        .ok_or("Invalid CMX")?;

    let ephemeral_key_array: [u8; 32] = ephemeral_key_bytes.try_into().map_err(|_| "Invalid ephemeral key length")?;

    // Ciphertext should be 52 bytes for compact format
    if ciphertext_bytes.len() != 52 {
        return Err(format!("Invalid ciphertext length: expected 52, got {}", ciphertext_bytes.len()));
    }
    let ciphertext: [u8; 52] = ciphertext_bytes.try_into().unwrap();

    // Step 6: Create CompactAction with real nullifier
    let compact_action = CompactAction::from_parts(
        nullifier,
        cmx,
        ephemeral_key_array.into(),
        ciphertext,
    );

    // Step 7: Try to decrypt with both External and Internal scopes
    for scope in [Scope::External, Scope::Internal] {
        let ivk = fvk.to_ivk(scope);
        let prepared_ivk = PreparedIncomingViewingKey::new(&ivk);

        // Create domain for this compact action
        let domain = OrchardDomain::for_compact_action(&compact_action);

        // Try compact note decryption
        if let Some((note, _recipient)) = try_compact_note_decryption(&domain, &prepared_ivk, &compact_action) {
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
        }
    }

    Err("No memo found or viewing key doesn't match this output.".to_string())
}

/// Batch filter compact outputs (MUCH FASTER!)
/// Takes JSON array of outputs and returns JSON array of matching indices
#[wasm_bindgen]
pub fn batch_filter_compact_outputs(
    outputs_json: &str,
    viewing_key: &str,
) -> Result<String, String> {
    // Parse JSON input: array of {nullifier, cmx, ephemeralKey, ciphertext, txid, height}
    #[derive(serde::Deserialize)]
    struct CompactOutput {
        nullifier: String,
        cmx: String,
        ephemeral_key: String,
        ciphertext: String,
        txid: String,
        height: u64,
    }

    let outputs: Vec<CompactOutput> = serde_json::from_str(outputs_json)
        .map_err(|e| format!("Failed to parse outputs JSON: {:?}", e))?;

    // Step 1: Parse UFVK ONCE
    let (_network, ufvk) = Ufvk::decode(viewing_key)
        .map_err(|e| format!("UFVK decode failed: {:?}", e))?;

    let orchard_fvk_bytes = ufvk.items().iter().find_map(|fvk| {
        match fvk {
            Fvk::Orchard(data) => Some(data.clone()),
            _ => None,
        }
    }).ok_or("No Orchard FVK found in UFVK")?;

    let fvk = FullViewingKey::from_bytes(&orchard_fvk_bytes)
        .ok_or("FVK parse failed")?;

    // Step 2: Prepare IVKs ONCE (both scopes)
    let ivk_external = fvk.to_ivk(Scope::External);
    let ivk_internal = fvk.to_ivk(Scope::Internal);
    let prepared_ivks = vec![
        PreparedIncomingViewingKey::new(&ivk_external),
        PreparedIncomingViewingKey::new(&ivk_internal),
    ];

    // Step 3: Parse all compact outputs
    let mut parsed_outputs: Vec<(OrchardDomain, CompactAction)> = Vec::new();

    for output in &outputs {
        // Decode hex
        let nullifier_bytes = hex::decode(&output.nullifier)
            .map_err(|e| format!("Nullifier hex decode failed: {:?}", e))?;
        let cmx_bytes = hex::decode(&output.cmx)
            .map_err(|e| format!("CMX hex decode failed: {:?}", e))?;
        let ephemeral_key_bytes = hex::decode(&output.ephemeral_key)
            .map_err(|e| format!("Ephemeral key hex decode failed: {:?}", e))?;
        let ciphertext_bytes = hex::decode(&output.ciphertext)
            .map_err(|e| format!("Ciphertext hex decode failed: {:?}", e))?;

        // Convert to proper types
        let nullifier_array: [u8; 32] = nullifier_bytes.try_into()
            .map_err(|_| "Invalid nullifier length")?;
        let nullifier = orchard::note::Nullifier::from_bytes(&nullifier_array)
            .into_option()
            .ok_or("Invalid nullifier")?;

        let cmx_array: [u8; 32] = cmx_bytes.try_into()
            .map_err(|_| "Invalid CMX length")?;
        let cmx = ExtractedNoteCommitment::from_bytes(&cmx_array)
            .into_option()
            .ok_or("Invalid CMX")?;

        let ephemeral_key_array: [u8; 32] = ephemeral_key_bytes.try_into()
            .map_err(|_| "Invalid ephemeral key length")?;

        if ciphertext_bytes.len() != 52 {
            return Err(format!("Invalid ciphertext length: expected 52, got {}", ciphertext_bytes.len()));
        }
        let ciphertext_array: [u8; 52] = ciphertext_bytes.try_into().unwrap();

        // Create CompactAction
        let compact_action = CompactAction::from_parts(
            nullifier,
            cmx,
            ephemeral_key_array.into(),
            ciphertext_array,
        );

        let domain = OrchardDomain::for_compact_action(&compact_action);
        parsed_outputs.push((domain, compact_action));
    }

    // Step 4: BATCH DECRYPT ALL OUTPUTS AT ONCE!
    let results = batch::try_compact_note_decryption(&prepared_ivks, &parsed_outputs);

    // Step 5: Collect matching indices and their TXIDs
    #[derive(serde::Serialize)]
    struct Match {
        index: usize,
        txid: String,
        height: u64,
        scope: String,
    }

    let matches: Vec<Match> = results.iter()
        .enumerate()
        .filter_map(|(i, result)| {
            result.as_ref().map(|((note, _recipient), ivk_idx)| {
                let scope_name = if *ivk_idx == 0 { "External" } else { "Internal" };
                Match {
                    index: i,
                    txid: outputs[i].txid.clone(),
                    height: outputs[i].height,
                    scope: scope_name.to_string(),
                }
            })
        })
        .collect();

    serde_json::to_string(&matches)
        .map_err(|e| format!("JSON serialization failed: {:?}", e))
}

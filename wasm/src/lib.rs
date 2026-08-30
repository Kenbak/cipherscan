use wasm_bindgen::prelude::*;

// Zakura Common — optimized Zcash cryptography (1.5x faster trial decrypt)
use zcash_note_encryption::{try_note_decryption, try_compact_note_decryption, batch, ShieldedOutput, EphemeralKeyBytes};
use orchard::{
    keys::{FullViewingKey, Scope, PreparedIncomingViewingKey},
    note_encryption::{OrchardDomain, IronwoodDomain, CompactAction},
    note::ExtractedNoteCommitment,
};
use zcash_address::unified::{Container, Encoding, Fvk, Ufvk, Address as UnifiedAddress, Receiver};

use serde::{Serialize, Deserialize};

// ---------------------------------------------------------------------------
// Minimal ZIP-225 v5 transaction parser — extracts Orchard actions only.
// Replaces zcash_primitives::Transaction to avoid the secp256k1 C dependency.
// ---------------------------------------------------------------------------

const ORCHARD_ENC_CIPHERTEXT_SIZE: usize = 580;

struct OrchardActionRaw {
    nullifier_bytes: [u8; 32],
    cmx_bytes: [u8; 32],
    epk_bytes: [u8; 32],
    enc_ciphertext: [u8; ORCHARD_ENC_CIPHERTEXT_SIZE],
    is_ironwood: bool,
}

impl ShieldedOutput<OrchardDomain, ORCHARD_ENC_CIPHERTEXT_SIZE> for OrchardActionRaw {
    fn ephemeral_key(&self) -> EphemeralKeyBytes { EphemeralKeyBytes(self.epk_bytes) }
    fn cmstar_bytes(&self) -> [u8; 32] { self.cmx_bytes }
    fn enc_ciphertext(&self) -> &[u8; ORCHARD_ENC_CIPHERTEXT_SIZE] { &self.enc_ciphertext }
}

impl ShieldedOutput<IronwoodDomain, ORCHARD_ENC_CIPHERTEXT_SIZE> for OrchardActionRaw {
    fn ephemeral_key(&self) -> EphemeralKeyBytes { EphemeralKeyBytes(self.epk_bytes) }
    fn cmstar_bytes(&self) -> [u8; 32] { self.cmx_bytes }
    fn enc_ciphertext(&self) -> &[u8; ORCHARD_ENC_CIPHERTEXT_SIZE] { &self.enc_ciphertext }
}

fn read_compact_size(data: &[u8], pos: &mut usize) -> Result<usize, String> {
    if *pos >= data.len() { return Err("unexpected end of tx data".into()); }
    let first = data[*pos];
    *pos += 1;
    match first {
        0..=252 => Ok(first as usize),
        253 => {
            if *pos + 2 > data.len() { return Err("unexpected end of tx data".into()); }
            let v = u16::from_le_bytes([data[*pos], data[*pos + 1]]) as usize;
            *pos += 2;
            Ok(v)
        }
        254 => {
            if *pos + 4 > data.len() { return Err("unexpected end of tx data".into()); }
            let v = u32::from_le_bytes(data[*pos..*pos + 4].try_into().unwrap()) as usize;
            *pos += 4;
            Ok(v)
        }
        _ => {
            if *pos + 8 > data.len() { return Err("unexpected end of tx data".into()); }
            let v = u64::from_le_bytes(data[*pos..*pos + 8].try_into().unwrap()) as usize;
            *pos += 8;
            Ok(v)
        }
    }
}

fn skip(data: &[u8], pos: &mut usize, n: usize) -> Result<(), String> {
    if *pos + n > data.len() { return Err("unexpected end of tx data".into()); }
    *pos += n;
    Ok(())
}

fn read_bytes<const N: usize>(data: &[u8], pos: &mut usize) -> Result<[u8; N], String> {
    if *pos + N > data.len() { return Err("unexpected end of tx data".into()); }
    let mut buf = [0u8; N];
    buf.copy_from_slice(&data[*pos..*pos + N]);
    *pos += N;
    Ok(buf)
}

/// Read `count` Orchard-protocol actions (820 bytes each) into `out`.
fn read_orchard_actions(data: &[u8], pos: &mut usize, count: usize, is_ironwood: bool, out: &mut Vec<OrchardActionRaw>) -> Result<(), String> {
    for _ in 0..count {
        skip(data, pos, 32)?; // cv
        let nullifier_bytes = read_bytes::<32>(data, pos)?;
        skip(data, pos, 32)?; // rk
        let cmx_bytes = read_bytes::<32>(data, pos)?;
        let epk_bytes = read_bytes::<32>(data, pos)?;
        let enc_ciphertext = read_bytes::<ORCHARD_ENC_CIPHERTEXT_SIZE>(data, pos)?;
        skip(data, pos, 80)?; // outCiphertext
        out.push(OrchardActionRaw { nullifier_bytes, cmx_bytes, epk_bytes, enc_ciphertext, is_ironwood });
    }
    Ok(())
}

/// Skip the trailing authorizing data for an Orchard/Ironwood bundle.
fn skip_bundle_auth(data: &[u8], pos: &mut usize, n_actions: usize) -> Result<(), String> {
    if n_actions == 0 { return Ok(()); }
    skip(data, pos, 1 + 8 + 32)?; // flags + valueBalance + anchor
    let proof_len = read_compact_size(data, pos)?;
    skip(data, pos, proof_len)?; // proofs
    skip(data, pos, n_actions * 64)?; // spendAuthSigs
    skip(data, pos, 64)?; // bindingSig
    Ok(())
}

/// Parse a v5 (ZIP-225) or v6 (ZIP-229) transaction and extract Orchard-protocol
/// actions from both the Orchard and Ironwood bundles. Ironwood actions use the
/// same protocol, keys, and encryption as Orchard -- trial decryption is identical.
///
/// Returns `(actions, sapling_spend_count, sapling_output_count)`. The Sapling
/// counts are not decrypted (this WASM build has no Sapling domain -- see
/// Cargo.toml), but the caller uses them to tell a Sapling-only transaction
/// apart from a fully transparent one when `actions` comes back empty.
fn parse_orchard_actions(data: &[u8]) -> Result<(Vec<OrchardActionRaw>, usize, usize), String> {
    if data.len() < 20 { return Err("transaction too short".into()); }

    let version = u32::from_le_bytes(data[0..4].try_into().unwrap());
    let is_v6 = version == 0x8000_0006;

    let mut pos = 20usize; // skip header

    // --- Transparent ---
    let n_in = read_compact_size(data, &mut pos)?;
    for _ in 0..n_in {
        skip(data, &mut pos, 36)?;
        let script_len = read_compact_size(data, &mut pos)?;
        skip(data, &mut pos, script_len + 4)?;
    }
    let n_out = read_compact_size(data, &mut pos)?;
    for _ in 0..n_out {
        skip(data, &mut pos, 8)?;
        let script_len = read_compact_size(data, &mut pos)?;
        skip(data, &mut pos, script_len)?;
    }

    // --- Sapling ---
    let n_spends = read_compact_size(data, &mut pos)?;
    skip(data, &mut pos, n_spends * 96)?;
    let n_outputs = read_compact_size(data, &mut pos)?;
    skip(data, &mut pos, n_outputs * 756)?;
    if n_spends > 0 || n_outputs > 0 { skip(data, &mut pos, 8)?; }
    if n_spends > 0 { skip(data, &mut pos, 32)?; }
    skip(data, &mut pos, n_spends * 192)?;
    skip(data, &mut pos, n_spends * 64)?;
    skip(data, &mut pos, n_outputs * 192)?;
    if n_spends > 0 || n_outputs > 0 { skip(data, &mut pos, 64)?; }

    // --- Orchard ---
    let n_orchard = read_compact_size(data, &mut pos)?;
    let mut actions = Vec::with_capacity(n_orchard + 4);
    read_orchard_actions(data, &mut pos, n_orchard, false, &mut actions)?;

    // --- Ironwood (v6 only, same action encoding, different note plaintext lead byte) ---
    if is_v6 {
        skip_bundle_auth(data, &mut pos, n_orchard)?;
        let n_ironwood = read_compact_size(data, &mut pos)?;
        read_orchard_actions(data, &mut pos, n_ironwood, true, &mut actions)?;
    }

    Ok((actions, n_spends, n_outputs))
}

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

#[wasm_bindgen(start)]
pub fn main() {
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
    let (_network, ua) = UnifiedAddress::decode(ua_string)
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
            Fvk::Orchard(data) => Some(*data),
            _ => None,
        }
    }).ok_or("No Orchard FVK found in UFVK")?;

    // Step 3: Parse FullViewingKey
    let fvk = FullViewingKey::from_bytes(&orchard_fvk_bytes)
        .ok_or("FVK parse failed")?;

    // Step 4: Parse Orchard/Ironwood actions from v5 (ZIP-225) or v6 (ZIP-229) tx
    let tx_bytes = hex::decode(tx_hex)
        .map_err(|e| format!("Hex decode failed: {:?}", e))?;

    let (raw_actions, sapling_spends, sapling_outputs) = parse_orchard_actions(&tx_bytes)
        .map_err(|e| format!("TX parse: {}", e))?;

    if raw_actions.is_empty() {
        if sapling_spends > 0 || sapling_outputs > 0 {
            return Err("This transaction only contains Sapling shielded data. Sapling memo decryption isn't supported yet -- only Orchard and Ironwood transactions can be decrypted here.".to_string());
        }
        return Err("No Orchard bundle in transaction".to_string());
    }

    // Step 5: Try to decrypt all actions and collect valid outputs (memo + amount)
    let mut found_outputs = Vec::new();

    for raw_action in &raw_actions {
        let nullifier = orchard::note::Nullifier::from_bytes(&raw_action.nullifier_bytes)
            .into_option()
            .ok_or("Invalid nullifier in action")?;
        let cmx = ExtractedNoteCommitment::from_bytes(&raw_action.cmx_bytes)
            .into_option()
            .ok_or("Invalid cmx in action")?;

        let compact = CompactAction::from_parts(nullifier, cmx, raw_action.epk_bytes.into(), [0u8; 52]);

        for scope in [Scope::External, Scope::Internal] {
            let ivk = fvk.to_ivk(scope);
            let prepared_ivk = PreparedIncomingViewingKey::new(&ivk);

            // Use IronwoodDomain for Ironwood actions (lead byte 0x03),
            // OrchardDomain for Orchard actions (lead byte 0x02).
            let result = if raw_action.is_ironwood {
                let domain = IronwoodDomain::for_compact_action(&compact);
                try_note_decryption(&domain, &prepared_ivk, raw_action)
            } else {
                let domain = OrchardDomain::for_compact_action(&compact);
                try_note_decryption(&domain, &prepared_ivk, raw_action)
            };

            if let Some((note, _recipient, memo)) = result {
                let memo_bytes = memo.as_slice();
                let memo_len = memo_bytes.iter().position(|&b| b == 0).unwrap_or(memo_bytes.len());

                if memo_len == 0 { continue; }

                if let Ok(memo_text) = String::from_utf8(memo_bytes[..memo_len].to_vec()) {
                    if !memo_text.trim().is_empty() {
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
            Fvk::Orchard(data) => Some(*data),
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

    // Step 7: Try to decrypt with both External and Internal scopes,
    // using both OrchardDomain (lead byte 0x02) and IronwoodDomain (0x03).
    for scope in [Scope::External, Scope::Internal] {
        let ivk = fvk.to_ivk(scope);
        let prepared_ivk = PreparedIncomingViewingKey::new(&ivk);

        let orchard_domain = OrchardDomain::for_compact_action(&compact_action);
        let ironwood_domain = IronwoodDomain::for_compact_action(&compact_action);

        let result = try_compact_note_decryption(&orchard_domain, &prepared_ivk, &compact_action)
            .or_else(|| try_compact_note_decryption(&ironwood_domain, &prepared_ivk, &compact_action));

        if let Some((note, _recipient)) = result {
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
            Fvk::Orchard(data) => Some(*data),
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

    // Step 3: Parse all compact outputs. Each action is tried with both
    // OrchardDomain (lead byte 0x02) and IronwoodDomain (0x03) since
    // compact block data doesn't distinguish between pools.
    // Batch entry 2*i = OrchardDomain, 2*i+1 = IronwoodDomain for output i.
    let mut orchard_batch: Vec<(OrchardDomain, CompactAction)> = Vec::new();
    let mut ironwood_batch: Vec<(IronwoodDomain, CompactAction)> = Vec::new();

    for output in &outputs {
        let nullifier_bytes = hex::decode(&output.nullifier)
            .map_err(|e| format!("Nullifier hex decode failed: {:?}", e))?;
        let cmx_bytes = hex::decode(&output.cmx)
            .map_err(|e| format!("CMX hex decode failed: {:?}", e))?;
        let ephemeral_key_bytes = hex::decode(&output.ephemeral_key)
            .map_err(|e| format!("Ephemeral key hex decode failed: {:?}", e))?;
        let ciphertext_bytes = hex::decode(&output.ciphertext)
            .map_err(|e| format!("Ciphertext hex decode failed: {:?}", e))?;

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

        let compact_action = CompactAction::from_parts(
            nullifier, cmx, ephemeral_key_array.into(), ciphertext_array,
        );

        orchard_batch.push((OrchardDomain::for_compact_action(&compact_action), compact_action.clone()));
        ironwood_batch.push((IronwoodDomain::for_compact_action(&compact_action), compact_action));
    }

    // Step 4: BATCH DECRYPT with both domains
    let orchard_results = batch::try_compact_note_decryption(&prepared_ivks, &orchard_batch);
    let ironwood_results = batch::try_compact_note_decryption(&prepared_ivks, &ironwood_batch);

    // Step 5: Merge results — if either domain matched, the output is ours
    #[derive(serde::Serialize)]
    struct Match {
        index: usize,
        txid: String,
        height: u64,
        scope: String,
    }

    let mut matches: Vec<Match> = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for (i, result) in orchard_results.iter().enumerate() {
        if let Some(((_note, _recipient), ivk_idx)) = result {
            if seen.insert(i) {
                let scope_name = if *ivk_idx == 0 { "External" } else { "Internal" };
                matches.push(Match { index: i, txid: outputs[i].txid.clone(), height: outputs[i].height, scope: scope_name.to_string() });
            }
        }
    }
    for (i, result) in ironwood_results.iter().enumerate() {
        if let Some(((_note, _recipient), ivk_idx)) = result {
            if seen.insert(i) {
                let scope_name = if *ivk_idx == 0 { "External" } else { "Internal" };
                matches.push(Match { index: i, txid: outputs[i].txid.clone(), height: outputs[i].height, scope: scope_name.to_string() });
            }
        }
    }

    serde_json::to_string(&matches)
        .map_err(|e| format!("JSON serialization failed: {:?}", e))
}

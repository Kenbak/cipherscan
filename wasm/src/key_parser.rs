/// Viewing key parser for Zcash
/// Parses Unified Full Viewing Keys (UFVK) and extracts Orchard/Sapling IVKs

use zcash_address::unified::{Container, Encoding, Fvk, Ufvk};

/// Parse a Unified Full Viewing Key and extract the Orchard IVK
///
/// Uses the official `zcash_address` crate to properly decode UFVKs
pub fn parse_ufvk_orchard_ivk(ufvk: &str) -> Result<[u8; 32], String> {
    web_sys::console::log_1(&format!("🔍 Parsing UFVK with zcash_address crate (length: {} chars)...", ufvk.len()).into());
    web_sys::console::log_1(&format!("  Prefix: {}...", &ufvk[..20.min(ufvk.len())]).into());

    // Decode the UFVK using the official zcash_address crate
    let (_network, unified_fvk) = Ufvk::decode(ufvk)
        .map_err(|e| format!("Failed to decode UFVK: {:?}", e))?;

    web_sys::console::log_1(&"  ✅ UFVK decoded successfully!".into());
    web_sys::console::log_1(&"  🔍 Extracting Orchard FVK from items...".into());

    // Get all FVK items
    let fvks = unified_fvk.items();
    web_sys::console::log_1(&format!("  📋 Found {} FVK items in UFVK", fvks.len()).into());

    // Find the Orchard FVK by matching on the enum
    for (i, fvk) in fvks.iter().enumerate() {
        web_sys::console::log_1(&format!("    Checking FVK item {}...", i).into());

        // Match on the Fvk enum to find Orchard
        match fvk {
            Fvk::Orchard(orchard_data) => {
                web_sys::console::log_1(&"    ✅ Found Orchard FVK!".into());
                web_sys::console::log_1(&format!("    📦 Orchard FVK data: {} bytes", orchard_data.len()).into());

                // Log all FVK data for debugging
                web_sys::console::log_1(&format!("    📋 Full FVK (first 96 bytes): {:02x?}", &orchard_data[..96.min(orchard_data.len())]).into());

                // Extract the IVK (rivk) from the Orchard FVK
                // Orchard FVK structure: ak (32) + nk (32) + rivk (32) = 96 bytes
                if orchard_data.len() < 96 {
                    return Err(format!("Orchard FVK too short: expected at least 96 bytes, got {}", orchard_data.len()));
                }

                // Log each component
                web_sys::console::log_1(&format!("    📋 ak (bytes 0-32): {:02x?}", &orchard_data[0..32]).into());
                web_sys::console::log_1(&format!("    📋 nk (bytes 32-64): {:02x?}", &orchard_data[32..64]).into());
                web_sys::console::log_1(&format!("    📋 rivk (bytes 64-96): {:02x?}", &orchard_data[64..96]).into());

                // Extract rivk (bytes 64-96)
                let mut rivk = [0u8; 32];
                rivk.copy_from_slice(&orchard_data[64..96]);
                web_sys::console::log_1(&format!("    📋 Extracted rivk: {:02x?}...", &rivk[..8]).into());

                // For Orchard, rivk IS the IVK (no additional derivation needed)
                let ivk = rivk;
                web_sys::console::log_1(&format!("    ✅ Using rivk directly as IVK: {:02x?}...", &ivk[..8]).into());

                return Ok(ivk);
            }
            _ => {
                web_sys::console::log_1(&"    ⏭️  Not an Orchard FVK, skipping...".into());
            }
        }
    }

    Err("No Orchard FVK found in UFVK".to_string())
}

/// Parse a Sapling Extended Full Viewing Key and extract the IVK
/// (Placeholder for future implementation)
pub fn parse_sapling_extfvk_ivk(_extfvk: &str) -> Result<[u8; 32], String> {
    Err("Sapling ExtFVK parsing not yet implemented".to_string())
}

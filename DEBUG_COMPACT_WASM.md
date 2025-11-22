# 🔍 DEBUG: Compact Note Decryption en WASM

## ❌ Problème

`try_compact_note_decryption` retourne **TOUJOURS `None`** alors que :
- ✅ Les données de Lightwalletd sont correctes
- ✅ `try_note_decryption` (full TX) fonctionne parfaitement
- ✅ Même TX, même viewing key, même note

## 📊 Données de Test

**Block:** 3656720
**TXID:** `c0f9b7f9c8f7e6d5c4b3a29180706f5e4d3c2b1a09f8e7d6c5b4a39281706f5e` (approximatif)

**Orchard Action #0:**
```json
{
  "nullifier": "2c9e681c623faef04967633ae7f4e9d773ea20fe4852de9126d024b48a19830d",
  "cmx": "4da8ffd24a38e238beb3941ce6d77bc9f5eae9ad59c2339304e60c435bbda30c",
  "ephemeralKey": "94ae8f72a6840f38533fac6bc67a67614bffcb4b149ba7a434a84f8641cd8699",
  "ciphertext": "de888ec39aa2961150f9df6b17c8c0f7c2014603b76edaa028461c0f3e31a15087316d4e787b1608dace370f592b10868f319372"
}
```

**Viewing Key (testnet):**
```
uviewtest1eruekgghjgquag8avaxa62wuk7ym7skgjv4gevvpmztk8gpzsjr7vvqs7ce5prqfg85su43y5t6t3pz5m5l22sxvz5zz4am6c4q2fv22jcz79wl5n3alzw6zzzt04eca6t6m5ufe07vsaj3rcddyx74fhdqxkgl258wjx8a3nsxmujfde8n5net07df9xffu6m0xa25vldk36jgm0hnfln3df7vfd89xv096xf2ywjgw3lqp6lnncp8dz2zvkgmgmzq8az2rdl9xp7enugjkwr66wmg5jmzdfmp9ewusp9jdkerdcvgnua7npyzlypxhjqvu58ypaukneseda5a5cj43rsh35kaa7j0jarcrtqmk6ssp8nkv7eja5prrzlt2wp5uwu6c0tz9x09m30vyka6rhdgwrmev2cvvz8tdx0w8f8llh55u0ahc990e9fqk224y3cntz6hhamdrf7skqvanu4zaam0eca5jsldwmvz7dks34vkan5ug
```

## ✅ Ce qui MARCHE

**Full TX decryption avec `try_note_decryption` :**
```rust
let domain = OrchardDomain::for_action(action);
if let Some((note, recipient, memo)) = try_note_decryption(&domain, &prepared_ivk, action) {
    // ✅ FONCTIONNE ! Retourne:
    // - note.value() = 30000000 zatoshis (0.3 ZEC)
    // - memo = "Thanks for using testnet.ZecFaucet.com"
}
```

## ❌ Ce qui NE MARCHE PAS

**Compact decryption avec `try_compact_note_decryption` :**
```rust
let compact_action = CompactAction::from_parts(
    nullifier,
    cmx,
    ephemeral_key.into(),
    ciphertext, // 52 bytes seulement
);

let domain = OrchardDomain::for_compact_action(&compact_action);
if let Some((note, recipient)) = try_compact_note_decryption(&domain, &prepared_ivk, &compact_action) {
    // ❌ JAMAIS exécuté - retourne TOUJOURS None
}
```

## 🔬 Hypothèses testées

### 1. ❌ Mauvais domain?
**Test:** Essayé `for_compact_action`, `for_nullifier`, `OrchardDomain::new`
**Résultat:** Aucun ne marche

### 2. ❌ Mauvais scope?
**Test:** Essayé External ET Internal
**Résultat:** Les deux retournent None

### 3. ❌ `cmx` vs `cmu`?
**Test:** Confirmé que c'est bien `cmx` (x-coordinate) pour Orchard
**Résultat:** Données correctes, mais still None

### 4. ❌ Ciphertext trop court?
**Test:** Confirmé 52 bytes (correct pour compact format)
**Résultat:** Longueur correcte, mais still None

## 🎯 Comment Zkool2 le fait

**Zkool2 NE utilise PAS `try_compact_note_decryption` !**

Au lieu, ils font le décryptage **manuellement** :

```rust
// 1. Calculer shared secret
let ivk_fq = Fq::from_repr(ivk.to_bytes()[32..64]).unwrap();
let epk = Point::from_bytes(&ephemeral_key).unwrap().to_affine();
let ka = epk * ivk_fq;

// 2. Dériver clé ChaCha20
let key = blake2b(KDF_ORCHARD_PERSONALIZATION, &ka.to_bytes(), &ephemeral_key);

// 3. Décrypter avec ChaCha20
let mut plaintext = ciphertext.clone();
let mut keystream = ChaCha20::new(&key, &[0u8; 12]);
keystream.seek(64);
keystream.apply_keystream(&mut plaintext);

// 4. Parser avec domain.parse_note_plaintext_without_memo_ivk
if let Some((note, recipient)) = domain.parse_note_plaintext_without_memo_ivk(&prepared_ivk, &plaintext) {
    // ✅ CA MARCHE !
}
```

## ⚠️ Problème pour WASM

**Zkool2 utilise :**
- `halo2_proofs::pasta::pallas::{Point, Fq}` ❌ PAS compatible WASM
- `blake2b_simd` ✅ Compatible WASM
- `chacha20` ✅ Compatible WASM

**On a besoin de trouver des équivalents WASM pour:**
- `Point::from_bytes()` - Parser ephemeral key
- `Fq::from_repr()` - Parser IVK field element
- `epk * ivk_fq` - Calculer shared secret (multiplication de courbe elliptique)

## 🚀 Solutions possibles

### Option 1: Trouver les primitives dans `orchard` crate
- `orchard` DOIT avoir ces fonctions en interne
- Chercher dans `orchard::keys` ou `orchard::primitives`

### Option 2: Utiliser `pasta_curves` directement
- `pasta_curves` est la base de `halo2_proofs`
- Peut-être compatible WASM?

### Option 3: Attendre réponse Discord
- Demander à l'équipe Zcash
- Peut-être qu'ils ont une solution WASM

## 📝 Prochaines étapes

1. ✅ Chercher dans la doc `orchard` pour key agreement
2. ✅ Tester `pasta_curves` pour compatibilité WASM
3. ⏳ Attendre réponse Discord/Forum
4. ❓ Envisager de créer un PR pour ajouter WASM support à `halo2_proofs`?

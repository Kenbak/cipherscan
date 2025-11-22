# 🔬 TEST: Validation des données compact de Lightwalletd

## Objectif

Vérifier que les données que notre backend envoie depuis Lightwalletd sont correctes et correspondent exactement à ce que `try_compact_note_decryption` attend.

## Données de test (Block 3656720)

```json
{
  "nullifier": "2c9e681c623faef04967633ae7f4e9d773ea20fe4852de9126d024b48a19830d",
  "cmx": "4da8ffd24a38e238beb3941ce6d77bc9f5eae9ad59c2339304e60c435bbda30c",
  "ephemeralKey": "94ae8f72a6840f38533fac6bc67a67614bffcb4b149ba7a434a84f8641cd8699",
  "ciphertext": "de888ec39aa2961150f9df6b17c8c0f7c2014603b76edaa028461c0f3e31a15087316d4e787b1608dace370f592b10868f319372"
}
```

## Checklist de validation

- [ ] Ciphertext = 52 bytes (104 hex chars) ✅
- [ ] CMX = 32 bytes (64 hex chars) ✅
- [ ] EphemeralKey = 32 bytes (64 hex chars) ✅
- [ ] Nullifier = 32 bytes (64 hex chars) ✅
- [ ] CMX est bien x-coordinate (Orchard), pas u-coordinate (Sapling) ✅
- [ ] Le même TX décrypte avec `try_note_decryption` (full TX) ✅

## Hypothèse actuelle

`try_compact_note_decryption` en WASM ne peut PAS fonctionner car :
1. L'API interne d'Orchard est privée (`pub(crate)`)
2. On ne peut pas accéder aux primitives cryptographiques nécessaires
3. Les exemples (Zkool2, MASP, ZingoLib) utilisent tous des crates **natifs** (pas WASM)

## Solutions possibles

### Option 1: Attendre Discord/Forum Zcash
- Demander à l'équipe si le compact decryption est supporté en WASM
- Peut-être qu'ils ont une solution qu'on ne voit pas

### Option 2: Hybrid Approach (Backend filter + Frontend decrypt)
- ❌ Viole le principe "fully client-side" du bounty Gemini

### Option 3: Fork + expose public API
- Fork `orchard` et exposer `EphemeralPublicKey::from_bytes` et `IncomingViewingKey::ka_agree_dec`
- ❌ Trop lourd et non maintenable

### Option 4: Utiliser un wallet existant WASM
- Voir si Zashi ou un autre wallet a déjà résolu ce problème
- Peut-être qu'ils ont un WASM module qu'on peut réutiliser

## Prochaine étape recommandée

**POSTER SUR LE FORUM ZCASH / DISCORD** en expliquant :
1. On essaie de faire un explorer client-side (bounty Gemini)
2. `try_note_decryption` fonctionne parfaitement
3. `try_compact_note_decryption` ne fonctionne jamais
4. L'API interne d'Orchard est privée, impossible de faire le décryptage manuel en WASM
5. Demander s'il y a une solution ou si le bounty est réalisable

Titre du post: "Orchard compact note decryption in WASM for client-side explorer - how?"

# 🔬 DEBUG: Vérification du CMX

Le plaintext décrypté donne `0x0d` et `0x29` au lieu de `0x01` ou `0x02`.

**Cela signifie que notre shared secret est INCORRECT !**

## Hypothèses

### 1. ❓ L'IVK n'est pas extrait correctement
Dans Zkool2, ils font:
```rust
let ivk_fq = Fq::from_repr(bb[32..64].try_into().unwrap()).unwrap();
```

Mais `IncomingViewingKey` d'Orchard 0.11 a peut-être une structure différente !

**Action:** Afficher les bytes de l'IVK pour voir sa structure

### 2. ❓ Le shared secret n'est pas calculé correctement
La multiplication `epk * ivk_fq` doit donner le bon point sur la courbe.

**Action:** Comparer avec ce que fait `try_compact_note_decryption` en interne

### 3. ❓ Le KDF n'est pas bon
Le BLAKE2b avec `Zcash_OrchardKDF` devrait être correct, mais peut-être qu'on ne hash pas dans le bon ordre ?

**Action:** Vérifier l'ordre des inputs du KDF

## Test de diagnostic

Ajoutons des logs dans notre WASM pour voir exactement ce qu'on a :

```rust
// Après avoir parsé ivk_fq
console::log_1(&format!("  ivk_fq bytes: {}", hex::encode(&ivk_fq.to_repr())).into());

// Après avoir parsé epk
console::log_1(&format!("  epk bytes: {}", hex::encode(&epk_point.to_bytes())).into());

// Après avoir calculé ka
console::log_1(&format!("  ka (shared secret) bytes: {}", hex::encode(&ka.to_bytes())).into());

// Après avoir dérivé la clé
console::log_1(&format!("  derived key: {}", hex::encode(key.as_bytes())).into());
```

## Solution probable

**On doit utiliser l'API INTERNE d'Orchard, mais elle est privée !**

Options:
1. **Fork orchard** et exposer les fonctions nécessaires
2. **Attendre Discord/Forum** pour demander de l'aide
3. **Utiliser un wallet WASM existant** (Zashi, etc.) qui a déjà résolu ce problème

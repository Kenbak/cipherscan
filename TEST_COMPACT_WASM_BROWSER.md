# 🧪 TEST: Compact Decryption WASM dans le Browser

## Données de test (Block 3656720)

```javascript
const testData = {
  nullifier: "2c9e681c623faef04967633ae7f4e9d773ea20fe4852de9126d024b48a19830d",
  cmx: "4da8ffd24a38e238beb3941ce6d77bc9f5eae9ad59c2339304e60c435bbda30c",
  ephemeralKey: "94ae8f72a6840f38533fac6bc67a67614bffcb4b149ba7a434a84f8641cd8699",
  ciphertext: "de888ec39aa2961150f9df6b17c8c0f7c2014603b76edaa028461c0f3e31a15087316d4e787b1608dace370f592b10868f319372",
  viewingKey: "uviewtest1eruekgghjgquag8avaxa62wuk7ym7skgjv4gevvpmztk8gpzsjr7vvqs7ce5prqfg85su43y5t6t3pz5m5l22sxvz5zz4am6c4q2fv22jcz79wl5n3alzw6zzzt04eca6t6m5ufe07vsaj3rcddyx74fhdqxkgl258wjx8a3nsxmujfde8n5net07df9xffu6m0xa25vldk36jgm0hnfln3df7vfd89xv096xf2ywjgw3lqp6lnncp8dz2zvkgmgmzq8az2rdl9xp7enugjkwr66wmg5jmzdfmp9ewusp9jdkerdcvgnua7npyzlypxhjqvu58ypaukneseda5a5cj43rsh35kaa7j0jarcrtqmk6ssp8nkv7eja5prrzlt2wp5uwu6c0tz9x09m30vyka6rhdgwrmev2cvvz8tdx0w8f8llh55u0ahc990e9fqk224y3cntz6hhamdrf7skqvanu4zaam0eca5jsldwmvz7dks34vkan5ug"
};
```

## Instructions

### 1. Aller sur la page `/decrypt`
```
http://localhost:3000/decrypt
```

### 2. Ouvrir la console du navigateur (F12)

### 3. Charger le WASM (si pas déjà chargé)
```javascript
const loadWasmModule = new Function('return import("/wasm/zcash_wasm.js")');
const wasmInit = await loadWasmModule();
await wasmInit.default();
```

### 4. Tester le compact decryption
```javascript
const testData = {
  nullifier: "2c9e681c623faef04967633ae7f4e9d773ea20fe4852de9126d024b48a19830d",
  cmx: "4da8ffd24a38e238beb3941ce6d77bc9f5eae9ad59c2339304e60c435bbda30c",
  ephemeralKey: "94ae8f72a6840f38533fac6bc67a67614bffcb4b149ba7a434a84f8641cd8699",
  ciphertext: "de888ec39aa2961150f9df6b17c8c0f7c2014603b76edaa028461c0f3e31a15087316d4e787b1608dace370f592b10868f319372",
  viewingKey: "uviewtest1eruekgghjgquag8avaxa62wuk7ym7skgjv4gevvpmztk8gpzsjr7vvqs7ce5prqfg85su43y5t6t3pz5m5l22sxvz5zz4am6c4q2fv22jcz79wl5n3alzw6zzzt04eca6t6m5ufe07vsaj3rcddyx74fhdqxkgl258wjx8a3nsxmujfde8n5net07df9xffu6m0xa25vldk36jgm0hnfln3df7vfd89xv096xf2ywjgw3lqp6lnncp8dz2zvkgmgmzq8az2rdl9xp7enugjkwr66wmg5jmzdfmp9ewusp9jdkerdcvgnua7npyzlypxhjqvu58ypaukneseda5a5cj43rsh35kaa7j0jarcrtqmk6ssp8nkv7eja5prrzlt2wp5uwu6c0tz9x09m30vyka6rhdgwrmev2cvvz8tdx0w8f8llh55u0ahc990e9fqk224y3cntz6hhamdrf7skqvanu4zaam0eca5jsldwmvz7dks34vkan5ug"
};

try {
  const result = wasmInit.decrypt_compact_output(
    testData.nullifier,
    testData.cmx,
    testData.ephemeralKey,
    testData.ciphertext,
    testData.viewingKey
  );
  console.log("✅ COMPACT DECRYPTION SUCCESS!", JSON.parse(result));
} catch (err) {
  console.log("❌ COMPACT DECRYPTION FAILED:", err.toString());
}
```

## Résultat attendu

**Si ça marche :**
```
🔍 [WASM] Starting FULLY MANUAL compact decryption with pasta_curves...
✅ [WASM] All inputs parsed
  🔓 Trying External scope...
  Decrypted plaintext, first byte: 0x01
✅ [WASM] MATCH FOUND with External scope!
✅ COMPACT DECRYPTION SUCCESS! { memo: "Match found (External)", amount: 0.3 }
```

**Si ça échoue :**
- Vérifier les logs dans la console
- Noter à quelle étape ça échoue
- Vérifier que le plaintext first byte est 0x01 ou 0x02

## Comparaison avec full TX decryption

Pour vérifier que c'est bien le même TX :

```javascript
// Full TX decryption (qui marche)
const fullTxHex = "FULL_TX_HEX_HERE"; // À récupérer de l'API
const fullResult = wasmInit.decrypt_memo(fullTxHex, testData.viewingKey);
console.log("Full TX result:", JSON.parse(fullResult));
```

Les deux devraient donner :
- Amount: 0.3 ZEC
- Memo: "Thanks for using testnet.ZecFaucet.com" (full TX only)

#!/usr/bin/env bash
# Root-only installation from reviewed artifacts; no dependency/build network access.
set -euo pipefail
umask 077
artifacts=${1:?artifacts directory}
release_id=${2:?release id}
network=${3:?mainnet or testnet}
[[ "$release_id" =~ ^[a-f0-9]{40}$ ]]
[[ "$network" == mainnet || "$network" == testnet ]]
[[ $(id -u) == 0 ]]
release="/opt/cipherscan-canary-releases/$release_id"
install -d -m 0755 "$release" /etc/cipherscan-canary
install -m 0755 "$artifacts/canaryctl" "$release/canaryctl"
install -m 0755 "$artifacts/cipherscan-host" "$release/cipherscan-host"
install -m 0644 "$artifacts/host.rs" "$release/host.rs"
install -m 0644 "$artifacts/upstream.json" "$release/upstream.json"
install -m 0644 "$artifacts/LICENSE.md" "$release/LICENSE.md"
install -m 0644 "$artifacts/config.json" /etc/cipherscan-canary/config.json
if [[ ! -e /etc/cipherscan-canary/seed ]]; then
  python3 - <<'PY'
import os, secrets, base64
fd = os.open('/etc/cipherscan-canary/seed', os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, 'wb') as f:
    f.write(base64.b64encode(secrets.token_bytes(32)))
PY
fi
ln -sfn "$release" /opt/cipherscan-canary
install -m 0644 "$artifacts/cipherscan-canary.service" /etc/systemd/system/cipherscan-canary.service
install -m 0644 "$artifacts/cipherscan-canary-watch.service" /etc/systemd/system/cipherscan-canary-watch.service
systemctl daemon-reload
systemctl enable cipherscan-canary.service
systemctl restart cipherscan-canary.service
for ((attempt=0; attempt<15; attempt++)); do
  if curl -fsS --max-time 2 http://127.0.0.1:3187/health >/dev/null; then break; fi
  sleep 1
done
if [[ ! -e /etc/cipherscan-canary/keys.json ]]; then
  "$release/canaryctl" save-canary-keys --canary-url http://127.0.0.1:3187 --skip-canary-attestation --allow-http --output /etc/cipherscan-canary/keys.json --json
  chmod 0644 /etc/cipherscan-canary/keys.json
fi
systemctl is-active cipherscan-canary.service
# Watcher intentionally remains disabled: an authorized receiver and secret are required.

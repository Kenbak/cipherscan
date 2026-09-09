#!/usr/bin/env bash
# Prepare an isolated, source-pinned evaluation. Does not install a service.
set -euo pipefail
umask 077
revision=c5a3761798f9c438944d235551ddd192df9c1915
here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
evaluation_dir=${1:?Usage: prepare.sh NEW_EVALUATION_DIRECTORY}
mkdir "$evaluation_dir"
evaluation_dir=$(cd "$evaluation_dir" && pwd)
git clone --no-checkout https://codeberg.org/caution/canary.git "$evaluation_dir/source"
git -C "$evaluation_dir/source" checkout --detach "$revision"
node "$here/config.mjs" --negative-control > "$evaluation_dir/canary.json"
mkdir "$evaluation_dir/state"
mkdir -p "$evaluation_dir/source/crates/canaryd/examples"
cp "$here/loopback.rs" "$evaluation_dir/source/crates/canaryd/examples/cipherscan-evaluate.rs"
export CARGO_HOME="$evaluation_dir/cargo"
export CARGO_TARGET_DIR="$evaluation_dir/target"
export CARGO_BUILD_JOBS=4
cd "$evaluation_dir/source"
cargo test --locked --workspace -- --test-threads=1 > "$evaluation_dir/tests.log" 2>&1
cargo build --locked -p canaryctl -p canaryd --example cipherscan-evaluate --bin canaryctl > "$evaluation_dir/build.log" 2>&1
printf 'Prepared evaluation in %s. Follow README.md to run and verify it.\n' "$evaluation_dir"

# Temporary patched braces fork

This private, MIT-licensed fork contains the runtime files from
`FSDevelop/braces` commit `d0d575e55e74a4e0218e5248fafb79efc3e54ebb`, the proposed
upstream security fix https://github.com/micromatch/braces/pull/72. It preserves
braces 3.0.3 APIs and adds a maximum parser/AST nesting depth of 100 to address
CVE-2026-93687 / GHSA-vfj7-8cjw-p6xm. No install hooks or remote fork dependency
are used. The package is named `@zecblock/braces` to distinguish this patched
source from the vulnerable published `braces` package, not to claim an upstream
fixed release. npm audit does not assess private fork code; our installed-path
and depth-bound regressions verify the actual patch in addition to the unchanged
audit of registry dependencies.

The root direct dev dependency and `$braces` override force micromatch/Next lint
usage to this checked-in source. Docker copies it before npm ci. No public API
imports this package. API development uses Node's built-in watch mode instead of
nodemon/chokidar, removing that separate vulnerable dependency path.

Remove this fork and override when an official fixed braces release is available
and normal/deep-pattern, lint, build and audit checks pass. Keep the upstream MIT
license and authorship attribution. The node/indexer monetary parser is unrelated.

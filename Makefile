# CipherScan - Zcash blockchain explorer
# Run `make help` to list available targets.

.DEFAULT_GOAL := help

# Sub-projects with their own package.json / build.
API_DIR        := server/api
INDEXER_DIR    := server/indexer
DECODER_DIR    := packages/zcash-decoder
WASM_DIR       := wasm
JOBS_DIR       := server/jobs

.PHONY: help
help: ## Ask for help!
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; \
		{printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'

# ---------------------------------------------------------------------------
# Setup / install
# ---------------------------------------------------------------------------

.PHONY: setup
setup: install ## Setup development environment (alias for install)

.PHONY: install
install: install-frontend install-api install-indexer install-decoder \
	install-jobs ## Install all dependencies (frontend, api, indexer, jobs)

.PHONY: install-frontend
install-frontend: ## Install frontend (Next.js) dependencies
	npm install

.PHONY: install-api
install-api: ## Install Express API backend dependencies
	cd $(API_DIR) && npm install

.PHONY: install-indexer
install-indexer: ## Install indexer dependencies
	cd $(INDEXER_DIR) && npm install

.PHONY: install-decoder
install-decoder: ## Install zcash-decoder package dependencies
	cd $(DECODER_DIR) && npm install

.PHONY: install-jobs
install-jobs: ## Install Python ML job dependencies
	cd $(JOBS_DIR) && pip install -r requirements.txt

# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------

.PHONY: build
build: build-wasm build-decoder build-frontend ## Build everything

.PHONY: build-frontend
build-frontend: ## Build the Next.js frontend
	npm run build

.PHONY: build-decoder
build-decoder: ## Build the zcash-decoder package
	cd $(DECODER_DIR) && npm run build

.PHONY: build-wasm
build-wasm: ## Build the Rust WASM module and copy to public/wasm
	cd $(WASM_DIR) && wasm-pack build --target web --release
	mkdir -p public/wasm
	cp $(WASM_DIR)/pkg/zcash_wasm.js public/wasm/
	cp $(WASM_DIR)/pkg/zcash_wasm_bg.wasm public/wasm/
	cp $(WASM_DIR)/pkg/zcash_wasm.d.ts public/wasm/

# ---------------------------------------------------------------------------
# Run (development)
# ---------------------------------------------------------------------------

.PHONY: dev
dev: ## Run the Next.js dev server
	npm run dev

.PHONY: dev-api
dev-api: ## Run the Express API backend (nodemon)
	cd $(API_DIR) && npm run dev

.PHONY: start
start: ## Run the production Next.js server (after `make build`)
	npm run start

.PHONY: start-api
start-api: ## Run the production Express API backend
	cd $(API_DIR) && npm start

# ---------------------------------------------------------------------------
# Lint / type-check
# ---------------------------------------------------------------------------

.PHONY: check
check: lint typecheck lint-shell ## Run all static checks

.PHONY: lint
lint: ## Lint the frontend (next lint)
	npm run lint

.PHONY: typecheck
typecheck: ## Type-check the frontend (tsc --noEmit)
	npx tsc --noEmit

.PHONY: lint-shell
lint-shell: ## Lint shell scripts with shellcheck
	@find . -name '*.sh' -not -path './node_modules/*' \
		-print0 | xargs -0 -r shellcheck --severity=warning

.PHONY: clippy
clippy: ## Run clippy on the WASM crate
	cd $(WASM_DIR) && cargo clippy \
		--target wasm32-unknown-unknown -- -D warnings

# ---------------------------------------------------------------------------
# Security audit
# ---------------------------------------------------------------------------

.PHONY: audit
audit: audit-npm audit-cargo audit-python ## Run all dependency audits

.PHONY: audit-npm
audit-npm: ## npm audit across all JS packages
	npm audit --audit-level=high || true
	cd $(API_DIR) && npm audit --audit-level=high || true
	cd $(INDEXER_DIR) && npm audit --audit-level=high || true
	cd $(DECODER_DIR) && npm audit --audit-level=high || true

.PHONY: audit-cargo
audit-cargo: ## cargo audit on the WASM crate (needs cargo-audit)
	cd $(WASM_DIR) && cargo audit

.PHONY: audit-python
audit-python: ## pip-audit on Python jobs (needs pip-audit)
	cd $(JOBS_DIR) && pip-audit -r requirements.txt

# ---------------------------------------------------------------------------
# Clean
# ---------------------------------------------------------------------------

.PHONY: clean
clean: ## Remove build artifacts
	rm -rf .next out
	rm -rf $(WASM_DIR)/pkg $(WASM_DIR)/target
	rm -rf $(DECODER_DIR)/dist

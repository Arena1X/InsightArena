.PHONY: build test clean smoke-test help

# Default target
help:
	@echo "InsightArena Contract Build & Test"
	@echo "===================================="
	@echo "Available targets:"
	@echo "  make build       - Build contract WASM"
	@echo "  make test        - Run unit tests"
	@echo "  make smoke-test  - Run testnet smoke tests"
	@echo "  make clean       - Clean build artifacts"

# Build contract
build:
	@echo "🏗️  Building contract..."
	cargo build --release --target wasm32-unknown-unknown

# Run unit tests
test:
	@echo "🧪 Running unit tests..."
	cargo test --lib

# Run smoke tests on testnet
smoke-test:
	@echo "🔥 Running smoke tests on Stellar Testnet..."
	@bash scripts/smoke_test.sh

# Clean build artifacts
clean:
	@echo "🧹 Cleaning build artifacts..."
	cargo clean

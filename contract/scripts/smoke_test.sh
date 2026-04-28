#!/bin/bash

set -e

# ── Configuration ─────────────────────────────────────────────────────────────

NETWORK="testnet"
NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
SOROBAN_RPC_URL="${SOROBAN_RPC_URL:-https://soroban-testnet.stellar.org}"
FRIENDBOT_URL="https://friendbot.stellar.org"

# Test identities
ADMIN_SECRET="${ADMIN_SECRET:-SBVGQAKXJIQNUSL4TYCOA7SXVM5QOWZBMSNC33RI33MCLEAN4UABZA3}"
USER1_SECRET="${USER1_SECRET:-SBZXF3Z3QL77RPB3SQLJLG2YBYCYVJQHLCHF2O2KXYJBNQG234OKZES}"
USER2_SECRET="${USER2_SECRET:-SBWABUWAB3SA6ITQ47OKNTG5MDYE6QTRZGCYVZI3XVST4XNLMBTOHWA}"

# Derive public keys
ADMIN_KEY=$(soroban keys address --secret-key "$ADMIN_SECRET" 2>/dev/null || echo "")
USER1_KEY=$(soroban keys address --secret-key "$USER1_SECRET" 2>/dev/null || echo "")
USER2_KEY=$(soroban keys address --secret-key "$USER2_SECRET" 2>/dev/null || echo "")

# ── Helper Functions ──────────────────────────────────────────────────────────

log_step() {
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📍 $1"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

log_pass() {
    echo "✅ PASS: $1"
}

log_fail() {
    echo "❌ FAIL: $1"
    exit 1
}

fund_account() {
    local account=$1
    echo "Funding account: $account"
    curl -s "$FRIENDBOT_URL?addr=$account" > /dev/null || log_fail "Failed to fund $account"
    sleep 2
}

# ── Step 1: Fund Test Wallets ─────────────────────────────────────────────────

log_step "Step 1: Fund Test Wallets via Friendbot"

fund_account "$ADMIN_KEY"
fund_account "$USER1_KEY"
fund_account "$USER2_KEY"

log_pass "Test wallets funded"

# ── Step 2: Build Contract ────────────────────────────────────────────────────

log_step "Step 2: Build Contract"

if [ ! -f "target/wasm32-unknown-unknown/release/insightarena_contract.wasm" ]; then
    cargo build --release --target wasm32-unknown-unknown 2>&1 | tail -5 || log_fail "Contract build failed"
fi

WASM_PATH="target/wasm32-unknown-unknown/release/insightarena_contract.wasm"
[ -f "$WASM_PATH" ] || log_fail "WASM file not found at $WASM_PATH"

log_pass "Contract built successfully"

# ── Step 3: Deploy Contract ───────────────────────────────────────────────────

log_step "Step 3: Deploy Contract"

CONTRACT_ID=$(soroban contract deploy \
    --wasm "$WASM_PATH" \
    --source-account "$ADMIN_KEY" \
    --network "$NETWORK" \
    --network-passphrase "$NETWORK_PASSPHRASE" \
    --rpc-url "$SOROBAN_RPC_URL" 2>&1 | grep -oP 'Contract ID: \K[A-Z0-9]+' || echo "")

[ -n "$CONTRACT_ID" ] || log_fail "Failed to deploy contract"

log_pass "Contract deployed: $CONTRACT_ID"

# ── Step 4: Initialize Contract ───────────────────────────────────────────────

log_step "Step 4: Initialize Contract"

soroban contract invoke \
    --id "$CONTRACT_ID" \
    --source-account "$ADMIN_KEY" \
    --network "$NETWORK" \
    --network-passphrase "$NETWORK_PASSPHRASE" \
    --rpc-url "$SOROBAN_RPC_URL" \
    -- initialize \
    --admin "$ADMIN_KEY" \
    --fee_bps 30 \
    --min_liquidity 1000 2>&1 | tail -3 || log_fail "Contract initialization failed"

log_pass "Contract initialized"

# ── Step 5: Create Market ─────────────────────────────────────────────────────

log_step "Step 5: Create Market"

MARKET_ID=$(soroban contract invoke \
    --id "$CONTRACT_ID" \
    --source-account "$ADMIN_KEY" \
    --network "$NETWORK" \
    --network-passphrase "$NETWORK_PASSPHRASE" \
    --rpc-url "$SOROBAN_RPC_URL" \
    -- create_market \
    --title "Test Market" \
    --outcomes '["YES", "NO"]' \
    --end_time 1800000000 \
    --resolution_time 1800000001 2>&1 | grep -oP 'market_id.*' | head -1 || echo "")

[ -n "$MARKET_ID" ] || log_fail "Failed to create market"

log_pass "Market created: $MARKET_ID"

# ── Step 6: Submit Predictions ────────────────────────────────────────────────

log_step "Step 6: Submit Predictions"

# User 1 predicts YES
soroban contract invoke \
    --id "$CONTRACT_ID" \
    --source-account "$USER1_KEY" \
    --network "$NETWORK" \
    --network-passphrase "$NETWORK_PASSPHRASE" \
    --rpc-url "$SOROBAN_RPC_URL" \
    -- submit_prediction \
    --market_id "$MARKET_ID" \
    --outcome 0 \
    --amount 1000000 2>&1 | tail -3 || log_fail "User 1 prediction failed"

log_pass "User 1 prediction submitted (YES, 1000000 stroops)"

# User 2 predicts NO
soroban contract invoke \
    --id "$CONTRACT_ID" \
    --source-account "$USER2_KEY" \
    --network "$NETWORK" \
    --network-passphrase "$NETWORK_PASSPHRASE" \
    --rpc-url "$SOROBAN_RPC_URL" \
    -- submit_prediction \
    --market_id "$MARKET_ID" \
    --outcome 1 \
    --amount 500000 2>&1 | tail -3 || log_fail "User 2 prediction failed"

log_pass "User 2 prediction submitted (NO, 500000 stroops)"

# ── Step 7: Resolve Market ────────────────────────────────────────────────────

log_step "Step 7: Resolve Market"

soroban contract invoke \
    --id "$CONTRACT_ID" \
    --source-account "$ADMIN_KEY" \
    --network "$NETWORK" \
    --network-passphrase "$NETWORK_PASSPHRASE" \
    --rpc-url "$SOROBAN_RPC_URL" \
    -- resolve_market \
    --market_id "$MARKET_ID" \
    --outcome 0 2>&1 | tail -3 || log_fail "Market resolution failed"

log_pass "Market resolved (outcome: YES)"

# ── Step 8: Claim Payouts ─────────────────────────────────────────────────────

log_step "Step 8: Claim Payouts"

PAYOUT=$(soroban contract invoke \
    --id "$CONTRACT_ID" \
    --source-account "$USER1_KEY" \
    --network "$NETWORK" \
    --network-passphrase "$NETWORK_PASSPHRASE" \
    --rpc-url "$SOROBAN_RPC_URL" \
    -- claim_payout \
    --market_id "$MARKET_ID" 2>&1 | grep -oP 'payout.*' | head -1 || echo "")

[ -n "$PAYOUT" ] || log_fail "Payout claim failed"

log_pass "User 1 payout claimed: $PAYOUT"

# ── Step 9: Verify Final Balances ─────────────────────────────────────────────

log_step "Step 9: Verify Final Balances"

USER1_BALANCE=$(soroban contract invoke \
    --id "$CONTRACT_ID" \
    --source-account "$USER1_KEY" \
    --network "$NETWORK" \
    --network-passphrase "$NETWORK_PASSPHRASE" \
    --rpc-url "$SOROBAN_RPC_URL" \
    -- get_balance \
    --user "$USER1_KEY" 2>&1 | grep -oP '\d+' | tail -1 || echo "0")

USER2_BALANCE=$(soroban contract invoke \
    --id "$CONTRACT_ID" \
    --source-account "$USER2_KEY" \
    --network "$NETWORK" \
    --network-passphrase "$NETWORK_PASSPHRASE" \
    --rpc-url "$SOROBAN_RPC_URL" \
    -- get_balance \
    --user "$USER2_KEY" 2>&1 | grep -oP '\d+' | tail -1 || echo "0")

log_pass "User 1 balance: $USER1_BALANCE stroops"
log_pass "User 2 balance: $USER2_BALANCE stroops"

# ── Final Result ──────────────────────────────────────────────────────────────

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 Smoke test PASSED - All steps completed successfully!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Summary:"
echo "  Contract ID: $CONTRACT_ID"
echo "  Market ID: $MARKET_ID"
echo "  User 1 Final Balance: $USER1_BALANCE stroops"
echo "  User 2 Final Balance: $USER2_BALANCE stroops"
echo ""

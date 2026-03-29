# InsightArena Smart Contract — Security Audit Checklist

**Contract:** InsightArena Prediction Market
**Network target:** Stellar Mainnet (Protocol 22)
**SDK version:** soroban-sdk 22.0.0
**Audit date:** 2026-03-28
**Prepared by:** Internal engineering team

---

## How to read this document

| Symbol | Meaning |
|--------|---------|
| ✅ Pass | Control is present and correct |
| ❌ Fail | Control is absent or broken |
| ⚠️ Review Needed | Control exists but has a known limitation or requires external verification |

---

## 1. Authentication

Every mutating function must call `require_auth()` on the correct caller before touching state.

| # | Item | Status | Reference |
|---|------|--------|-----------|
| 1.1 | `lock_stake` calls `from.require_auth()` before transferring tokens into escrow | ✅ Pass | `src/escrow.rs:35` |
| 1.2 | `claim_payout` requires predictor auth before releasing funds | ✅ Pass | `src/prediction.rs` — predictor auth enforced via `lock_stake` and direct check |
| 1.3 | `create_market` calls `creator.require_auth()` | ✅ Pass | `src/market.rs` |
| 1.4 | `generate_invite_code` calls `creator.require_auth()` | ✅ Pass | `src/invite.rs` |
| 1.5 | `redeem_invite_code` calls `invitee.require_auth()` | ✅ Pass | `src/invite.rs` |
| 1.6 | `revoke_invite_code` calls `creator.require_auth()` | ✅ Pass | `src/invite.rs` |
| 1.7 | `create_proposal` calls `proposer.require_auth()` | ✅ Pass | `src/governance.rs` |
| 1.8 | `vote` calls `voter.require_auth()` | ✅ Pass | `src/governance.rs` |
| 1.9 | `raise_dispute` calls `disputer.require_auth()` (via `escrow::lock_stake`) | ✅ Pass | `src/dispute.rs` + `src/escrow.rs:35` |
| 1.10 | `resolve_market` calls `oracle.require_auth()` as the very first guard | ✅ Pass | `src/oracle.rs:31` |

---

## 2. Authorization

Admin-only functions must verify the caller matches `config.admin`, not just that `require_auth()` was satisfied.

| # | Item | Status | Reference |
|---|------|--------|-----------|
| 2.1 | `update_protocol_fee` loads Config and calls `config.admin.require_auth()` | ✅ Pass | `src/config.rs:122` |
| 2.2 | `set_paused` and `transfer_admin` call `config.admin.require_auth()` | ✅ Pass | `src/config.rs:149, 165` |
| 2.3 | `transfer_fee` verifies `admin == cfg.admin` after `require_auth()` (dual check) | ✅ Pass | `src/escrow.rs:226–229` |
| 2.4 | `resolve_dispute` verifies caller is stored admin | ✅ Pass | `src/dispute.rs` |
| 2.5 | `create_season` and `finalize_season` require admin auth | ✅ Pass | `src/season.rs` |
| 2.6 | `add_category` and `remove_category` require admin auth | ✅ Pass | `src/market.rs` |
| 2.7 | `resolve_market` verifies `oracle == cfg.oracle_address` after `require_auth()` | ✅ Pass | `src/oracle.rs:35–37` |
| 2.8 | `update_protocol_fee_from_governance` bypasses direct auth — safe only if `execute_proposal` enforces auth upstream | ⚠️ Review Needed | `src/config.rs:131` — no standalone auth guard; private helper path |
| 2.9 | `update_oracle_from_governance` bypasses direct auth — same pattern as 2.8 | ⚠️ Review Needed | `src/oracle.rs:83` |
| 2.10 | Admin key is a single address with no multi-sig or timelock | ⚠️ Review Needed | `src/config.rs:18` — single-admin model; recommend governance upgrade path before mainnet |

---

## 3. Input Validation

All numeric inputs must have range checks. Empty strings, zero-length lists, and out-of-range values must be rejected before state changes.

| # | Item | Status | Reference |
|---|------|--------|-----------|
| 3.1 | `lock_stake` rejects `amount <= 0` before any state change | ✅ Pass | `src/escrow.rs:30–33` |
| 3.2 | `refund` and `release_payout` reject `amount <= 0` | ✅ Pass | `src/escrow.rs:63, 90` |
| 3.3 | `create_market` validates `end_time > start_time` and `resolution_time >= end_time` | ✅ Pass | `src/market.rs` — `InvalidTimeRange` returned on violation |
| 3.4 | `create_market` validates `creator_fee_bps <= max_creator_fee_bps` (500 bps cap) | ✅ Pass | `src/market.rs` — `InvalidFee` returned on violation |
| 3.5 | `submit_prediction` validates stake against `min_stake` and `max_stake` | ✅ Pass | `src/prediction.rs` — `StakeTooLow` / `StakeTooHigh` returned |
| 3.6 | `submit_prediction` validates `chosen_outcome` is in `outcome_options` | ✅ Pass | `src/prediction.rs` — `InvalidOutcome` returned |
| 3.7 | `resolve_market` validates `resolved_outcome` is in `outcome_options` | ✅ Pass | `src/oracle.rs:54–56` |
| 3.8 | `initialize` is guarded against re-initialization | ✅ Pass | `src/config.rs:65–67` — `AlreadyInitialized` returned |
| 3.9 | `transfer_fee` rejects `amount <= 0` and validates treasury balance before transfer | ✅ Pass | `src/escrow.rs:221–233` |
| 3.10 | `create_market` may not explicitly reject a zero-length `outcome_options` list | ⚠️ Review Needed | `src/market.rs` — verify an empty outcomes vector is caught before market is persisted |

---

## 4. Arithmetic Safety

All arithmetic on financial values must use `checked_*` operations. The release profile must have `overflow-checks = true`.

| # | Item | Status | Reference |
|---|------|--------|-----------|
| 4.1 | Stake accumulation uses `checked_add` — returns `Overflow` on failure | ✅ Pass | `src/prediction.rs` — pool and participant count accumulation |
| 4.2 | Payout calculation uses `checked_mul` and `checked_div` for proportional share | ✅ Pass | `src/prediction.rs` — `(stake * loser_pool) / winning_pool` pattern |
| 4.3 | Fee calculations use `checked_mul` divided by `10_000` (BIPS_BASE) | ✅ Pass | `src/prediction.rs` — `(gross * bps) / 10_000` |
| 4.4 | Season reward distribution uses `checked_mul` and `checked_div` | ✅ Pass | `src/season.rs` — proportional pool distribution |
| 4.5 | Governance vote counts use `checked_add` | ✅ Pass | `src/governance.rs` |
| 4.6 | Treasury balance subtraction in `transfer_fee` uses `checked_sub` | ✅ Pass | `src/escrow.rs:245–247` |
| 4.7 | `assert_escrow_solvent` accumulates unclaimed stakes with `checked_add` | ✅ Pass | `src/escrow.rs:170–172` |
| 4.8 | Cargo release profile has `overflow-checks = true` for runtime protection | ✅ Pass | `Cargo.toml` — `[profile.release] overflow-checks = true` |
| 4.9 | `add_to_treasury_balance` uses `.expect("treasury balance overflow")` instead of `ok_or(Overflow)?` | ❌ Fail | `src/escrow.rs:197–199` — panics instead of returning `InsightArenaError::Overflow` |
| 4.10 | Non-critical counters use `saturating_add/sub` (analytics, reputation) — acceptable for non-financial fields | ✅ Pass | `src/reputation.rs`, `src/analytics.rs` |

---

## 5. Reentrancy

Cross-contract calls (token transfers) must be protected against reentrancy via a guard that prevents recursive entry.

| # | Item | Status | Reference |
|---|------|--------|-----------|
| 5.1 | `lock_stake` acquires `EscrowLock` in temporary storage before calling token transfer | ✅ Pass | `src/escrow.rs:28` + `src/security.rs:9–15` |
| 5.2 | `refund` acquires `EscrowLock` before calling token transfer | ✅ Pass | `src/escrow.rs:61` |
| 5.3 | `release_payout` acquires `EscrowLock` before calling token transfer | ✅ Pass | `src/escrow.rs:88` |
| 5.4 | `EscrowLock` is stored in temporary storage — auto-expires per ledger, no persistent leak | ✅ Pass | `src/security.rs:14` — `env.storage().temporary()` |
| 5.5 | Lock is released in all error paths before returning `Err` | ✅ Pass | `src/escrow.rs:31–33, 63–65, 98–101` — release before each early return |
| 5.6 | `transfer_fee` does not acquire `EscrowLock` before token transfer | ⚠️ Review Needed | `src/escrow.rs:243` — admin-only function lacks the reentrancy guard applied to user-facing transfers |
| 5.7 | Reentrancy guard is exercised by `test_simulate_reentrant_call` in tests | ✅ Pass | `src/security.rs:25–31` — double-lock rejection confirmed |

---

## 6. Storage Lifecycle

Every persistent entry must have TTL extension on creation and on access. No entry may be silently archived without a restoration path.

| # | Item | Status | Reference |
|---|------|--------|-----------|
| 6.1 | `Market` entries extend TTL on creation and on every read via `extend_market_ttl` | ✅ Pass | `src/ttl.rs:20–26`, `src/market.rs` |
| 6.2 | `Prediction` entries extend TTL on creation and on every update | ✅ Pass | `src/ttl.rs:28–34` |
| 6.3 | Claimed `Prediction` entries transition to a short 7-day TTL via `shorten_prediction_ttl_after_claim` | ✅ Pass | `src/ttl.rs:36–42` |
| 6.4 | `User` profiles extend TTL on every update (~90 days) | ✅ Pass | `src/ttl.rs:44–50` |
| 6.5 | `Config` extends TTL on every read and write (~1 year) | ✅ Pass | `src/config.rs:39–41`, `src/ttl.rs:60–66` |
| 6.6 | `Season` and `Leaderboard` extend TTL on access (~1 year) | ✅ Pass | `src/ttl.rs:68–86` |
| 6.7 | `InviteCode` extends TTL on creation and redemption (~7 days) | ✅ Pass | `src/ttl.rs:52–58` |
| 6.8 | `Treasury` balance extends TTL on every write via `bump_treasury` | ✅ Pass | `src/escrow.rs:8–14` |
| 6.9 | Instance storage (`Categories`) extends TTL on initialization | ✅ Pass | `src/config.rs:85–87` |
| 6.10 | `PlatformVolume`, `CreatorStats`, `MarketCount`, `SeasonCount` TTL management not covered by a dedicated `extend_*` helper | ⚠️ Review Needed | `src/analytics.rs` — verify these counters bump TTL on every write |

---

## 7. Event Completeness

Every state-changing operation must emit a contract event so off-chain indexers can reconstruct full platform state.

| # | Item | Status | Reference |
|---|------|--------|-----------|
| 7.1 | `create_market` emits `MarketCreated` event | ✅ Pass | `src/market.rs` — `emit_market_created` |
| 7.2 | `resolve_market` emits `MarketResolved` event | ✅ Pass | `src/oracle.rs:75` — `emit_market_resolved` |
| 7.3 | `cancel_market` emits `MarketCancelled` event | ✅ Pass | `src/market.rs` — `emit_market_cancelled` |
| 7.4 | `submit_prediction` emits `PredictionSubmitted` event | ✅ Pass | `src/prediction.rs` — `emit_prediction_submitted` |
| 7.5 | `claim_payout` emits `PayoutClaimed` event with net amount and fees | ✅ Pass | `src/prediction.rs` — `emit_payout_claimed` |
| 7.6 | `raise_dispute` emits `DisputeRaised` event | ✅ Pass | `src/dispute.rs` — `emit_dispute_raised` |
| 7.7 | `resolve_dispute` emits `DisputeResolved` event | ✅ Pass | `src/dispute.rs` — `emit_dispute_resolved` |
| 7.8 | `generate_invite_code` emits `InviteCodeGenerated` event | ✅ Pass | `src/invite.rs` |
| 7.9 | `redeem_invite_code` emits `InviteCodeRedeemed` event | ✅ Pass | `src/invite.rs` |
| 7.10 | `revoke_invite_code` emits `InviteCodeRevoked` event | ✅ Pass | `src/invite.rs` |
| 7.11 | `execute_proposal` emits `ProposalExecuted` event | ✅ Pass | `src/governance.rs` |
| 7.12 | `close_market` emits `MarketClosed` event | ✅ Pass | `src/market.rs` |
| 7.13 | `add_to_treasury_balance` emits no event — treasury mutations are not auditable off-chain | ⚠️ Review Needed | `src/escrow.rs:186–204` — consider adding a `TreasuryUpdated` event |

---

## 8. Error Handling

No `unwrap()`, `expect()`, or `panic!()` in production code paths. All errors must be surfaced via `InsightArenaError`.

| # | Item | Status | Reference |
|---|------|--------|-----------|
| 8.1 | All functions return `Result<T, InsightArenaError>` — no silent panics on the happy path | ✅ Pass | `src/errors.rs` — 32-variant error enum covers all failure cases |
| 8.2 | Storage reads use `.ok_or(InsightArenaError::NotFound)` or `.unwrap_or(default)` — no bare `.unwrap()` | ✅ Pass | Consistent pattern across all modules |
| 8.3 | No bare `.unwrap()` calls on user-controlled data | ✅ Pass | Codebase-wide review found no instances |
| 8.4 | `get_contract_balance` uses `.expect("contract must be initialized")` — justifiable but does not return `Result` | ⚠️ Review Needed | `src/escrow.rs:117` — converting to `Result` would improve auditability |
| 8.5 | `add_to_treasury_balance` uses `.expect("treasury balance overflow")` — must return `InsightArenaError::Overflow` | ❌ Fail | `src/escrow.rs:199` — use `.ok_or(InsightArenaError::Overflow)?` and propagate |
| 8.6 | Checked arithmetic failures return `InsightArenaError::Overflow` consistently elsewhere | ✅ Pass | `src/prediction.rs`, `src/season.rs` — `.ok_or(InsightArenaError::Overflow)?` pattern |
| 8.7 | `#[should_panic]` confined to test modules only — no production `panic!()` | ✅ Pass | Test files only |
| 8.8 | `ensure_not_paused` called at the top of all user-facing entry points | ✅ Pass | `src/config.rs:183` — called in `src/lib.rs` dispatch |

---

## 9. Escrow Integrity

The contract's XLM balance must always be ≥ the sum of all unclaimed stakes. This invariant must hold after every transfer.

| # | Item | Status | Reference |
|---|------|--------|-----------|
| 9.1 | `assert_escrow_solvent` computes `total_unclaimed_stakes` from live storage and compares to token balance | ✅ Pass | `src/escrow.rs:128–183` |
| 9.2 | `assert_escrow_solvent` queries the XLM token contract directly, not a mirrored counter | ✅ Pass | `src/escrow.rs:179` — `get_contract_balance` calls `token::Client::balance` |
| 9.3 | `release_payout` checks `contract_balance >= amount` before transfer | ✅ Pass | `src/escrow.rs:99–101` |
| 9.4 | `refund` checks `contract_balance >= amount` before transfer | ✅ Pass | `src/escrow.rs:72–74` |
| 9.5 | `transfer_fee` checks both `treasury_balance >= amount` and `contract_balance >= amount` | ✅ Pass | `src/escrow.rs:231–241` |
| 9.6 | Market `total_pool` is incremented atomically with token transfer via `checked_add` | ✅ Pass | `src/prediction.rs` — pool update and transfer in same invocation |
| 9.7 | Cancelled markets iterate all predictors and refund each stake individually | ✅ Pass | `src/market.rs` — `cancel_market` uses `PredictorList` for full iteration |
| 9.8 | Treasury counter and actual token balance may diverge if creator fees are added separately | ⚠️ Review Needed | `src/escrow.rs:186` — ensure treasury counter never exceeds actual balance in a multi-market scenario |
| 9.9 | `payout_claimed` flag is set to `true` and persisted before payout release, preventing double-claim | ✅ Pass | `src/prediction.rs` — flag persisted before `release_payout` call |
| 9.10 | `cancel_market` and `assert_escrow_solvent` use unbounded iteration — large markets may exhaust compute budget | ⚠️ Review Needed | `src/market.rs`, `src/escrow.rs:138–177` — add `max_participants` cap or pagination |

---

## 10. Oracle Trust

The oracle address must be validated on every resolution call. Oracle updates must be gated by governance.

| # | Item | Status | Reference |
|---|------|--------|-----------|
| 10.1 | `resolve_market` verifies `oracle == cfg.oracle_address` after `require_auth()` | ✅ Pass | `src/oracle.rs:34–37` |
| 10.2 | Oracle address is stored in `Config` (persistent, TTL-managed) | ✅ Pass | `src/config.rs:28` |
| 10.3 | Oracle cannot resolve a market before `resolution_time` | ✅ Pass | `src/oracle.rs:43–46` |
| 10.4 | Oracle cannot resolve an already-resolved market | ✅ Pass | `src/oracle.rs:48–51` |
| 10.5 | Oracle cannot resolve with an outcome not in `outcome_options` | ✅ Pass | `src/oracle.rs:53–56` |
| 10.6 | Oracle address can only be changed via `update_oracle_from_governance` (requires governance vote) | ✅ Pass | `src/oracle.rs:83` — no direct admin setter |
| 10.7 | Single trusted oracle address — no multi-oracle consensus or fallback mechanism | ⚠️ Review Needed | `src/config.rs:28` — single oracle is a centralization risk |
| 10.8 | Oracle compromise allows incorrect resolution of all open markets; dispute mechanism relies on admin | ⚠️ Review Needed | Architecture — admin is sole arbitration authority; recommend oracle rotation or delay |
| 10.9 | No on-chain data feed integration — oracle is a trusted Stellar account keypair | ⚠️ Review Needed | `src/oracle.rs` — off-chain oracle model; data integrity relies entirely on the operator |
| 10.10 | `resolve_market` does not enforce the oracle to be a contract address vs a plain account | ⚠️ Review Needed | `src/oracle.rs:31` — any keypair matching `cfg.oracle_address` can call `resolve_market` |

---

## Known Limitations

The following are intentional design tradeoffs. They do not constitute exploitable vulnerabilities but must be disclosed in any external audit engagement.

### L-1: Single Admin Key
`config.admin` is the sole privileged account. There is no multi-signature requirement or timelock on admin operations. A compromised admin key allows fee manipulation, market cancellation, treasury withdrawal, and oracle replacement (via governance execution).
**Mitigation:** Transfer admin to a multi-sig wallet or governance contract before mainnet launch.

### L-2: Single Trusted Oracle
Market resolution relies on a single `oracle_address`. The dispute mechanism allows admin override, but the admin and oracle could be controlled by the same party.
**Mitigation:** Use a decentralized oracle solution or implement an independent dispute arbitration council.

### L-3: Unbounded Iteration in Batch Operations
`cancel_market` iterates all addresses in `PredictorList`, and `assert_escrow_solvent` iterates all markets and predictors. Extremely large markets could exhaust Soroban compute budget.
**Mitigation:** Implement pagination for batch operations; add a `max_participants` cap per market.

### L-4: Treasury Overflow Uses `expect` Not `Result`
`add_to_treasury_balance` at `src/escrow.rs:199` uses `.expect("treasury balance overflow")` instead of `ok_or(InsightArenaError::Overflow)?`. This causes an unhandled panic rather than a recoverable error.
**Mitigation:** Replace with `.ok_or(InsightArenaError::Overflow)?` — a one-line fix.

### L-5: Governance Helper Functions Have No Direct Auth Guard
`update_protocol_fee_from_governance` and `update_oracle_from_governance` contain no `require_auth()` call and rely solely on their caller (`execute_proposal`) enforcing authorization. A future refactor calling these helpers directly would bypass all auth.
**Mitigation:** Restrict to `pub(crate)` visibility or add an explicit internal-caller guard.

### L-6: Reentrancy Error Reuses `Paused` Error Code
`acquire_escrow_lock` returns `InsightArenaError::Paused` (code 101) when a reentrant call is detected. This is semantically incorrect — the contract is not paused, it is reentered.
**Mitigation:** Add a dedicated `Reentrancy = 103` error variant.

### L-7: Off-Chain Oracle Data Integrity
The contract trusts the oracle operator to supply correct real-world outcomes. No on-chain verifiable data feed is integrated.
**Mitigation:** Document the oracle data sourcing methodology; evaluate integrating a verifiable feed before high-value markets go live.

---

## Third-Party Audit Firm Recommendations

The following firms have demonstrated expertise in Soroban / Stellar smart contract auditing and Rust-based blockchain security:

| Firm | Relevant Expertise |
|------|--------------------|
| **OtterSec** | Soroban, Rust, DeFi protocol audits; audited multiple Stellar ecosystem projects |
| **Trail of Bits** | Deep Rust expertise, formal verification tooling, DeFi audits |
| **Halborn Security** | Blockchain security, smart contract audits, Stellar ecosystem experience |
| **Certik** | Automated + manual audit pipeline, formal verification, broad DeFi coverage |
| **Kudelski Security** | Cryptographic protocol review, Rust security, institutional-grade reports |

**Recommended scope for external engagement:**
1. Full source code review of all Rust modules in `src/` (~6,500 LOC)
2. Economic attack modeling: stake manipulation, oracle front-running, fee extraction
3. Formal verification of the escrow solvency invariant (`assert_escrow_solvent`)
4. Compute budget analysis for unbounded iteration paths
5. Review of governance execution flow for privilege escalation vectors

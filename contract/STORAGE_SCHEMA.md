# Storage Schema

This document summarizes Soroban storage layout for InsightArena.

## Namespaces (Logical)
- Config: global contract configuration and network settings
- Market: market metadata and lifecycle state
- Prediction: user prediction records tied to markets
- Escrow: pooled stake balances and payout accounting
- Leaderboard/Reputation: points, standings, and derived scoring values
- Season: season boundaries and active season references
- TTL: storage lifetime extension and archival helpers

## Source of Truth
Primary storage key/value definitions and helpers are implemented in:
- src/storage_types.rs
- src/ttl.rs
- related domain modules under src/

## Notes
- Keep key formats stable across upgrades
- Any schema-affecting changes should include migration notes and tests

# Security Audit Notes

This document tracks security-focused checks for the InsightArena Soroban contract.

## Scope
- Access control and authorization paths
- Escrow and payout invariants
- Storage key and TTL safety
- Oracle and market resolution trust boundaries

## Current Status
- Continuous internal review during feature work
- Expand with formal external audit findings before production mainnet deployment

## High-Level Checklist
- Verify signer and role checks in governance and admin paths
- Ensure market resolution is one-way and idempotent
- Confirm payout cannot be claimed twice
- Validate prediction stake/accounting updates cannot underflow/overflow
- Keep contract upgrades and migration logic explicitly gated

# InsightArena Contract Security Audit Notes

This file is a placeholder for the contract security audit reference mentioned in `CONTRIBUTING.md`.

The primary security model for the contract is documented in `ARCHITECTURE.md` under the Security Model section. That documentation covers:

- reentrancy protection via `DataKey::EscrowLock`
- admin-only function guards
- oracle-only market resolution
- the contract pause mechanism
- storage TTL strategy and temporary lock usage

A formal audit report or further security notes can be added here as the project matures.

# Market Settlement & Resolution Guidelines
## Issue #2094

### Overview
This document specifies the market settlement process, including resolution validation, payout calculation, and dispute handling to ensure accurate and fair market closure.

### Settlement States

Markets progress through the following states during settlement:

```
OPEN
  ↓
PREDICTION_WINDOW_CLOSED
  ↓
PENDING_RESOLUTION
  ↓
PENDING_VERIFICATION (optional, if dispute flagged)
  ↓
RESOLVED
  ↓
SETTLED (payouts distributed)
```

### Resolution Timeline

| Phase | Duration | Action |
|-------|----------|--------|
| Prediction Open | Until deadline | Users submit predictions |
| Pending Resolution | 0-24 hours | Oracle fetches and validates result |
| Verification Window | 24-48 hours | Community can dispute if needed |
| Settlement | 1-6 hours | Payouts calculated and distributed |

### Resolution Sources

Markets pull outcome data from two independent sources to prevent single-point-of-failure corruption:

```typescript
interface ResolutionData {
  primarySource: {
    provider: 'ESPN' | 'CoinGecko' | 'CustomAPI',
    result: string,
    timestamp: Date,
    confidence: number, // 0-1
  },
  secondarySource: {
    provider: string,
    result: string,
    timestamp: Date,
    confidence: number,
  },
  consensus: boolean, // true if both sources agree
  resolvedAt: Date,
}
```

### Validation Checklist

Before moving market to `RESOLVED`:

- ✅ Prediction window has closed
- ✅ Outcome data received from both sources
- ✅ Both sources agree on result (or primary source has >0.95 confidence)
- ✅ No active disputes or dispute resolution period has expired
- ✅ Smart contract escrow is ready to distribute payouts
- ✅ All payout calculations are correct
- ✅ Settlement is not blocked by maintenance or circuit breaker

### Payout Calculation

#### Correct Outcome Predictions
```
Payout = Wager × (Total Pool / Correct Bets) × Platform Fee Multiplier
```

Example:
- Total pool: 1000 XLM
- Correct predictions: 100 XLM total wagered
- Your wager: 10 XLM
- Platform fee: 2%

Calculation:
```
Payout = 10 × (1000 / 100) × (1 - 0.02)
       = 10 × 10 × 0.98
       = 98 XLM
```

#### Incorrect Outcome Predictions
```
Payout = 0 XLM (no recovery)
```

#### Platform Distribution
```
Fee Pool = Total Pool × Platform Fee %
Allocated to:
  - Liquidity reserves: 40%
  - Creator rewards: 30%
  - AI training: 20%
  - Treasury: 10%
```

### Settlement Errors & Recovery

| Error | Severity | Recovery |
|-------|----------|----------|
| Duplicate outcomes from sources | HIGH | Manual investigation, use primary if high confidence |
| Network latency during settlement | MEDIUM | Retry with exponential backoff, max 5 retries |
| Insufficient escrow balance | CRITICAL | Halt settlement, alert admin, investigate blockchain state |
| Payout calculation overflow | CRITICAL | Audit calculation logic, use arbitrary precision math |
| Disputed outcome | HIGH | Enter verification, resolve via arbiter |

### Dispute Handling

If market outcome is disputed within verification window:

1. **Dispute flagged**: Market state becomes `PENDING_VERIFICATION`
2. **Arbiter review**: Assigned arbiter examines evidence
3. **Resolution**: Arbiter selects correct outcome or voids market
4. **Settlement**: Payouts recalculated with corrected outcome

```typescript
interface DisputeResolution {
  disputeId: string,
  arbiterId: string,
  decision: 'CORRECT' | 'INCORRECT' | 'VOID',
  reasoning: string,
  resolvedAt: Date,
}
```

### Settlement Process Pseudocode

```typescript
async settleMarket(marketId: string) {
  // 1. Validate market is ready
  const market = await this.getMarket(marketId);
  if (!this.isReadyForSettlement(market)) {
    throw new Error('Market not ready');
  }

  // 2. Verify outcome consensus
  const resolution = await this.getResolution(marketId);
  if (!resolution.consensus && resolution.primarySource.confidence < 0.95) {
    throw new Error('Outcome not confident');
  }

  // 3. Check for active disputes
  if (await this.hasActiveDisputes(marketId)) {
    throw new Error('Disputes pending resolution');
  }

  // 4. Calculate payouts
  const payouts = await this.calculatePayouts(marketId, resolution);

  // 5. Verify payout calculations
  if (!this.verifyPayoutIntegrity(payouts, market)) {
    throw new Error('Payout calculation error');
  }

  // 6. Submit to escrow
  const txHash = await this.sorobanService.settlePayout(payouts);

  // 7. Record settlement
  await this.updateMarketState(marketId, 'SETTLED', { txHash });

  // 8. Emit event for UI
  this.eventEmitter.emit('market.settled', { marketId, txHash });
}
```

### Monitoring & Alerts

Alert conditions:

- ⚠️ Market unresolved after expected settlement time
- 🔴 Multiple failed settlement attempts
- 🔴 Payout total doesn't equal pool + fees
- 🔴 Escrow transaction failed
- ⚠️ Dispute raised after settlement

### Related Issues
- Dispute arbiter double-vote prevention
- Market resolution challenge window enforcement
- Leaderboard cache invalidation on settlement
- Trending markets computation post-settlement

### See Also
- `/backend/src/markets/markets.service.ts`
- `/backend/src/soroban/soroban.service.ts`
- `/backend/API_REFERENCE.md` - Market endpoints
- Smart contract: `settlement.rs`

# Prediction Validation Guidelines
## Issue #2098

### Overview
This document outlines validation requirements for user predictions to ensure data integrity, prevent abuse, and maintain fair market conditions.

### Validation Layers

#### 1. Input Validation
- **Prediction value**: Must be numeric, between 0 and 1 (inclusive) representing probability
- **Market ID**: Must exist and be active
- **User address**: Must be valid Stellar address format
- **Timestamp**: Must be within market's prediction window (before deadline)
- **Amount wagered**: Must be positive, not exceed user's balance

```typescript
// Example validation
if (!prediction.value || prediction.value < 0 || prediction.value > 1) {
  throw new BadRequestException('Prediction value must be between 0 and 1');
}
```

#### 2. Business Logic Validation
- **Market status**: Must be `OPEN` or `PENDING_RESOLUTION`
- **Deadline check**: Current time must be before market prediction deadline
- **User eligibility**: User must not be banned, suspended, or rate-limited
- **Duplicate check**: User should not submit duplicate predictions on same market within short timeframe
- **Balance verification**: User's balance must cover the wager amount

#### 3. Market-Specific Rules
- **Private markets**: User must have invite code or be market creator
- **League markets**: User's team must be eligible to compete
- **Restricted markets**: Apply geolocation or KYC requirements if needed

### Validation Sequence

1. **Synchronous checks** (execute first, fail fast)
   - Input format validation
   - Stellar address format
   - Numeric range checks

2. **Database queries** (execute second)
   - User existence and status
   - Market existence and status
   - User balance verification

3. **Rate limiting** (execute third, after business checks)
   - Check user's prediction frequency
   - Check for spam patterns

4. **Blockchain sync** (execute last, if applicable)
   - Verify escrow account state
   - Confirm on-chain balance availability

### Error Handling

Return appropriate HTTP status codes:
- `400 Bad Request`: Invalid input format
- `403 Forbidden`: User not eligible (banned, no access)
- `404 Not Found`: Market or user not found
- `409 Conflict`: Market closed, deadline passed, insufficient balance
- `429 Too Many Requests`: Rate limit exceeded

### Testing Requirements

All prediction validation must include tests for:
- ✅ Valid predictions accepted
- ✅ Invalid input rejected with 400
- ✅ Closed markets rejected with 409
- ✅ Insufficient balance rejected with 409
- ✅ Banned users rejected with 403
- ✅ Missing markets rejected with 404
- ✅ Rate limits enforced with 429

### Example Validation Flow

```typescript
async createPrediction(createPredictionDto: CreatePredictionDto, user: User) {
  // 1. Synchronous validation
  this.validatePredictionInput(createPredictionDto);

  // 2. Database queries
  const market = await this.marketsService.findOne(createPredictionDto.marketId);
  if (!market) throw new NotFoundException('Market not found');
  if (market.status !== 'OPEN') throw new ConflictException('Market not accepting predictions');
  if (market.deadlineAt < new Date()) throw new ConflictException('Prediction deadline passed');

  // 3. User checks
  if (user.isBanned) throw new ForbiddenException('User account banned');
  if (user.balance < createPredictionDto.amount) 
    throw new ConflictException('Insufficient balance');

  // 4. Rate limiting
  const recentCount = await this.getPredictionCountLastHour(user.id);
  if (recentCount >= this.MAX_PREDICTIONS_PER_HOUR)
    throw new TooManyRequestsException('Prediction rate limit exceeded');

  // 5. Create prediction
  return this.predictionsService.create({ ...createPredictionDto, userId: user.id });
}
```

### Related Issues
- Market resolution deadlines
- User account status tracking
- Rate limiting implementation
- Balance verification system

### See Also
- `/backend/src/predictions/predictions.service.ts`
- `/backend/API_REFERENCE.md` - Prediction endpoints

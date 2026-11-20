# Predictions Module - Exception Mapping

This directory contains domain-specific exceptions for the predictions module, ensuring consistent HTTP status codes and stable error codes for all prediction-related errors.

## Problem Solved

Previously, prediction domain errors weren't consistently mapped to HTTP status codes, causing:
- Generic `BadRequestException`, `NotFoundException`, etc. without stable error codes
- Potential for 500 errors leaking for user-caused issues
- Inconsistent error responses making client-side error handling difficult

## Solution

### Domain Exceptions

Each domain error has its own exception class with:
1. **Stable error code** - A unique string identifier that never changes
2. **Correct HTTP status** - Proper 4xx status code for user errors
3. **Contextual data** - Relevant IDs and details for debugging
4. **Consistent structure** - All responses follow the same format

### Exception Classes

| Exception | HTTP Status | Error Code | Use Case |
|-----------|-------------|------------|----------|
| `MarketNotFoundException` | 404 | `MARKET_NOT_FOUND` | Market doesn't exist |
| `PredictionNotFoundException` | 404 | `PREDICTION_NOT_FOUND` | Prediction doesn't exist |
| `UnauthorizedPredictionAccessException` | 403 | `UNAUTHORIZED_PREDICTION_ACCESS` | User can't access prediction |
| `DuplicatePredictionException` | 409 | `DUPLICATE_PREDICTION` | User already predicted on market |
| `PayoutAlreadyClaimedException` | 409 | `PAYOUT_ALREADY_CLAIMED` | Payout already claimed |
| `SlippageExceededException` | 409 | `SLIPPAGE_EXCEEDED` | Price slippage exceeded tolerance |
| `MarketClosedException` | 400 | `MARKET_CLOSED` | Market closed/paused/resolved |
| `InvalidOutcomeException` | 400 | `INVALID_OUTCOME` | Invalid outcome choice |
| `MarketNotResolvedException` | 400 | `MARKET_NOT_RESOLVED` | Can't claim unresolved market |
| `PredictionNotWonException` | 400 | `PREDICTION_NOT_WON` | Can't claim losing prediction |
| `NoClaimableRewardsException` | 400 | `NO_CLAIMABLE_REWARDS` | No rewards available to claim |
| `BatchSizeExceededException` | 400 | `BATCH_SIZE_EXCEEDED` | Batch too large |

### Error Response Format

All exceptions return responses in this format:

```json
{
  "success": false,
  "error": {
    "code": "STABLE_ERROR_CODE",
    "statusCode": 400,
    "message": "Human-readable error message",
    "contextField1": "value1",
    "contextField2": "value2"
  }
}
```

### Exception Filter

`PredictionsExceptionFilter` is a central exception filter that:
- Catches all exceptions in the predictions module
- Maps domain exceptions to consistent HTTP responses
- Prevents 500 errors from leaking for user errors
- Logs unexpected errors for monitoring

Applied at controller level with `@UseFilters(PredictionsExceptionFilter)`.

## Usage

### In Service Layer

```typescript
import { MarketNotFoundException, InvalidOutcomeException } from './exceptions';

// Instead of generic exceptions:
// throw new NotFoundException(`Market "${id}" not found`);

// Use domain exceptions:
throw new MarketNotFoundException(marketId);
throw new InvalidOutcomeException(chosenOutcome, validOptions);
```

### Client-Side Error Handling

Clients can reliably handle errors by error code:

```typescript
try {
  await submitPrediction(data);
} catch (error) {
  switch (error.response.data.error.code) {
    case 'MARKET_NOT_FOUND':
      showError('This market no longer exists');
      break;
    case 'DUPLICATE_PREDICTION':
      showError('You already predicted on this market');
      break;
    case 'SLIPPAGE_EXCEEDED':
      const { expectedPrice, actualPrice } = error.response.data.error.details;
      showError(`Price moved from ${expectedPrice} to ${actualPrice}`);
      break;
    default:
      showError('An error occurred');
  }
}
```

## Testing

### Unit Tests

- `exceptions.spec.ts` - Tests each exception class individually
  - Verifies correct HTTP status codes
  - Validates error code stability
  - Checks response structure consistency

- `predictions-exception.filter.spec.ts` - Tests the exception filter
  - Tests all exception mappings
  - Validates error response format
  - Tests unexpected error handling
  - Confirms no 500s leak for user errors

### Integration Tests

Service and controller tests should verify that:
1. Domain exceptions are thrown in error cases
2. HTTP responses match expected status/body
3. Error codes are stable across runs

## Migration Checklist

To migrate existing code:

1. ✅ Create domain exception classes
2. ✅ Create central exception filter
3. ✅ Update service to throw domain exceptions
4. ✅ Apply filter to controller
5. ✅ Add comprehensive tests
6. ⬜ Update API documentation with error codes
7. ⬜ Update client error handling

## Benefits

1. **Stability** - Error codes never change, clients can rely on them
2. **Clarity** - Each error has semantic meaning
3. **Type Safety** - TypeScript ensures correct usage
4. **Testability** - Easy to test specific error scenarios
5. **Debuggability** - Contextual data aids debugging
6. **No 500 Leaks** - User errors always return 4xx codes
7. **Consistent API** - All predictions endpoints return same format

# Predictions Module - Error Code Reference

## Quick Reference

Use this guide when handling errors from the predictions API endpoints.

### Not Found Errors (404)

#### MARKET_NOT_FOUND
- **Status:** 404
- **Meaning:** The requested market does not exist
- **Response includes:** `marketId`
- **Example:**
```json
{
  "success": false,
  "error": {
    "code": "MARKET_NOT_FOUND",
    "statusCode": 404,
    "message": "Market \"abc-123\" not found",
    "marketId": "abc-123"
  }
}
```

#### PREDICTION_NOT_FOUND
- **Status:** 404
- **Meaning:** The requested prediction does not exist
- **Response includes:** `predictionId`
- **Example:**
```json
{
  "success": false,
  "error": {
    "code": "PREDICTION_NOT_FOUND",
    "statusCode": 404,
    "message": "Prediction \"pred-456\" not found",
    "predictionId": "pred-456"
  }
}
```

### Forbidden Errors (403)

#### UNAUTHORIZED_PREDICTION_ACCESS
- **Status:** 403
- **Meaning:** User does not have permission to view this prediction
- **Response includes:** `predictionId`
- **Example:**
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED_PREDICTION_ACCESS",
    "statusCode": 403,
    "message": "You do not have permission to view this prediction",
    "predictionId": "pred-789"
  }
}
```

### Conflict Errors (409)

#### DUPLICATE_PREDICTION
- **Status:** 409
- **Meaning:** User has already submitted a prediction for this market
- **Response includes:** `marketId`
- **Example:**
```json
{
  "success": false,
  "error": {
    "code": "DUPLICATE_PREDICTION",
    "statusCode": 409,
    "message": "You have already submitted a prediction for this market",
    "marketId": "market-123"
  }
}
```

#### PAYOUT_ALREADY_CLAIMED
- **Status:** 409
- **Meaning:** The payout for this prediction has already been claimed
- **Response includes:** `predictionId`
- **Example:**
```json
{
  "success": false,
  "error": {
    "code": "PAYOUT_ALREADY_CLAIMED",
    "statusCode": 409,
    "message": "Payout has already been claimed",
    "predictionId": "pred-999"
  }
}
```

#### SLIPPAGE_EXCEEDED
- **Status:** 409
- **Meaning:** Price or shares slippage exceeded tolerance
- **Response includes:** `details` with `expectedPrice`, `actualPrice`, `expectedShares`, `actualShares`
- **Example:**
```json
{
  "success": false,
  "error": {
    "code": "SLIPPAGE_EXCEEDED",
    "statusCode": 409,
    "message": "Slippage tolerance exceeded",
    "details": {
      "expectedPrice": "3000000",
      "actualPrice": "4000000",
      "expectedShares": "100",
      "actualShares": "80"
    }
  }
}
```

### Bad Request Errors (400)

#### MARKET_CLOSED
- **Status:** 400
- **Meaning:** Market is closed, paused, or past end time - predictions no longer accepted
- **Response includes:** message with reason
- **Example:**
```json
{
  "success": false,
  "error": {
    "code": "MARKET_CLOSED",
    "statusCode": 400,
    "message": "Market is paused - predictions are no longer accepted"
  }
}
```

#### INVALID_OUTCOME
- **Status:** 400
- **Meaning:** The chosen outcome is not a valid option for this market
- **Response includes:** `chosenOutcome`, `validOptions`
- **Example:**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_OUTCOME",
    "statusCode": 400,
    "message": "Invalid outcome \"Maybe\". Valid options: Yes, No",
    "chosenOutcome": "Maybe",
    "validOptions": ["Yes", "No"]
  }
}
```

#### MARKET_NOT_RESOLVED
- **Status:** 400
- **Meaning:** Cannot claim payout because market is not yet resolved
- **Response includes:** `marketId`
- **Example:**
```json
{
  "success": false,
  "error": {
    "code": "MARKET_NOT_RESOLVED",
    "statusCode": 400,
    "message": "Market is not yet resolved",
    "marketId": "market-456"
  }
}
```

#### PREDICTION_NOT_WON
- **Status:** 400
- **Meaning:** Cannot claim payout because prediction did not win
- **Response includes:** `predictionId`
- **Example:**
```json
{
  "success": false,
  "error": {
    "code": "PREDICTION_NOT_WON",
    "statusCode": 400,
    "message": "You did not win this prediction",
    "predictionId": "pred-789"
  }
}
```

#### NO_CLAIMABLE_REWARDS
- **Status:** 400
- **Meaning:** No rewards are currently available to claim
- **Response includes:** `userId`
- **Example:**
```json
{
  "success": false,
  "error": {
    "code": "NO_CLAIMABLE_REWARDS",
    "statusCode": 400,
    "message": "No claimable rewards",
    "userId": "user-123"
  }
}
```

#### BATCH_SIZE_EXCEEDED
- **Status:** 400
- **Meaning:** Batch submission contains too many predictions
- **Response includes:** `actualSize`, `maxSize`
- **Example:**
```json
{
  "success": false,
  "error": {
    "code": "BATCH_SIZE_EXCEEDED",
    "statusCode": 400,
    "message": "Batch size exceeds the maximum of 20 predictions",
    "actualSize": 25,
    "maxSize": 20
  }
}
```

#### BATCH_VALIDATION_FAILED
- **Status:** 400
- **Meaning:** Batch submission failed validation (atomic mode)
- **Response includes:** `errors` array with per-item details
- **Example:**
```json
{
  "success": false,
  "error": {
    "code": "BATCH_VALIDATION_FAILED",
    "statusCode": 400,
    "message": "Batch submission failed validation - no predictions were submitted",
    "errors": [
      { "index": 0, "error": "Market \"bad-id\" not found" },
      { "index": 2, "error": "Invalid outcome \"Maybe\"" }
    ]
  }
}
```

#### BATCH_CHAIN_SUBMISSION_FAILED
- **Status:** 400
- **Meaning:** Batch submission failed during on-chain submission (atomic mode)
- **Response includes:** `errors` array with per-item details
- **Example:**
```json
{
  "success": false,
  "error": {
    "code": "BATCH_CHAIN_SUBMISSION_FAILED",
    "statusCode": 400,
    "message": "Batch submission failed on-chain - no predictions were persisted",
    "errors": [
      { "index": 1, "error": "On-chain submission failed: Insufficient balance" }
    ]
  }
}
```

## Client-Side Error Handling

### TypeScript/JavaScript Example

```typescript
import axios from 'axios';

async function submitPrediction(data: PredictionData) {
  try {
    const response = await axios.post('/predictions', data);
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      const errorCode = error.response.data?.error?.code;
      
      switch (errorCode) {
        case 'MARKET_NOT_FOUND':
          showError('This market no longer exists');
          break;
          
        case 'MARKET_CLOSED':
          showError('This market is closed for predictions');
          break;
          
        case 'DUPLICATE_PREDICTION':
          showError('You already predicted on this market');
          redirectToMyPredictions();
          break;
          
        case 'SLIPPAGE_EXCEEDED':
          const { expectedPrice, actualPrice } = error.response.data.error.details;
          showError(`Price moved from ${expectedPrice} to ${actualPrice}. Try again?`);
          break;
          
        case 'INVALID_OUTCOME':
          const { validOptions } = error.response.data.error;
          showError(`Please choose from: ${validOptions.join(', ')}`);
          break;
          
        default:
          showError('An error occurred. Please try again.');
      }
    }
  }
}
```

### React Hook Example

```typescript
function usePredictionSubmit() {
  const [error, setError] = useState<string | null>(null);
  
  const submit = async (data: PredictionData) => {
    setError(null);
    try {
      const result = await submitPrediction(data);
      return { success: true, data: result };
    } catch (err: any) {
      const errorCode = err.response?.data?.error?.code;
      const errorMessage = err.response?.data?.error?.message;
      
      // Use stable error codes for specific handling
      if (errorCode === 'DUPLICATE_PREDICTION') {
        setError('You already predicted on this market');
        return { success: false, code: errorCode, redirectTo: '/predictions' };
      }
      
      if (errorCode === 'SLIPPAGE_EXCEEDED') {
        setError('Price changed significantly. Review and try again.');
        return { success: false, code: errorCode, retryable: true };
      }
      
      setError(errorMessage || 'An error occurred');
      return { success: false, code: errorCode };
    }
  };
  
  return { submit, error };
}
```

## API Documentation

These error codes should be documented in the OpenAPI/Swagger spec for each predictions endpoint. Example:

```yaml
/predictions:
  post:
    responses:
      '201':
        description: Prediction submitted successfully
      '400':
        description: Bad request
        content:
          application/json:
            examples:
              market_closed:
                value:
                  success: false
                  error:
                    code: MARKET_CLOSED
                    statusCode: 400
                    message: Market is closed
              invalid_outcome:
                value:
                  success: false
                  error:
                    code: INVALID_OUTCOME
                    statusCode: 400
                    message: Invalid outcome "Maybe". Valid options: Yes, No
                    chosenOutcome: Maybe
                    validOptions: [Yes, No]
      '404':
        description: Market not found
        content:
          application/json:
            example:
              success: false
              error:
                code: MARKET_NOT_FOUND
                statusCode: 404
                message: Market "abc-123" not found
                marketId: abc-123
      '409':
        description: Conflict
        content:
          application/json:
            examples:
              duplicate:
                value:
                  success: false
                  error:
                    code: DUPLICATE_PREDICTION
                    statusCode: 409
                    message: You have already submitted a prediction
                    marketId: market-123
              slippage:
                value:
                  success: false
                  error:
                    code: SLIPPAGE_EXCEEDED
                    statusCode: 409
                    message: Slippage tolerance exceeded
                    details:
                      expectedPrice: "3000000"
                      actualPrice: "4000000"
```

## Testing Error Handling

Always test error handling for critical paths:

```typescript
describe('Prediction submission error handling', () => {
  it('should handle market not found', async () => {
    mockApi.post.mockRejectedValueOnce({
      response: {
        data: {
          success: false,
          error: {
            code: 'MARKET_NOT_FOUND',
            statusCode: 404,
            message: 'Market not found',
            marketId: 'bad-id'
          }
        }
      }
    });
    
    const result = await submitPrediction({ marketId: 'bad-id' });
    expect(result.success).toBe(false);
    expect(result.code).toBe('MARKET_NOT_FOUND');
  });
});
```

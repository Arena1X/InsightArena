# CreatorEventManager Smart Contract

A Soroban smart contract for hosting prediction events with XLM token fees, invite-only access, and AI Oracle result verification.

## Features

- **Creator-hosted Events**: Creators can host their own prediction events
- **XLM Token Integration**: Entry fees paid in XLM tokens with automatic collection
- **Invite-only Access**: Optional invite-only events for exclusive participation
- **AI Oracle Integration**: Results verified through AI Oracle system
- **Multiple Prediction Options**: Support for multiple prediction choices per event
- **Event Management**: Full lifecycle management from creation to resolution
- **Automated Payouts**: Proportional winnings distribution to winners
- **House Fee Management**: Configurable house fees with treasury management

## Token Requirements

### XLM Token Address
The contract must be initialized with a valid XLM token contract address. This address is used for all token operations including:
- Entry fee collection from users
- Winnings distribution to winners
- House fee management

### Token Authorization
Users must approve the contract to spend tokens on their behalf before placing predictions:
```rust
token_client.approve(&user_address, &contract_address, &amount, &expiration_ledger);
```

### Balance Requirements
- Users must have sufficient XLM balance to cover entry fees
- The contract automatically validates balances before processing transactions
- Failed transactions due to insufficient funds will revert with appropriate error messages

## Contract Structure

### Core Data Types

#### New Optimized Event Struct (`storage_types::Event`)
- `event_id: u64` - Unique identifier for the event
- `creator: Address` - Address of the event creator
- `name: String` - Display name/title of the prediction event
- `description: String` - Detailed description and rules
- `creation_fee: i128` - Entry fee in XLM stroops
- `created_at: u64` - Creation timestamp (Unix seconds)
- `is_active: bool` - Whether event accepts new predictions
- `total_participants: u32` - Current number of participants
- `total_matches: u32` - Number of prediction options available

#### Match Struct (`storage_types::Match`)
- `match_id: u64` - Unique identifier for the match
- `event_id: u64` - ID of the parent event this match belongs to
- `team_a: String` - Name/identifier of the first team or option
- `team_b: String` - Name/identifier of the second team or option
- `match_time: u64` - Scheduled match time (Unix timestamp)
- `result_submitted: bool` - Whether a result has been submitted
- `winning_team: Option<u32>` - Winner (0=Team A, 1=Team B, 2=Draw)
- `result_timestamp: Option<u64>` - When the result was submitted

#### Match Result Encoding
- **0** = Team A Wins (`team_a` field)
- **1** = Team B Wins (`team_b` field)  
- **2** = Draw/Tie
- **None** = No result submitted yet

#### Event Metadata (`storage_types::EventMetadata`)
- `category: String` - Event category (Sports, Crypto, Politics, etc.)
- `tags: String` - Comma-separated tags for discovery
- `min_participants: u32` - Minimum participants required
- `max_participants: u32` - Maximum participants allowed
- `end_time: u64` - When predictions close
- `resolution_time: u64` - When results are determined
- `is_invite_only: bool` - Whether event is invite-only
- `creator_reputation: u32` - Creator's reputation score

#### Legacy Support
- `LegacyEvent` - Backward compatible event structure
- `PredictionOption` - Individual prediction choices within an event
- `UserPrediction` - User's prediction and stake information
- `LegacyEventStatus` - Event lifecycle status (Active, Resolved, Cancelled)

### Main Functions

#### `initialize(token_address, house_fee_percentage)`
Initialize the contract with XLM token configuration:
- `token_address`: Address of the XLM token contract
- `house_fee_percentage`: House fee percentage (0-20%)

#### New Optimized Functions

#### `create_new_event()`
Create a new event using the optimized Event struct:
- `creator`: Event creator address
- `name`: Display name of the event
- `description`: Detailed description of the event
- `creation_fee`: Entry fee in XLM stroops
- `total_matches`: Number of prediction options available

#### `get_new_event(event_id)`
Get event details using the new Event struct format.

#### `update_event_status(creator, event_id, is_active)`
Update event active status (creator only).

#### `add_event_participant(event_id)`
Add a participant to an event (increments counter).

#### `get_event_stats(event_id)`
Get event statistics: `(participants, prize_pool, age_seconds)`.

#### `create_event_metadata()` / `get_event_metadata()`
Manage extended event metadata including categories, tags, timing, and constraints.

#### Match Management Functions

#### `create_match(creator, event_id, team_a, team_b, match_time)`
Create a new match within an event:
- `creator`: Event creator (must own the event)
- `event_id`: ID of the parent event
- `team_a`: Name of the first team/option
- `team_b`: Name of the second team/option
- `match_time`: Scheduled match time (Unix timestamp)

#### `get_match(match_id)` / `get_event_matches(event_id)`
Retrieve match details or all matches for an event.

#### `submit_match_result(creator, match_id, winning_team)`
Submit result for a match (creator only):
- `winning_team`: 0 for Team A, 1 for Team B, 2 for Draw

#### `match_allows_predictions(match_id, cutoff_minutes)`
Check if match still allows predictions based on timing.

#### `get_match_stats(match_id)`
Get match statistics: `(has_started, result_submitted, time_until_start, time_since_result)`.

#### `get_match_count()` / `validate_match(match_id)`
Get total match count and validate match data consistency.

#### `get_event_participants(event_id)`
Return the full `Vec<Address>` of users who have joined an event. Newly created events return an empty vector, and unknown event IDs fail with `event_not_found`.

#### `join_event(user, invite_code)`
Join an event using its invite code before submitting predictions.

#### `submit_prediction(predictor, match_id, predicted_outcome)`
Submit a TEAM_A, TEAM_B, or DRAW prediction for a match.

#### `get_prediction(prediction_id)`
Fetch a stored prediction by ID for display or verification.

#### Legacy Functions (Backward Compatibility)
#### `create_event()` (Legacy)
Create a new prediction event with the following parameters:
- `creator`: Event creator address
- `title`: Event title
- `description`: Event description
- `entry_fee`: Required XLM fee to participate
- `end_time`: Event end timestamp
- `options`: List of prediction options
- `invited_users`: List of invited users (for invite-only events)
- `is_invite_only`: Whether the event is invite-only

#### `place_prediction()`
Place a prediction on an active event:
- `user`: User placing the prediction
- `event_id`: Target event ID
- `option_id`: Selected prediction option
- `stake_amount`: Stake amount (must match entry fee)

**Note**: Users must approve the contract to spend tokens before calling this function.

#### `resolve_event()`
Resolve an event with the winning option (creator only):
- `creator`: Event creator (must match)
- `event_id`: Event to resolve
- `winning_option_id`: ID of the winning option

#### `distribute_winnings()`
Distribute winnings to participants after event resolution (creator only):
- `creator`: Event creator (must match)
- `event_id`: Event to distribute winnings for

Winnings are calculated proportionally based on stake amounts and total pool, minus house fees.

#### Token Management Functions
- `get_contract_balance()`: Get contract's XLM balance
- `get_user_balance(user)`: Get user's XLM balance
- `withdraw_house_fees(admin, amount)`: Withdraw accumulated house fees
- `get_token_address()`: Get the configured XLM token address
- `get_house_fee_percentage()`: Get the house fee percentage

#### Query Functions
- `get_event()`: Get event details by ID
- `get_user_prediction()`: Get user's prediction for an event
- `get_event_count()`: Get total number of events created
- `get_event_participants()`: Get list of event participants

## Usage Example

```rust
// Initialize contract with XLM token
let xlm_token_address = Address::from_string("CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQAHHAGCN6AU");
let house_fee = 5u32; // 5%
client.initialize(&xlm_token_address, &house_fee);

// Create event
let event_id = client.create_new_event(&creator, &name, &description, &1000000i128, &2u32);

// Create matches within the event
let match_id1 = client.create_match(&creator, &event_id, &team_a1, &team_b1, &match_time1);
let match_id2 = client.create_match(&creator, &event_id, &team_a2, &team_b2, &match_time2);

// User approves contract to spend tokens
token_client.approve(&user, &contract_address, &1000i128, &expiration_ledger);

// User places prediction on a specific match
client.place_prediction(&user, &event_id, &option_id, &1000i128);

// Creator submits match results
client.submit_match_result(&creator, &match_id1, &0u32); // Team A wins
client.submit_match_result(&creator, &match_id2, &2u32); // Draw

// Creator resolves event and distributes winnings
client.resolve_event(&creator, &event_id, &winning_option_id);
client.distribute_winnings(&creator, &event_id);
```

## Winnings Calculation

Winnings are distributed proportionally among winners:

1. **Total Pool**: Sum of all entry fees
2. **House Fee**: Configurable percentage (0-20%) deducted from total pool
3. **Distributable Pool**: Total pool minus house fee
4. **Individual Winnings**: `(user_stake * distributable_pool) / winning_option_total_stake`

### Example
- Total pool: 1000 XLM
- House fee: 5% (50 XLM)
- Distributable: 950 XLM
- Winning option total: 400 XLM
- User stake: 100 XLM
- User winnings: `(100 * 950) / 400 = 237.5 XLM`

## Building

```bash
cargo build --target wasm32-unknown-unknown --release
```

## Testing

```bash
cargo test
```

## Error Handling

The contract includes comprehensive error handling for token operations:

- **InsufficientBalance**: User or contract lacks sufficient tokens
- **TransferFailed**: Token transfer operation failed
- **UnauthorizedTransfer**: User hasn't approved contract for token spending
- **InvalidTokenAddress**: Provided token address is invalid

All token operations are wrapped with proper error handling and will revert transactions on failure.

## Security Considerations

- All state-changing functions require proper authentication
- Event creators have exclusive rights to resolve their events
- Invite-only events enforce access control
- Duplicate predictions are prevented
- Time-based validation ensures events cannot be modified after end time

## License

This project is licensed under the MIT License.
## Deployment

The contract can be deployed to Stellar networks using the Soroban CLI:

```bash
soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/creator_event_manager.wasm \
  --source <SOURCE_ACCOUNT> \
  --network <NETWORK>
```

After deployment, initialize the contract with the XLM token address:

```bash
soroban contract invoke \
  --id <CONTRACT_ID> \
  --source <SOURCE_ACCOUNT> \
  --network <NETWORK> \
  -- initialize \
  --token_address <XLM_TOKEN_ADDRESS> \
  --house_fee_percentage 5
```
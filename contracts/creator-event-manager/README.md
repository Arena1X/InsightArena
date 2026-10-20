# CreatorEventManager Smart Contract

A Soroban smart contract for hosting prediction events with XLM token fees, invite-only access, and AI Oracle result verification.

## Table of Contents

- [What is CreatorEventManager?](#what-is-creatoreeventmanager)
- [Key Features](#key-features)
- [Use Cases](#use-cases)
- [Quick Start](#quick-start)
- [Documentation](#documentation)
- [Technical Details](#technical-details)
- [Building & Testing](#building--testing)
- [Error Handling](#error-handling)
- [Security Considerations](#security-considerations)
- [License](#license)

## What is CreatorEventManager?

CreatorEventManager is a decentralized prediction market platform built on Stellar's Soroban smart contracts. It enables event creators to host prediction events where users can make predictions on various outcomes, with transparent scoring and automated winner verification through AI oracle integration.

The contract handles the complete lifecycle of prediction events:

1. **Event Creation** — Creators set up new events with configurable parameters
2. **User Participation** — Users join events via invite codes and place predictions on matches
3. **Result Submission** — The AI oracle agent submits match results
4. **Winner Verification** — Automatic verification of perfect scorers
5. **Platform Management** — Admins manage treasury, fees, and platform settings

## Key Features

- **Creator-hosted Events**: Creators can host their own prediction events with customizable titles, descriptions, and participant limits
- **XLM Token Integration**: Entry fees paid in XLM tokens with automatic collection and fee management
- **Invite-only Access**: Optional invite-only events for exclusive participation with unique invite codes
- **AI Oracle Integration**: Results verified through AI Oracle system with automatic winner calculation
- **Multiple Matches per Event**: Support for multiple matches/predictions within a single event
- **Event Management**: Full lifecycle management from creation through resolution and winner verification
- **Automated Winner Verification**: Identifies and records perfect scorers (users who predicted all matches correctly)
- **Transparent Scoring**: Public leaderboards and prediction distribution tracking
- **Treasury Management**: Configurable house fees with admin-controlled treasury withdrawals
- **Emergency Controls**: Admin pause/unpause functionality for security

## Use Cases

### Sports Prediction Events

Event creators can host prediction markets for sports events, allowing fans to predict match outcomes. Perfect for fantasy sports leagues, tournament predictions, or live match betting.

### Crypto Market Predictions

Create prediction events around cryptocurrency market movements, project launches, or blockchain events. Users predict whether prices will go up, down, or stay within ranges.

### Political Events

Host prediction markets for election outcomes, policy decisions, or political events with transparent, decentralized result verification.

### Esports Tournaments

Enable esports enthusiasts to predict tournament winners, match results, or player performances with automated scoring and leaderboards.

### Entertainment & Pop Culture

From award show predictions to entertainment industry events, CreatorEventManager supports any outcome-based prediction scenario.

### Hackathon Competitions

Run prediction events during hackathons to engage participants in side competitions and increase community engagement.

## Quick Start

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/your-org/InsightArena.git
   cd InsightArena/contracts/creator-event-manager
   ```

2. **Install dependencies**

   ```bash
   # Ensure you have Rust installed
   rustup update stable
   rustup target add wasm32-unknown-unknown

   # Verify Soroban CLI is installed
   soroban --version
   ```

3. **Install the contract**

   ```bash
   cargo build --target wasm32-unknown-unknown --release
   ```

### Build Instructions

Build the contract as a WASM binary:

```bash
# Build in release mode for production
cargo build --target wasm32-unknown-unknown --release

# Build with debug information (for development)
cargo build --target wasm32-unknown-unknown

# The output binary will be at:
# target/wasm32-unknown-unknown/release/creator_event_manager.wasm
```

### Deploy to Testnet

1. **Set up your Soroban environment**

   ```bash
   # Initialize Soroban CLI with your account
   soroban config identity create my-account --public-key <YOUR_PUBLIC_KEY>
   soroban config network add testnet \
     --rpc-url https://soroban-testnet.stellar.org \
     --network-passphrase "Test SDF Network ; September 2015"
   ```

2. **Deploy the contract**

   ```bash
   soroban contract deploy \
     --wasm target/wasm32-unknown-unknown/release/creator_event_manager.wasm \
     --source my-account \
     --network testnet
   ```

   This will output your contract address (starting with `C`).

3. **Initialize the contract**

   ```bash
   soroban contract invoke \
     --id <YOUR_CONTRACT_ID> \
     --source my-account \
     --network testnet \
     -- initialize \
     --admin <ADMIN_ADDRESS> \
     --ai_agent <AI_AGENT_ADDRESS> \
     --treasury <TREASURY_ADDRESS> \
     --xlm_token <XLM_TOKEN_ADDRESS> \
     --initial_creation_fee 1000000
   ```

   Replace the addresses with your own addresses and XLM token address (typically `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQAHHAGCN6AU` on testnet).

### Basic Usage Example

```rust
use soroban_sdk::Address;

// 1. Create an event
let (event_id, invite_code) = client.create_event(
    &creator,
    &String::from_small("World Cup Predictions"),
    &String::from_small("Predict all 8 matches from the World Cup finals"),
    &100u32, // max 100 participants
);

// 2. Create matches within the event
let match_id_1 = client.create_match(
    &creator,
    &event_id,
    &String::from_small("Argentina"),
    &String::from_small("France"),
    &1640000000u64, // Unix timestamp
);

// 3. Users join the event with invite code
client.join_event(&user1, &invite_code);

// 4. Users submit predictions
let prediction_id = client.submit_prediction(
    &user1,
    &match_id_1,
    &Symbol::short("TEAM_A"), // Predicting Argentina wins
);

// 5. Oracle agent submits result
client.submit_match_result(
    &ai_agent,
    &match_id_1,
    &Symbol::short("TEAM_A"), // Argentina won
);

// 6. Verify winners after all matches are resolved
let winner_count = client.verify_event_winners(&admin, &event_id);

// 7. Query winners and scores
let winners = client.get_event_winners(&event_id);
let (correct_count, total_matches) = client.get_user_score(&user1, &event_id);
```

## Documentation

For detailed information about the contract, refer to these documentation files:

### [API Reference](./API_REFERENCE.md)

Complete API documentation for all contract functions, including parameters, return values, and error conditions.

### [Architecture Guide](./ARCHITECTURE.md)

Detailed explanation of the contract architecture, data structures, and internal modules.

### [Integration Guide](./INTEGRATION.md)

Step-by-step guide for integrating CreatorEventManager into your application, including SDK examples and best practices.

### [Testing Guide](./TESTING.md)

Comprehensive testing documentation covering unit tests, integration tests, and how to write your own tests.

### [Deployment Guide](./DEPLOYMENT.md)

Production deployment checklist, network configuration, and monitoring setup.

### [User Guide](./USER_GUIDE.md)

End-user guide with common workflows and examples for event creators and participants.

## Technical Details

### XLM Token Configuration

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

### Core Data Types

#### Event Struct (`storage_types::Event`)

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

- **0** = Team A Wins
- **1** = Team B Wins
- **2** = Draw/Tie
- **None** = No result submitted yet

#### Prediction Struct (`storage_types::Prediction`)

- `prediction_id: u64` - Unique identifier for the prediction
- `match_id: u64` - ID of the match being predicted
- `predictor: Address` - Address of the user making the prediction
- `predicted_outcome: Symbol` - The predicted outcome (TEAM_A, TEAM_B, or DRAW)
- `predicted_at: u64` - Timestamp when prediction was submitted
- `is_correct: bool` - Whether the prediction was correct (set after match resolution)

### Winnings Calculation

Winnings are distributed proportionally among winners:

1. **Total Pool**: Sum of all entry fees
2. **House Fee**: Configurable percentage (0-20%) deducted from total pool
3. **Distributable Pool**: Total pool minus house fee
4. **Individual Winnings**: `(user_stake * distributable_pool) / winning_option_total_stake`

**Example**:

- Total pool: 1000 XLM
- House fee: 5% (50 XLM)
- Distributable: 950 XLM
- Winning option total: 400 XLM
- User stake: 100 XLM
- User winnings: `(100 * 950) / 400 = 237.5 XLM`

## Building & Testing

### Build

Build the contract as a WASM binary for production:

```bash
cargo build --target wasm32-unknown-unknown --release
```

The output binary will be at: `target/wasm32-unknown-unknown/release/creator_event_manager.wasm`

### Test

Run the test suite:

```bash
cargo test
```

## Error Handling

The contract includes comprehensive error handling:

- **contract_paused** - Contract is currently paused by admin
- **unauthorized** - Caller lacks required permissions
- **invalid_address** - Provided address is invalid or equals contract
- **event_not_found** - Referenced event does not exist
- **match_not_found** - Referenced match does not exist
- **prediction_not_found** - Referenced prediction does not exist
- **insufficient_balance** - Insufficient XLM token balance
- **transfer_failed** - Token transfer operation failed
- **invalid_invite_code** - Invite code is invalid or expired
- **already_joined** - User has already joined this event
- **event_full** - Event has reached maximum participants
- **match_started** - Cannot place prediction after match has started
- **invalid_outcome** - Prediction outcome is not valid
- **result_already_submitted** - Result has already been submitted for this match
- **matches_not_complete** - Not all matches have been resolved

All error conditions are handled with clear panic messages for debugging.

## Security Considerations

- All state-changing functions require proper authentication
- Event creators have exclusive rights to manage their events
- Invite-only events enforce access control via invite codes
- Duplicate predictions are prevented automatically
- Time-based validation ensures events cannot be modified after start
- Emergency pause functionality allows admins to halt operations
- Treasury management is restricted to admin addresses
- AI oracle results can only be submitted by authorized agents
- All XLM transfers are validated and wrapped with error handling

## License

This project is licensed under the MIT License.

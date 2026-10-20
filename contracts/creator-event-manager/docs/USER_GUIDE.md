# InsightArena Creator Event Manager - User Guide

## Table of Contents

- [Introduction](#introduction)
- [For Creators](#for-creators)
  - [How to Create an Event](#how-to-create-an-event)
  - [How to Add Matches](#how-to-add-matches)
  - [How to Share Invite Code](#how-to-share-invite-code)
  - [How to Cancel an Event](#how-to-cancel-an-event)
  - [Best Practices](#best-practices)

---

## Introduction

InsightArena's Creator Event Manager is a Soroban smart contract that enables anyone to host prediction events on the Stellar network. This guide explains how to interact with the contract as a creator.

The contract supports:
- **XLM-based entry fees** for prediction events
- **Invite-only access** with unique 8-character codes
- **AI Oracle integration** for trustless result verification
- **Automated scoring** and winner verification
- **Multi-match events** with flexible prediction options

---

## For Creators

As a creator, you can host your own prediction events, add matches, invite participants, and manage the event lifecycle.

### How to Create an Event

Creating an event requires paying a creation fee in XLM and providing event details.

#### Prerequisites
- Sufficient XLM balance to cover the creation fee
- Approval for the contract to spend your XLM tokens

#### Step 1: Check Creation Fee

Query the current creation fee:

```rust
let creation_fee = contract.get_creation_fee(&env);
```

```bash
soroban contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  -- get_creation_fee
```

#### Step 2: Approve Token Spending

Before creating an event, approve the contract to spend the creation fee:

```rust
let xlm_token = token::Client::new(&env, &xlm_token_address);
xlm_token.approve(
    &creator_address,
    &contract_address,
    &creation_fee,
    &expiration_ledger  // e.g., current_ledger + 100000
);
```

```bash
soroban contract invoke \
  --id <XLM_TOKEN_ADDRESS> \
  --source <CREATOR_KEYPAIR> \
  --network testnet \
  -- approve \
  --from <CREATOR_ADDRESS> \
  --spender <CONTRACT_ADDRESS> \
  --amount <CREATION_FEE> \
  --expiration_ledger <LEDGER_NUMBER>
```

#### Step 3: Create the Event

Call the `create_event` function with your event details:

```rust
let (event_id, invite_code) = contract.create_event(
    &env,
    &creator_address,           // Your address
    &String::from_str(&env, "Premier League Weekend"), // Title (max 200 chars)
    &String::from_str(&env, "Predict the outcomes of all 10 matches this weekend. Perfect score wins!"), // Description (max 1000 chars)
    &100u32,                    // Max participants (0 = unlimited)
);
```

```bash
soroban contract invoke \
  --id <CONTRACT_ID> \
  --source <CREATOR_KEYPAIR> \
  --network testnet \
  -- create_event \
  --creator <CREATOR_ADDRESS> \
  --title "Premier League Weekend" \
  --description "Predict the outcomes of all 10 matches this weekend" \
  --max_participants 100
```

**Returns:**
- `event_id` (u64) - Unique identifier for your event
- `invite_code` (Symbol) - 8-character code participants use to join (e.g., `A1B2C3D4`)

#### Parameters Explained

| Parameter | Type | Description | Constraints |
|-----------|------|-------------|-------------|
| `creator` | Address | Your wallet address | Must have sufficient XLM |
| `title` | String | Event name | 1-200 characters |
| `description` | String | Event rules and details | 1-1000 characters |
| `max_participants` | u32 | Maximum number of participants | 0 = unlimited, > 0 = cap |

#### Example

```rust
// Full example
let creator = Address::from_string(&env, "GCREATOR...");
let title = String::from_str(&env, "FIFA World Cup Quarter-Finals");
let description = String::from_str(&env, "Predict all 4 quarter-final matches. Winners share glory!");
let max_participants = 500u32;

let (event_id, invite_code) = contract.create_event(
    &env,
    &creator,
    &title,
    &description,
    &max_participants
);

// event_id = 1
// invite_code = Symbol("K7M9P2Q5")
```

---

### How to Add Matches

After creating an event, you need to add matches that participants will predict.

#### Prerequisites
- You must be the event creator
- Event must exist and not be cancelled

#### Backend API Approach

The NestJS backend provides endpoints to add matches:

```typescript
POST /api/v1/creator-events/{eventId}/matches

{
  "teamA": "Manchester United",
  "teamB": "Liverpool",
  "matchTime": 1735689600  // Unix timestamp
}
```

#### Match Requirements

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| `team_a` | String | First team/option name | 1-100 characters, unique |
| `team_b` | String | Second team/option name | 1-100 characters, must differ from team_a |
| `match_time` | u64 | Scheduled start (Unix seconds) | Must be in the future |

#### Example: Adding Multiple Matches

```typescript
const matches = [
    { teamA: "Arsenal", teamB: "Chelsea", matchTime: 1735689600 },
    { teamA: "Man City", teamB: "Tottenham", matchTime: 1735693200 },
    { teamA: "Newcastle", teamB: "Brighton", matchTime: 1735696800 },
];

for (const match of matches) {
    await fetch(`/api/v1/creator-events/${eventId}/matches`, {
        method: 'POST',
        body: JSON.stringify(match)
    });
}
```

#### Viewing Event Matches

Check all matches for your event:

```bash
soroban contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  -- list_event_matches \
  --event_id <EVENT_ID>
```

---

### How to Share Invite Code

The invite code is your event's unique access key. Share it with participants so they can join.

#### Step 1: Retrieve Your Invite Code

After creating an event, you receive an 8-character invite code (e.g., `K7M9P2Q5`). Store this securely.

If you need to look it up later:

```bash
soroban contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  -- get_event \
  --event_id <EVENT_ID>
```

The response includes the `invite_code` field.

#### Step 2: Share the Code

**Methods to share:**

1. **Direct Message** - Send the code privately to specific users
2. **Social Media** - Post publicly for open events
3. **QR Code** - Generate a QR code containing the invite code
4. **Deep Link** - Create a web link: `https://insightarena.app/join?code=K7M9P2Q5`

#### Example Sharing Message

```
🎯 Join my InsightArena prediction event!

Event: FIFA World Cup Quarter-Finals
Participants: 0/500
Matches: 4

Invite Code: K7M9P2Q5

Join now: https://insightarena.app/join?code=K7M9P2Q5
```

#### Verification

Participants can verify the event details using the invite code:

```bash
soroban contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  -- get_event_by_code \
  --invite_code K7M9P2Q5
```

---

### How to Cancel an Event

If you need to cancel an event before it completes, you can mark it as cancelled.

#### Important Notes
- **Cancellation is permanent** - Cannot be undone
- Participants cannot submit new predictions after cancellation
- Existing predictions are preserved but not scored
- No winners will be verified for cancelled events

#### Cancellation via Backend API

```typescript
PATCH /api/v1/creator-events/{eventId}/cancel

{
  "reason": "Insufficient participants"
}
```

The event's `is_cancelled` flag is set to `true`, which:
- Prevents new participants from joining
- Blocks new prediction submissions
- Stops winner verification

#### Checking Cancellation Status

```bash
soroban contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  -- get_event \
  --event_id <EVENT_ID>
```

Check the `is_cancelled` field in the response.

---

### Best Practices

Follow these guidelines to create successful prediction events:

#### 1. Event Planning

**Title & Description**
- Use clear, descriptive titles (avoid cryptic names)
- Include full rules and scoring criteria in description
- Specify deadlines and result publication timing
- Mention any prizes or rewards

**Example:**
```
Title: "NFL Week 15 Perfect Picks Challenge"

Description: "Predict the winner of all 16 games in NFL Week 15. 
Predictions lock 5 minutes before each game starts. Perfect score 
wins bragging rights and a spot on the all-time leaderboard! Results 
verified within 2 hours of final whistle."
```

#### 2. Match Setup

**Timing**
- Add all matches before sharing the invite code
- Set `match_time` to actual kickoff time (not prediction deadline)
- Allow sufficient time between event creation and first match
- Recommended: Create event at least 24 hours before first match

**Match Details**
- Use official team names (avoid abbreviations)
- Double-check spelling and capitalization
- Ensure team names are distinct (not "Team A" vs "Team B")
- Order matches chronologically when possible

**Example:**
```typescript
// Good
{ teamA: "Real Madrid", teamB: "Barcelona", matchTime: 1735689600 }

// Avoid
{ teamA: "RM", teamB: "FCB", matchTime: 1735689600 }  // Unclear abbreviations
{ teamA: "Team 1", teamB: "Team 2", matchTime: 1735689600 }  // Generic names
```

#### 3. Participant Management

**Capacity Planning**
- Set realistic `max_participants` based on expected interest
- Use 0 for unlimited if you want maximum reach
- Consider server/gas costs for very large events (>1000 participants)

**Invite Code Security**
- Don't share invite codes publicly if you want a private event
- Create multiple events for different groups instead of one large mixed event
- Monitor participant count to ensure you don't hit the cap unexpectedly

#### 4. Communication

**Before Event**
- Share invite code at least 24 hours before first match
- Remind participants of prediction deadlines
- Clarify the outcome options (TEAM_A, TEAM_B, DRAW)

**During Event**
- Update participants on match progress (use external channels)
- Notify when results are being submitted
- Share leaderboard updates

**After Event**
- Announce winners promptly
- Publish final scores and statistics
- Invite participants to your next event

#### 5. Result Verification

**Timeline**
- Results should be submitted within 2 hours of match completion
- All matches must be resolved before winner verification
- Coordinate with AI oracle or admin for timely result submission

**Accuracy**
- Ensure AI oracle has correct result data
- Results are final once submitted (cannot be changed)
- Cross-verify critical results before submission

#### 6. Gas & Fee Management

**XLM Requirements**
- Always maintain sufficient XLM balance for creation fees
- Approve more than the minimum to avoid failed transactions
- Monitor treasury fees if you're running many events

**Cost Optimization**
- Batch match creation when possible
- Limit event description length to essential information
- Use backend aggregation for large participant lists

#### 7. Event Lifecycle

**Recommended Flow:**
1. Create event → Receive event_id and invite_code
2. Add all matches immediately
3. Test by joining with a secondary account
4. Share invite code publicly
5. Monitor participant count
6. Close predictions before first match (automatic)
7. Submit results as matches complete
8. Verify winners after all matches resolved
9. Announce results and celebrate winners

#### 8. Common Pitfalls to Avoid

❌ **Don't:**
- Create events without adding matches first
- Set `max_participants` too low for public events
- Use ambiguous team names
- Share invite codes before matches are added
- Cancel events unnecessarily
- Submit incorrect results

✅ **Do:**
- Plan your event thoroughly before creation
- Test with a small group first
- Communicate clearly and frequently
- Verify all match details before publishing
- Keep participants informed throughout
- Learn from each event to improve the next

---

## Summary

As a creator, you have powerful tools to host engaging prediction events on InsightArena. Remember:

1. **Create** events with clear titles and descriptions
2. **Add matches** with accurate team names and times
3. **Share** your unique invite code with participants
4. **Monitor** participant engagement and match progress
5. **Verify** results promptly after matches complete
6. **Celebrate** winners and build community

---

*This guide covers the Creator role. Additional sections for Participants, Admins, and AI Oracle will be added in future updates.*

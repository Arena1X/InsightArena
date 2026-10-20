# Database Seeding

This directory contains scripts for seeding and resetting the development database with realistic test data.

## Overview

The seeding system provides:

- **10 sample events** (5 active, 3 completed, 2 cancelled)
- **50 matches** across events with realistic team names and timestamps
- **200 predictions** from various users with different outcomes
- **30 participants** across events with prediction statistics
- **5 winners** for completed events with rankings
- **10 verified addresses** for testing verification features

## Usage

### Seed Database

Populate the database with sample data:

```bash
npm run seed
```

This will:

1. Connect to the database
2. Insert all sample data
3. Display a summary of inserted records

### Reset Database

Clear all seeded data and prepare for re-seeding:

```bash
npm run db:reset
```

This will:

1. Drop all seeded tables
2. Display confirmation

After resetting, run migrations and seed again:

```bash
npm run migration:run
npm run seed
```

## Data Structure

### Events

| Field       | Type      | Description                     |
| ----------- | --------- | ------------------------------- |
| id          | string    | Unique event identifier         |
| title       | string    | Event name                      |
| description | string    | Event details                   |
| status      | enum      | active, completed, or cancelled |
| created_at  | timestamp | Creation date                   |

**Sample Events:**

- Premier League Week 1 (active)
- Champions League Round 16 (active)
- NBA Finals 2026 (active)
- Wimbledon 2026 (completed)
- World Cup Qualifiers (completed)
- Formula 1 Season (cancelled)
- UFC Fight Night (active)
- Cricket World Cup (active)

### Matches

| Field      | Type   | Description                   |
| ---------- | ------ | ----------------------------- |
| id         | string | Unique match identifier       |
| event_id   | string | Parent event ID               |
| home_team  | string | Home team/player name         |
| away_team  | string | Away team/player name         |
| match_time | number | Unix timestamp                |
| status     | enum   | pending or completed          |
| result     | string | Outcome (home, away, or null) |

**Distribution:**

- Event 001: 10 matches (5 completed, 5 pending)
- Event 002: 10 matches (3 completed, 7 pending)
- Event 003: 10 matches (all pending)
- Event 004: 10 matches (all completed)
- Event 005: 10 matches (all completed)

### Predictions

| Field             | Type      | Description                          |
| ----------------- | --------- | ------------------------------------ |
| id                | string    | Unique prediction ID                 |
| user_address      | string    | Stellar wallet address               |
| match_id          | string    | Predicted match                      |
| predicted_outcome | string    | User's prediction (home, away, draw) |
| stake             | number    | Prediction stake amount              |
| created_at        | timestamp | Prediction timestamp                 |

**Distribution:**

- 200 total predictions
- Distributed across 30 users
- Random outcomes (home, away, draw)
- Random stake amounts (100-1100)

### Participants

| Field               | Type      | Description               |
| ------------------- | --------- | ------------------------- |
| id                  | string    | Unique participant ID     |
| address             | string    | Stellar wallet address    |
| event_id            | string    | Event ID                  |
| joined_at           | timestamp | Join timestamp            |
| total_predictions   | number    | Total predictions made    |
| correct_predictions | number    | Correct predictions count |

**Distribution:**

- 30 participants across events
- 5-50 predictions per participant
- 1-25 correct predictions per participant

### Winners

| Field    | Type   | Description             |
| -------- | ------ | ----------------------- |
| id       | string | Unique winner ID        |
| address  | string | Winner's wallet address |
| event_id | string | Event ID                |
| rank     | number | Ranking (1, 2, 3...)    |
| score    | number | Final score             |

**Sample Winners:**

- Event 004 (Wimbledon): 2 winners
- Event 005 (World Cup): 3 winners

### Verified Addresses

| Field       | Type      | Description            |
| ----------- | --------- | ---------------------- |
| address     | string    | Stellar wallet address |
| verified_at | timestamp | Verification timestamp |

**Distribution:**

- 10 verified addresses
- Random verification dates within last 60 days

## Testing with Seeded Data

After seeding, you can test endpoints:

```bash
# Get event by ID
curl http://localhost:3000/api/v1/creator-events/event-001

# Get event by invite code
curl http://localhost:3000/api/v1/creator-events/invite/ABC123

# Get event matches
curl http://localhost:3000/api/v1/creator-events/event-001/matches

# Get user score
curl http://localhost:3000/api/v1/creator-events/event-001/score/GUSER001

# Get participants
curl http://localhost:3000/api/v1/creator-events/event-001/participants
```

## Notes

- Seed data uses realistic team names and timestamps
- All relationships are maintained (foreign keys)
- Data is idempotent (safe to run multiple times)
- Timestamps are distributed across the last 60 days
- Predictions are randomly distributed across matches
- Accuracy percentages are calculated from correct/total predictions

# Contributing to InsightArena Backend

NestJS backend for the InsightArena prediction market platform.

---

## Prerequisites

- Node.js 20+
- pnpm 9 — `npm install -g pnpm`
- PostgreSQL database
- Make

---

## Getting Started

### 1. Install Dependencies

```bash
make install
# or directly
pnpm install --frozen-lockfile
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your local DB credentials and secrets
```

#### Environment Variables

| Variable              | Description                                                                                                                                                                                                                                                             | Example                                              |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `DATABASE_URL`        | PostgreSQL connection string                                                                                                                                                                                                                                            | `postgresql://user:pass@localhost:5432/insightarena` |
| `JWT_SECRET`          | Secret for signing JWTs — min 32 chars                                                                                                                                                                                                                                  | any long random string                               |
| `JWT_EXPIRES_IN`      | JWT expiry duration                                                                                                                                                                                                                                                     | `7d`                                                 |
| `STELLAR_NETWORK`     | Stellar network to connect to                                                                                                                                                                                                                                           | `testnet` or `mainnet`                               |
| `SOROBAN_CONTRACT_ID` | Deployed Soroban contract ID — leave as placeholder until contract is deployed                                                                                                                                                                                          | `your-contract-id-here`                              |
| `SERVER_SECRET_KEY`   | Stellar secret key used by the server to sign transactions. Generate one at [Stellar Laboratory](https://laboratory.stellar.org/#account-creator?network=test) or run `node -e "const sdk=require('@stellar/stellar-sdk'); console.log(sdk.Keypair.random().secret())"` | `SXXXXX...`                                          |
| `PORT`                | HTTP port the server listens on                                                                                                                                                                                                                                         | `3000`                                               |

> **Note:** `SERVER_SECRET_KEY` must be a valid Stellar secret key starting with `S`. On testnet you can generate and fund one for free at [Stellar Laboratory](https://laboratory.stellar.org/#account-creator?network=test).

### 3. Database Setup

```bash
# Run migrations
pnpm run migration:run

# Generate a new migration
pnpm run migration:generate -- src/migrations/MigrationName

# Revert last migration
pnpm run migration:revert
```

### 4. Run the Project

```bash
# Development (watch mode)
pnpm run start:dev

# Standard start
pnpm run start

# Production
pnpm run start:prod
```

API: `http://localhost:3000/api/v1`  
Swagger: `http://localhost:3000/api/v1/docs`

---

## Health Check

**Endpoint**: `GET /api/v1/health` (public, no auth)

Verifies:

- HTTP service is responding
- PostgreSQL connection is active
- Disk space is available (alerts at 90% usage)

```bash
curl -f http://localhost:3000/api/v1/health || exit 1
```

---

## Development Workflow

```bash
# 1. Create a feature branch
git checkout -b feature/your-feature-name

# 2. Develop with watch mode
pnpm run start:dev

# 3. Run CI checks before committing
make ci

# 4. Commit and push only if all checks pass
git add .
git commit -m "feat: describe your change"
git push origin feature/your-feature-name
```

---

## CI Checks

Always run the full pipeline before committing. This mirrors exactly what GitHub Actions runs.

```bash
make ci
```

This runs in order:

1. ✅ ESLint — code quality
2. ✅ Jest unit tests — all `*.spec.ts` files
3. ✅ TypeScript build — via NestJS CLI

### Individual Commands

```bash
make lint    # Run ESLint only
make test    # Run Jest only
make build   # Build only
make clean   # Remove dist/ and coverage/
make help    # List all targets
```

---

## Troubleshooting CI Failures

### Linting errors

```bash
# Auto-fix most issues
pnpm run lint

# Check without fixing
pnpm run lint -- --fix=false

# Check a specific file
pnpm run lint -- src/path/to/file.ts
```

### Test failures

```bash
# Run a specific test file
pnpm run test -- roles.guard.spec.ts

# Run in watch mode for debugging
pnpm run test:watch

# Run with coverage report
pnpm run test:cov
```

### Build errors

```bash
# Clean and rebuild
make clean && make build
```

### pnpm not found

```bash
npm install -g pnpm
```

### make not found

**Ubuntu/Debian:**

```bash
sudo apt-get install build-essential
```

**macOS:**

```bash
xcode-select --install
```

**Windows:** Use WSL or run commands directly:

```bash
pnpm run lint && pnpm run test && pnpm run build
```

### Database connection issues

Ensure `DATABASE_URL` in `.env` is correct:

```
DATABASE_URL=postgresql://user:password@localhost:5432/insightarena
```

### TypeORM "Data type Object not supported" error

This happens when a TypeORM `@Column` decorator is on a property typed as a union (e.g. `string | null`) without an explicit `type`. TypeScript emits `Object` as the reflected metadata for union types, which TypeORM can't map to Postgres.

**Fix:** Always specify `type` explicitly on nullable columns:

```ts
// ❌ Bad — TypeScript emits Object for string | null
@Column({ nullable: true })
my_field: string | null;

// ✅ Good — explicit type prevents the issue
@Column({ type: 'text', nullable: true })
my_field: string | null;

// ✅ Good — for UUID foreign keys
@Column({ type: 'uuid', nullable: true })
resolved_by: string | null;
```

### TypeORM "relation does not exist" error

The database table hasn't been created yet. You need to run migrations:

```bash
pnpm migration:run
```

If `migration:run` says "No migrations are pending" but the table still doesn't exist, the migration path glob may not be resolving. As a one-time fix you can temporarily set `synchronize: true` in `src/app.module.ts`, start the server once to create all tables, then set it back to `false`.

### Writing migrations

When you add or change an entity, always generate a migration — never rely on `synchronize: true` in production:

```bash
# Generate a migration from entity diff
pnpm migration:generate src/migrations/DescribeYourChange

# Review the generated file before running it
# Make sure it only contains the changes you expect — not a full schema dump

# Apply it
pnpm migration:run
```

> **Warning:** If `migration:generate` produces a file that recreates existing tables (users, markets, etc.), it means it diffed against an empty database instead of your live one. Delete that file and check your `DATABASE_URL` is pointing to the correct database before regenerating.

---

## Code Quality Standards

### TypeScript

- Avoid `any` — use strict types
- Prefer interfaces for object shapes
- Use enums for fixed value sets

### Testing

- Write unit tests for all guards, services, and controllers
- Target >80% code coverage
- Test both success and error paths
- Use descriptive test names

### Linting & Formatting

- ESLint rules must pass (`make lint`)
- Prettier handles formatting (configured in `.prettierrc`)
- No unused variables or imports

---

## Need Help?

- Check [README.md](../README.md) for setup instructions
- Open an issue for bugs or questions
- Join the community on Telegram: https://t.me/+hR9dZKau8f84YTk0

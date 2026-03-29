# Backend API

NestJS backend for InsightArena prediction market platform.

## API Documentation

- **Base URL**: `http://localhost:3000/api/v1`
- **Swagger UI**: `http://localhost:3000/api/v1/docs`
- **OpenAPI Schema**: `http://localhost:3000/api/v1/docs-json`

The API uses URI-based versioning. All endpoints are prefixed with `/api/v1/`.

## Health Check

The health check endpoint provides comprehensive service status monitoring:

**Endpoint**: `GET /api/v1/health`  
**Authentication**: None (public)  
**Response**: 200 OK or 503 Service Unavailable

The health check verifies:
- **HTTP**: Service is responding to requests
- **Database**: PostgreSQL connection is active
- **Storage**: Disk space is available (alerts at 90% usage)

### Using Health Check in CI/CD

Before deploying, verify the service is healthy:

```bash
# Development
curl -f http://localhost:3000/api/v1/health || exit 1

# Docker/Container
curl -f http://backend:3000/api/v1/health || exit 1

# Example in GitHub Actions
- name: Check service health
  run: |
    npm run start:prod &
    sleep 5
    curl -f http://localhost:3000/api/v1/health || exit 1
```

## Prerequisites

- Node.js 18+ and pnpm
- PostgreSQL database
- Make (for running CI checks)

## Project setup

```bash
$ pnpm install
```

## Environment Configuration

Copy `.env.example` to `.env` and configure your environment variables:

```bash
cp .env.example .env
```

## Database Setup

Run migrations to set up the database schema:

```bash
# Generate a new migration
$ pnpm run migration:generate -- src/migrations/MigrationName

# Run migrations
$ pnpm run migration:run

# Revert last migration
$ pnpm run migration:revert
```

## Compile and run the project

```bash
# development
$ pnpm run start

# watch mode
$ pnpm run start:dev

# production mode
$ pnpm run start:prod
```

## Run tests

```bash
# unit tests
$ pnpm run test

# e2e tests
$ pnpm run test:e2e

# test coverage
$ pnpm run test:cov

# watch mode
$ pnpm run test:watch
```

## CI/CD Pipeline Checks

The project includes a Makefile for running CI checks before committing code. This ensures code quality and prevents build failures.

### Available Make Commands

```bash
# Run all CI checks (lint + test + build)
$ make ci

# Run linter only
$ make lint

# Run tests only
$ make test

# Build project only
$ make build

# Install dependencies
$ make install

# Clean build artifacts
$ make clean

# Show help
$ make help
```

### Before Committing Code

Always run the full CI pipeline to ensure your changes pass all checks:

```bash
$ make ci
```

This will:
1. ✅ Run ESLint to check code quality
2. ✅ Run all unit tests
3. ✅ Build the TypeScript project

If any step fails, fix the issues before committing.

### Troubleshooting CI Failures

**Linting errors:**
```bash
# Auto-fix linting issues
$ pnpm run lint

# Check without fixing
$ pnpm run lint -- --fix=false
```

**Test failures:**
```bash
# Run tests in watch mode to debug
$ pnpm run test:watch

# Run specific test file
$ pnpm run test -- path/to/test.spec.ts
```

**Build errors:**
```bash
# Check TypeScript compilation
$ pnpm run build

# Clean and rebuild
$ make clean && make build
```


```

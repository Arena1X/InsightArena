.PHONY: ci lint test build install clean migrate help

# Default target
help:
	@echo "Backend CI/CD Pipeline Checks"
	@echo "=============================="
	@echo "Available targets:"
	@echo "  make ci       - Run all CI checks (lint, test, build, migrate)"
	@echo "  make lint     - Run ESLint"
	@echo "  make test     - Run Jest unit tests"
	@echo "  make build    - Build TypeScript project"
	@echo "  make migrate  - Run pending database migrations"
	@echo "  make install  - Install dependencies"
	@echo "  make clean    - Clean build artifacts"

# Run all CI checks
ci: lint test build
	@echo "✅ All CI checks passed!"

# Install dependencies
install:
	@echo "📦 Installing dependencies..."
	pnpm install --frozen-lockfile

# Run linter
lint:
	@echo "🔍 Running linter..."
	pnpm run lint

# Run tests
test:
	@echo "🧪 Running tests..."
	pnpm run test

# Build project
build:
	@echo "🏗️  Building project..."
	pnpm run build

# Run database migrations
migrate:
	@echo "🗄️  Running database migrations..."
	pnpm run migration:run

# Clean build artifacts
clean:
	@echo "🧹 Cleaning build artifacts..."
	rm -rf dist coverage

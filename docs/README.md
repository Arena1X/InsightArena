# InsightArena API Documentation

This directory contains the checked-in, browsable API reference and OpenAPI specification for InsightArena.

## Browsing the Documentation

- **Static Reference UI**: Open [`index.html`](./index.html) in any modern web browser (`file:///.../docs/index.html` or through any static file server).
- **OpenAPI 3.0 Specification**: [`openapi.json`](./openapi.json).

The static UI embeds the OpenAPI spec using Swagger UI and does not require a running backend server or external internet connectivity after the initial page load.

---

## Regenerating the API Reference

Whenever backend endpoints, DTOs, or Swagger decorators are updated, regenerate the specification and static UI using either of the following commands:

### Option 1: From the running backend

Start the backend server:
```bash
cd backend
pnpm run start:dev
```

In another terminal, export the documentation:
```bash
cd backend
pnpm run swagger:export
```
or
```bash
pnpm run docs:generate
```

This exports the live OpenAPI document from `http://localhost:3000/api/v1/docs-json` and re-renders both:
- `docs/openapi.json`
- `docs/index.html` (and `backend/docs/`)

### Option 2: Standalone / Offline generation

You can also run the export script without a running server:
```bash
cd backend
pnpm run swagger:export
```
The script will automatically detect that no local server is running and generate the OpenAPI document and static HTML reference offline.

### Validating the Export

Run the documentation export verification test suite:
```bash
cd backend
pnpm run docs:verify
```

# Search Query Validation and Sanitization

## Overview

This document describes the validation and sanitization measures implemented for the search module to prevent SQL injection, performance degradation, and security issues from malicious or malformed user input.

## Problem Statement

Previously, the search module accepted free-text user input without proper validation:
- No minimum or maximum length constraints
- Single-character queries caused full table scans
- Pathological inputs (thousand-character strings, SQL LIKE wildcards like `%` and `_`) could degrade database performance
- No sanitization of special characters

## Solution

### 1. SearchQueryDto Validation

A new `SearchQueryDto` class provides comprehensive validation:

**Location:** `backend/src/search/dto/search-query.dto.ts`

**Validation Rules:**
- ✅ **Type validation:** Must be a string
- ✅ **Minimum length:** 2 characters (after trimming)
- ✅ **Maximum length:** 100 characters (after trimming)
- ✅ **Whitespace handling:**
  - Automatically trims leading/trailing whitespace
  - Collapses internal runs of spaces to single spaces
- ✅ **Non-empty:** Rejects whitespace-only queries

**Transformation Pipeline:**
```typescript
"  bitcoin    price  " → "bitcoin price"
```

### 2. SQL LIKE Wildcard Escaping

A utility function `escapeLikeWildcards()` escapes SQL LIKE wildcards:

**What it does:**
- Escapes `%` (matches any sequence of characters) as `\%`
- Escapes `_` (matches any single character) as `\_`
- Applied to the `getSuggestions()` endpoint which uses ILIKE queries

**Why it's needed:**
- Prevents users from injecting wildcard patterns
- Forces literal matching of `%` and `_` characters
- Protects against performance degradation from malicious patterns

**Example:**
```typescript
escapeLikeWildcards("100%") → "100\\%"
escapeLikeWildcards("user_name") → "user\\_name"
```

**Note:** The main `search()` endpoint uses PostgreSQL full-text search (`plainto_tsquery`) which operates on lexemes, not pattern matching, so wildcard escaping is not needed there.

### 3. Error Responses

**HTTP 400 Bad Request** is returned for:
- Queries with less than 2 characters
- Queries with more than 100 characters
- Whitespace-only queries
- Non-string values (null, undefined, numbers, objects, arrays)

**Error message examples:**
```json
{
  "statusCode": 400,
  "message": [
    "Search query must be at least 2 characters long"
  ],
  "error": "Bad Request"
}
```

```json
{
  "statusCode": 400,
  "message": [
    "Search query cannot be empty or whitespace-only"
  ],
  "error": "Bad Request"
}
```

### 4. Empty Results vs Errors

- **Invalid queries** (validation failures) → HTTP 400 error
- **Valid queries with no matches** → HTTP 200 with empty results

```json
// Valid query, no matches
{
  "markets": [],
  "users": [],
  "competitions": [],
  "total": 0,
  "page": 1,
  "limit": 20
}
```

## Implementation Details

### Files Modified

1. **`dto/search-query.dto.ts`** (NEW)
   - `SearchQueryDto` class with validators
   - `IsNotWhitespaceOnly` custom validator
   - `escapeLikeWildcards()` utility function

2. **`dto/global-search.dto.ts`** (MODIFIED)
   - Updated `GlobalSearchDto.query` with enhanced validation
   - Import custom validator

3. **`search.controller.ts`** (MODIFIED)
   - Added `SearchQueryDto` to `getSuggestions()` endpoint
   - Updated API documentation with 400 response
   - Added ValidationPipe to suggestions endpoint

4. **`search.service.ts`** (MODIFIED)
   - Import `escapeLikeWildcards` function
   - Apply escaping in `getSuggestions()` ILIKE queries
   - Removed redundant length check (now handled by DTO)

### Tests Added

1. **`dto/search-query.dto.spec.ts`** (NEW)
   - 40+ test cases covering:
     - Valid queries (2-100 characters)
     - Invalid queries (too short, too long)
     - Whitespace normalization
     - Type validation
     - Wildcard escaping function

2. **`search.controller.spec.ts`** (NEW)
   - Controller-level validation tests
   - Integration with ValidationPipe

3. **`search-integration.spec.ts`** (NEW)
   - Integration tests for wildcard escaping
   - Verifies escaped queries reach the database layer

4. **`search.service.spec.ts`** (MODIFIED)
   - Updated to remove tests for service-level validation (moved to DTO)

## Acceptance Criteria - Status

✅ **No user input can inject LIKE wildcards or oversized scans into search SQL**
- Wildcards escaped in ILIKE queries
- Length limited to 100 characters

✅ **Validation errors are 400s with actionable messages**
- All validation failures return HTTP 400
- Clear, specific error messages

✅ **All rules pinned by unit tests**
- Comprehensive test coverage:
  - `search-query.dto.spec.ts`: 40+ tests
  - `search.controller.spec.ts`: 8+ tests
  - `search-integration.spec.ts`: 5+ tests

✅ **SearchQueryDto validates:**
- ✅ Trimmed non-empty string
- ✅ Min length 2
- ✅ Max length 100
- ✅ Whitespace normalization
- ✅ Type safety

✅ **Escape SQL LIKE wildcards (%, _)**
- Implemented in `escapeLikeWildcards()`
- Applied to `getSuggestions()` endpoint

✅ **Return 400 for invalid queries; empty results for valid queries with no matches**
- Validation pipe handles 400 errors
- Service returns empty arrays for no matches

## Usage Examples

### Valid Requests

```bash
# Minimum length query
GET /search?query=ab

# Normal query
GET /search?query=bitcoin%20price

# Maximum length query (100 chars)
GET /search?query=aaa...aaa  # exactly 100 characters

# Query with wildcards (escaped automatically)
GET /search/suggestions?query=100%25  # URL-encoded %
```

### Invalid Requests

```bash
# Too short (1 character)
GET /search?query=a
# Response: 400 "Search query must be at least 2 characters long"

# Too long (101 characters)
GET /search?query=aaa...aaa  # 101 characters
# Response: 400 "Search query must not exceed 100 characters"

# Whitespace only
GET /search?query=%20%20%20
# Response: 400 "Search query cannot be empty or whitespace-only"

# Empty
GET /search?query=
# Response: 400 "Search query cannot be empty or whitespace-only"
```

## Performance Impact

### Before
- Single-character queries → Full table scans
- Unlimited length queries → Excessive database load
- Unescaped wildcards → Unpredictable query patterns

### After
- Minimum 2 characters → More selective queries
- Maximum 100 characters → Bounded query complexity
- Escaped wildcards → Predictable LIKE patterns
- Normalized whitespace → Consistent search behavior

## Security Considerations

1. **SQL Injection Prevention**
   - All queries use parameterized queries (TypeORM)
   - LIKE wildcards escaped to prevent pattern injection
   - Input length bounded to prevent DoS

2. **Performance Protection**
   - Minimum length prevents overly broad searches
   - Maximum length prevents pathological inputs
   - Wildcard escaping prevents expensive pattern matching

3. **Input Sanitization**
   - Whitespace normalization
   - Type validation
   - Character set validation (string only)

## Future Enhancements

Potential improvements for consideration:
- Rate limiting on search endpoints
- Query complexity scoring
- Search analytics and abuse detection
- Additional character set restrictions (e.g., no control characters)
- Query logging for security monitoring

## Testing

Run the search module tests:

```bash
# All search tests
npm test -- --testPathPattern=search

# Specific test files
npm test search-query.dto.spec.ts
npm test search.controller.spec.ts
npm test search-integration.spec.ts
npm test search.service.spec.ts
```

## References

- [OWASP Input Validation](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html)
- [NestJS Validation](https://docs.nestjs.com/techniques/validation)
- [PostgreSQL LIKE Patterns](https://www.postgresql.org/docs/current/functions-matching.html)
- [TypeORM Query Builder](https://typeorm.io/select-query-builder)

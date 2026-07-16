# Testing Guide

Complete testing infrastructure for the SaveIt extension.

## Quick Start

```bash
# Install dependencies
npm install

# Run all tests
npm test

# Watch mode (re-run on changes)
npm run test:watch

# Test coverage
npm run test:coverage

# E2E tests
npm run test:e2e

# Pre-deployment checks (recommended before release)
./scripts/pre-deploy-check.sh
```

## Test Structure

```
tests/
├── setup.js                 # Global test configuration
├── unit/                    # Unit tests (fast, isolated)
│   ├── api/                 # API-layer tests (mode detection, auth, crud, ...)
│   ├── newtab-*.test.js     # New-tab surface (app, drawer, auth, home, ...)
│   ├── background.test.js   # Service worker logic
│   └── ...                  # One test file per module
├── integration/             # Cross-module behavior (e.g. realtime relay)
└── e2e/                     # End-to-end tests (full user flows in a browser)
    └── *.spec.js
```

Run `find tests -name '*.test.js' -o -name '*.spec.js'` for the full list.

## Unit Tests

Test individual functions and modules in isolation.

```javascript
// tests/unit/api/mode-detection.test.js
import { describe, it, expect } from 'vitest';

describe('mode detection', () => {
  it('returns standalone in file:// context', () => {
    // ...asserts api.js environment detection
  });
});
```

**Run:** `npm test` or `npm run test:watch`

**Coverage thresholds:**
- Lines: 70%
- Functions: 70%
- Branches: 65%
- Statements: 70%

## Integration Coverage

The current suite covers cross-module behavior in `tests/integration/` (e.g. the realtime relay that refreshes the new-tab view on a `project_page_changed` event), plus the standalone Playwright flows in `tests/e2e/`.

**Run:** Same as unit tests (`npm test`) plus `npm run test:e2e`

## E2E Tests

Test complete user workflows in a real browser.

```javascript
// tests/e2e/standalone.spec.js
test('should search and filter pages', async ({ page }) => {
  await page.goto(`file://${newtabPath}`);
  await page.fill('#saved-pages-search-input', 'JavaScript');

  const results = await page.locator('.saved-pages-drawer-card').count();
  expect(results).toBeGreaterThan(0);
});
```

**Run:** `npm run test:e2e`
**UI Mode:** `npm run test:e2e:ui` (interactive debugging)

**Coverage:**
- ✓ Search/filter functionality
- ✓ Theme switching
- ✓ Discovery mode (tag clicking)
- ✓ Page opening
- ✓ Empty states

## Schema Validation

Runtime validation of API responses using Zod.

```javascript
// src/validators.js
import { PageSchema, validatePages } from './validators.js';

// Validate API response
const pages = await fetch('/api/pages').then(r => r.json());
const validPages = validatePages(pages); // Filters out invalid entries
```

**Benefits:**
- Catches backend schema changes early
- Prevents runtime errors from malformed data
- Documents expected data shape

## Pre-Deployment Checklist

Automated script that runs all checks before release.

```bash
./scripts/pre-deploy-check.sh
```

**Checks performed:**
1. Dependencies installed
2. Linting passes
3. Unit tests pass
4. Test coverage meets thresholds
5. Manifest validation
6. Version consistency (manifest vs package.json vs git tags)
7. No uncommitted changes
8. Build succeeds
9. Manual testing prompts (standalone & extension mode)
10. E2E tests (optional)

**Exit codes:**
- `0` = All checks passed, safe to deploy
- `1` = Checks failed, fix issues before deploying

## CI/CD Pipeline

GitHub Actions automatically run on every PR and push.

### PR Checks (`.github/workflows/pr-checks.yml`)

**Jobs:**
1. **Lint & Validate** - ESLint + manifest validation
2. **Unit & Integration Tests** - Full test suite + coverage
3. **Build** - Ensure extension builds successfully
4. **E2E Tests** - Playwright tests in Firefox
5. **Security Audit** - pnpm audit for vulnerabilities

**Status:** Required to pass before merging

### Release Workflow (`.github/workflows/release.yml`)

Triggered when pushing version tags (e.g., `v1.0.0`):
1. Build extension
2. Sign with Mozilla
3. Create GitHub Release
4. Update `updates.json` for auto-updates

## Git Hooks

### Pre-commit (`.husky/pre-commit`)

Runs before every commit:
- ✓ Lint check
- ✓ Unit tests
- ⚠️  Warns about `console.log` statements

**Skip:** `git commit --no-verify` (not recommended)

### Pre-push (`.husky/pre-push`)

Runs before pushing:
- ✓ Version validation (tags match manifest)
- ✓ Quick test suite

**Setup:** Hooks install automatically via `npm install` (see `package.json` `prepare` script)

## Environment-Specific Testing

### Development Mode (Standalone)

```bash
# Open in browser
just preview
# or
open src/newtab.html
```

- Uses mock data
- No OAuth required
- Fast iteration

### Extension Mode

```bash
# Auto-reload on changes
just run

# Or manual install
just install
```

- Real session-token auth (Google OAuth via `launchWebAuthFlow` → backend-issued session token)
- Cloud Function integration
- Production-like behavior

### Staging Environment

Deploy to staging to test against the real backend before production:

```bash
# Bump patch version, tag, and push to trigger a staging release
just deploy-staging
```

- Staging Cloud Function: `https://saveit-staging-5pu7ljvnuq-uc.a.run.app`
- Real data, safe to break

Note: Firefox manifest versions must be dot-separated numbers, so staging releases use a numeric patch bump rather than a `-beta` suffix. (`config.js` still maps any version containing `beta` to staging, but that path isn't used for the signed Firefox build.)

## Writing New Tests

### Unit Test Template

```javascript
// tests/unit/my-module.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { myFunction } from '../../src/my-module.js';

describe('myFunction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should do something', () => {
    const result = myFunction('input');
    expect(result).toBe('expected');
  });

  it('should handle edge cases', () => {
    expect(() => myFunction(null)).toThrow();
  });
});
```

### E2E Test Template

```javascript
// tests/e2e/my-feature.spec.js
import { test, expect } from '@playwright/test';

test.describe('My Feature', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`file://${newtabPath}`);
  });

  test('should work as expected', async ({ page }) => {
    await page.click('#my-button');
    await expect(page.locator('.result')).toContainText('Success');
  });
});
```

## Debugging Tests

### Unit Tests

```bash
# Run specific test file
npx vitest tests/unit/background.test.js

# Run tests matching pattern
npx vitest -t "should filter by search"

# Debug in VS Code
# Add breakpoint → F5 → Select "Vitest" configuration
```

### E2E Tests

```bash
# UI mode (interactive, visual)
npm run test:e2e:ui

# Debug mode (headed browser, slow)
npx playwright test --debug

# Trace viewer (record and replay)
npx playwright test --trace on
npx playwright show-trace trace.zip
```

## Common Issues

### "Cannot find module" errors

```bash
# Ensure dependencies installed
npm install

# Clear Vitest cache
npx vitest --run --no-cache
```

### E2E tests timing out

```bash
# Increase timeout in playwright.config.js
# or use --timeout flag
npx playwright test --timeout=60000
```

### Coverage below threshold

```bash
# View HTML coverage report
npm run test:coverage
open coverage/index.html

# Find untested code (red = not covered)
```

## Best Practices

1. **Test behavior, not implementation** - Focus on what the code does, not how
2. **Keep tests fast** - Unit tests should run in milliseconds
3. **One assertion per test** - Makes failures easier to diagnose
4. **Use descriptive names** - Test name should explain what's being tested
5. **Test edge cases** - null, undefined, empty arrays, errors
6. **Mock external dependencies** - API calls, browser APIs, timers
7. **Run tests before committing** - Hooks enforce this automatically

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Playwright Documentation](https://playwright.dev/)
- [Zod Schema Validation](https://zod.dev/)
- [Testing Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)

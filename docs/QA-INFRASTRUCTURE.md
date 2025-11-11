# QA Infrastructure Overview

Complete testing and quality assurance system for SaveIt extension.

## 🎯 Goals

1. **Catch bugs before production** - Automated testing at multiple levels
2. **Fast iteration** - Tests run in seconds, not minutes
3. **Confidence in releases** - Comprehensive pre-deployment checks
4. **Prevent regressions** - CI/CD blocks bad code from merging

## 📊 Testing Pyramid

```
          /\
         /  \  E2E Tests (Playwright)
        /----\  ↑ Slow, comprehensive user flows
       /      \
      / Integration Tests (Vitest)
     /   ↑ Components working together
    /------------------------\
   /   Unit Tests (Vitest)   \
  /  ↑ Fast, isolated functions \
 /--------------------------------\
```

**Coverage:** 70%+ across lines, functions, branches

## 🛠️ Components

### 1. Test Framework (Vitest)

- **Unit tests**: Individual functions (API, Components)
- **Integration tests**: Dashboard rendering, search, filters
- **Coverage**: 70% minimum threshold enforced
- **Speed**: ~200ms for full unit test suite

**Commands:**
```bash
just test           # Run all tests
just test-watch     # Watch mode
just test-coverage  # With coverage report
```

### 2. E2E Testing (Playwright)

- **Browser**: Firefox (production environment)
- **Tests**: User workflows (search, theme switching, discovery mode)
- **UI Mode**: Interactive debugging with time-travel
- **Speed**: ~30 seconds for full E2E suite

**Commands:**
```bash
just test-e2e       # Run E2E tests
just test-e2e-ui    # Interactive UI mode
```

### 3. Schema Validation (Zod)

- **Runtime validation**: API responses checked against schema
- **Type safety**: Ensures backend/frontend contract
- **Graceful degradation**: Invalid data filtered out, doesn't crash

**Usage:**
```javascript
import { validatePages } from './validators.js';

const pages = await API.getSavedPages();
const validPages = validatePages(pages); // Auto-filters invalid
```

### 4. Error Reporting

- **Development**: Logs to console
- **Staging**: Sends to Slack/error tracker
- **Production**: Sends to monitoring service (Sentry/custom)
- **Global handlers**: Catches unhandled promises and errors

**Usage:**
```javascript
import { reportError } from './error-reporter.js';

try {
  await riskyOperation();
} catch (error) {
  reportError(error, { context: 'user_action', user_id: '123' });
  showUserFriendlyMessage();
}
```

### 5. Pre-Deployment Checklist

Automated script (`scripts/pre-deploy-check.sh`) that runs:

1. ✓ Dependencies check
2. ✓ Linting (ESLint + web-ext)
3. ✓ Unit tests
4. ✓ Test coverage thresholds
5. ✓ Manifest validation
6. ✓ Version consistency
7. ✓ Git status (uncommitted changes warning)
8. ✓ Build test
9. ⚠️ Manual testing prompts (standalone + extension)
10. ⚠️ E2E tests (optional)

**Run before every release:**
```bash
just pre-deploy
```

### 6. CI/CD Pipeline (GitHub Actions)

**On every PR:**
- Lint & validate
- Unit + integration tests (with coverage)
- Build verification
- E2E tests
- Security audit

**On version tag push:**
- All PR checks
- Build & sign extension
- Create GitHub Release
- Update auto-update manifest

**Status:** Required before merge

### 7. Git Hooks (Husky)

**Pre-commit (fast, ~5-10s):**
- Runs ESLint
- Validates manifest.json (web-ext lint)
- Runs unit tests
- Warns about console.log

**Pre-push (comprehensive, ~15-30s):**
- Validates version tags match manifest
- Runs tests with coverage (70%+ threshold enforced)
- Verifies build works

**Setup:** Auto-installed via `npm install`

### 8. Environment-Specific Configs

Three environments with auto-detection:

```javascript
// Development (file:// protocol)
cloudFunctionUrl: 'http://localhost:8080'
enableErrorReporting: false
enableDebugLogging: true

// Staging (version includes 'beta')
cloudFunctionUrl: 'https://saveit-staging-xxx.run.app'
enableErrorReporting: true
enableDebugLogging: true

// Production (normal releases)
cloudFunctionUrl: 'https://saveit-xxx.run.app'
enableErrorReporting: true
enableDebugLogging: false
```

## 🚀 Development Workflow

### Daily Development

```bash
# 1. Start with tests in watch mode
just test-watch

# 2. Make changes to src/

# 3. Tests auto-run and catch issues immediately

# 4. Preview in standalone mode
just preview

# 5. Test in extension mode
just run
```

### Before Committing

```bash
# Git hooks automatically run:
# - Linter
# - Tests

# Manual check
just check
```

### Before Releasing

```bash
# 1. Run comprehensive pre-deployment checks
just pre-deploy

# 2. If all pass, bump version
just bump patch  # or minor/major

# 3. Push with tags
git push origin main --tags

# 4. GitHub Actions handles the rest
```

### Staging Release (Beta Testing)

```bash
# Deploy beta version to staging environment
just deploy-staging 0.14.0

# Test with real backend for 24-48 hours
# If stable, promote to production

just bump minor
git push origin main --tags
```

## 📈 Quality Metrics

### Current Status

- **Unit test coverage**: Target 70%+ ✓
- **E2E test coverage**: Core flows ✓
- **CI/CD pass rate**: Should be >95%
- **Pre-deployment check**: Required before release ✓

### Monitoring

- **GitHub Actions**: View test results per PR/commit
- **Coverage reports**: Uploaded to Codecov (optional)
- **Error tracking**: Production errors reported to monitoring service

## 🐛 Debugging Failed Tests

### Unit Tests Failing

```bash
# Run specific test file
npx vitest tests/unit/api.test.js

# Run with pattern
npx vitest -t "should filter by search"

# Debug in VS Code
# Set breakpoint → F5 → Select "Vitest"
```

### E2E Tests Failing

```bash
# UI mode (see what's happening)
just test-e2e-ui

# Debug mode (step through)
npx playwright test --debug

# View trace (record and replay)
npx playwright show-trace trace.zip
```

### CI Failing Locally Passing

```bash
# Simulate CI environment
just ci-check

# Check for:
# - Uncommitted files
# - Environment-specific code
# - Race conditions (timing issues)
```

## 📚 Documentation

- **Full testing guide**: `docs/TESTING.md`
- **Test examples**: `tests/` directory
- **CI/CD config**: `.github/workflows/`
- **Pre-deployment script**: `scripts/pre-deploy-check.sh`

## 🎓 Best Practices

1. **Write tests first** (TDD) when fixing bugs
2. **Run tests before committing** (hooks enforce this)
3. **Check coverage** - aim for 70%+ on new code
4. **Run pre-deploy script** before every release
5. **Use staging** for risky changes
6. **Monitor production errors** via error reporting
7. **Keep tests fast** - unit tests should be <1s total
8. **Test edge cases** - null, undefined, empty arrays, errors

## 🔄 Continuous Improvement

### Metrics to Track

- Test coverage percentage
- CI/CD pass rate
- Bug escape rate (production bugs / total bugs)
- Time to detect bugs (caught in dev vs staging vs production)

### Goals

- **95%+ CI pass rate** - Indicates stable test suite
- **<5% bug escape rate** - Most bugs caught before production
- **<24h detection time** - Bugs found quickly via staging/error monitoring

## 🆘 Common Issues

**"Tests pass locally but fail in CI"**
→ Run `just ci-check` to simulate CI environment

**"E2E tests are flaky"**
→ Add explicit waits, increase timeouts, check for race conditions

**"Coverage below threshold"**
→ Check `coverage/index.html` for untested code paths

**"Pre-deployment script fails"**
→ Read error message, fix issue, re-run

**"Git hooks blocking commit"**
→ Fix linting/test issues. Never use `--no-verify` to bypass.

## 📞 Support

- **Docs**: `docs/TESTING.md`
- **Issues**: GitHub Issues
- **Questions**: Ask in PR or commit message

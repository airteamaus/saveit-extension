# SaveIt Extension - Task Runner
# Run `just` to see all available commands

# Default recipe - show help
default:
    @just --list

# Build Firebase bundles
build-firebase:
    @node scripts/bundle-firebase.js

# Watch and rebuild Firebase bundles on changes
watch-firebase:
    @node scripts/watch-firebase.js

# Lint the extension with web-ext
lint:
    npx web-ext lint --ignore-files saveit-backend/ --ignore-files scripts/

# Lint JavaScript with ESLint
lint-js:
    npm run lint

# Lint and auto-fix issues
lint-fix:
    npm run lint:fix

# Run unit and integration tests
test:
    npm test

# Run tests in watch mode
test-watch:
    npm run test:watch

# Run tests with coverage report
test-coverage:
    npm run test:coverage

# Run E2E tests (automatically kills stale Playwright processes first)
test-e2e:
    npm run test:e2e

# Run E2E tests in UI mode (interactive)
test-e2e-ui:
    npm run test:e2e:ui

# Run all checks (lint, tests, build, validate)
check: lint-js lint test validate test-build test-csp

# CI check - simulate GitHub Actions locally
ci-check:
    @echo "Running CI checks locally..."
    @just lint-js
    @just lint
    @just test
    @just test-coverage
    @just build
    @echo "✅ All CI checks passed!"

# Pre-deployment checklist (comprehensive)
pre-deploy:
    ./scripts/pre-deploy-check.sh

# Run the extension in Firefox Developer Edition (auto-builds Firebase first)
run:
    @just build-firebase
    ./scripts/run-extension.sh

# Install in Firefox Developer Edition for persistent testing
install:
    ./scripts/install-dev.sh

# Build extension for Firefox (requires AMO_JWT credentials)
build:
    npm run build

# Build extension for Chrome (universal build works for both browsers)
build-chrome:
    @just build-firebase
    npx web-ext build --overwrite-dest

# Build for both Firefox and Chrome
build-all:
    @just build
    @just build-chrome

# Run extension in Chrome for testing
run-chrome:
    @just build-firebase
    npx web-ext run --target chromium

# Bump version (patch/minor/major) and create git tag
bump version="patch":
    @node scripts/bump-version.js {{version}}

# Generate CHANGELOG.md from conventional commits
changelog:
    @node scripts/generate-changelog.js

# Generate release notes for a specific version
release-notes version:
    @node scripts/generate-changelog.js release-notes {{version}}

# Open newtab.html in browser for standalone testing
preview:
    open src/newtab.html

# Validate manifest.json
validate:
    npm run validate

# Test that Firebase bundles build successfully
test-build:
    @echo "Testing Firebase bundle build..."
    @just build-firebase
    @echo "✓ Firebase bundles build successfully"

# Test for CSP violations in HTML files
test-csp:
    @./scripts/test-csp.sh

# Clean build artifacts
clean:
    rm -rf web-ext-artifacts/
    rm -rf coverage/
    rm -rf playwright-report/
    rm -rf test-results/
    rm -f *.xpi

# Install dependencies
install-deps:
    npm install

# Setup git hooks (husky)
setup-hooks:
    npm run prepare

# Clear Firefox extension cache (requires Firefox to be closed)
clear-cache:
    ./scripts/clear-firefox-cache.sh

# Deploy to staging (beta version)
deploy-staging version:
    @echo "Deploying v{{version}}-beta.1 to staging..."
    npm version {{version}}-beta.1
    git push origin main --tags
    @echo "✅ Staging deployment triggered!"
    @echo "Monitor: https://github.com/your-repo/actions"

# Promote staging to production
deploy-prod:
    @echo "Promoting to production..."
    @./scripts/pre-deploy-check.sh
    @echo ""
    @echo "If checks passed, bump version and push:"
    @echo "  just bump [patch|minor|major]"
    @echo "  git push origin main --tags"

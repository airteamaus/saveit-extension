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
    npx web-ext lint

# Run the extension in Firefox Developer Edition (auto-builds Firebase first)
run:
    @just build-firebase
    ./scripts/run-extension.sh

# Install in Firefox Developer Edition for persistent testing
install:
    ./scripts/install-dev.sh

# Build and sign the extension (requires AMO_JWT credentials)
build:
    ./scripts/build-and-sign.sh

# Bump version (patch/minor/major) and create git tag
bump version="patch":
    @node scripts/bump-version.js {{version}}

# Open newtab.html in browser for standalone testing
preview:
    open src/newtab.html

# Validate manifest.json
validate:
    @echo "Validating manifest.json..."
    @cat manifest.json | python3 -m json.tool > /dev/null && echo "✓ manifest.json is valid JSON"

# Test that Firebase bundles build successfully
test-build:
    @echo "Testing Firebase bundle build..."
    @just build-firebase
    @echo "✓ Firebase bundles build successfully"

# Test for CSP violations in HTML files
test-csp:
    @./scripts/test-csp.sh

# Run all checks (lint + validate + test build + CSP)
check: lint validate test-build test-csp

# Clean build artifacts
clean:
    rm -rf web-ext-artifacts/
    rm -f *.xpi

# Install dependencies
install-deps:
    npm install

# Setup git hooks (prevents pushing mismatched version tags)
setup-hooks:
    @echo "Installing git hooks..."
    @cp scripts/git-hooks/pre-push .git/hooks/pre-push
    @chmod +x .git/hooks/pre-push
    @echo "✓ Pre-push hook installed"
    @echo "  Prevents pushing version tags that don't match manifest.json"

# Clear Firefox extension cache (requires Firefox to be closed)
clear-cache:
    ./scripts/clear-firefox-cache.sh

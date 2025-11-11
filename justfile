# SaveIt Extension - Task Runner
# Run `just` to see all available commands

# Default recipe - show help
default:
    @just --list

# Lint the extension with web-ext
lint:
    npx web-ext lint

# Run the extension in Firefox Developer Edition
run:
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

# Run all checks (lint + validate)
check: lint validate

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

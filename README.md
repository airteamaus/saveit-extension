# SaveIt Browser Extension

Firefox extension for saving web pages to BigQuery with an intelligent dashboard.

## Quick Start

```bash
# Install dependencies
npm install

# Setup git hooks (one-time, prevents version tag errors)
just setup-hooks

# Lint extension
just lint

# Run in Firefox Developer Edition
just run

# Preview dashboard standalone
just preview
```

## Releasing

```bash
# Bump version (updates manifest.json, commits, creates tag)
just bump patch     # 0.9.0 → 0.9.1 (bug fixes)
just bump minor     # 0.9.0 → 0.10.0 (new features)
just bump major     # 0.9.0 → 1.0.0 (breaking changes)

# Push to GitHub (triggers automated build & release)
git push origin main --tags

# GitHub Actions will automatically:
# - Build and sign extension with Mozilla
# - Create GitHub Release with signed XPI
# - Update updates.json for auto-updates
```

**Important:** Always use `just bump` to create version tags. The pre-push hook (installed with `just setup-hooks`) prevents pushing tags that don't match the manifest.json version.

## Documentation

- [CLAUDE.md](CLAUDE.md) - Extension development guide for Claude Code
- [docs/README.md](docs/README.md) - Complete installation and usage guide
- [Backend docs](../saveit-backend/docs/) - Architecture and backend development

## Directory Structure

```
saveit-extension/
├── src/                  # Extension source code
│   ├── background.js     # Save button & OAuth logic
│   ├── newtab.html/js/css # Dashboard UI
│   ├── api.js           # API abstraction layer
│   ├── components.js    # UI component builders
│   ├── config.js        # Cloud Function URLs
│   ├── mock-data.js     # Test data for standalone mode
│   └── icon.png         # Extension icon
├── scripts/             # Build and utility scripts
│   ├── bump-version.js  # Version management
│   ├── git-hooks/       # Git hooks for validation
│   ├── build-and-sign.sh # Build & sign for release
│   ├── install-dev.sh   # Install for testing
│   └── run-extension.sh # Run temporarily
├── docs/                # Documentation
├── .github/workflows/   # GitHub Actions (auto-release)
├── manifest.json        # Extension metadata
└── justfile            # Task runner commands

Run `just` to see all available commands.

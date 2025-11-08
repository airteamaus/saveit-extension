# SaveIt Browser Extension

Firefox extension for saving web pages to BigQuery with an intelligent dashboard.

## Quick Start

```bash
# Install dependencies
npm install

# Lint extension
just lint

# Run in Firefox Developer Edition
just run

# Preview dashboard standalone
just preview
```

## Documentation

- [CLAUDE.md](docs/CLAUDE.md) - Development guide for Claude Code
- [DASHBOARD-README.md](docs/DASHBOARD-README.md) - Dashboard development details
- [Full README](docs/README.md) - Complete installation and usage guide

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
│   ├── build-and-sign.sh # Build & sign for release
│   ├── install-dev.sh   # Install for testing
│   └── run-extension.sh # Run temporarily
├── docs/                # Documentation
├── .github/workflows/   # GitHub Actions (auto-release)
├── manifest.json        # Extension metadata
└── justfile            # Task runner commands

Run `just` to see all available commands.

# SaveIt Browser Extension

**⚠️ BETA SOFTWARE** - This extension is in active development. Features may change and bugs may occur.

Save web pages with AI-powered organization. Automatically extracts content, generates summaries, and creates semantic tags using AI classification. Built for Firefox with intelligent semantic search.

## For Testers

### Firefox Installation (Recommended)

**Option 1: Install from GitHub Release (Signed)**
1. Go to [Releases](https://github.com/airteamaus/saveit-extension/releases)
2. Download the latest `.xpi` file
3. Open Firefox and go to `about:addons`
4. Click the gear icon ⚙️ → "Install Add-on From File..."
5. Select the downloaded `.xpi` file
6. Click "Add" when prompted

**Option 2: Temporary Installation (Development)**
1. Download or clone this repository
2. Open Firefox and go to `about:debugging#/runtime/this-firefox`
3. Click "Load Temporary Add-on..."
4. Navigate to the extension directory and select `manifest.json`
5. Extension will be active until Firefox restarts

### Chrome Installation (Experimental)

**Chrome support is experimental and not officially supported.**

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top-right)
4. Click "Load unpacked"
5. Select the extension directory
6. Extension will remain until manually removed

### Getting Started

1. **Sign in**: Click the SaveIt button in your toolbar and sign in with Google
2. **Save pages**: Click the SaveIt button on any page to save it
3. **View dashboard**: Click "New Tab" or set SaveIt as your new tab page
4. **Search & discover**: Use semantic search to find related content by topic

### Known Limitations (Beta)

- Chrome support is experimental and may have issues
- AI classification requires backend API access
- Some sites may block content extraction
- Large batch operations may be slow

### Reporting Issues

Found a bug? Please report it on [GitHub Issues](https://github.com/airteamaus/saveit-extension/issues) with:
- Browser version (Firefox/Chrome)
- Extension version (found in `about:addons`)
- Steps to reproduce
- Expected vs actual behavior

## Developer Quick Start

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

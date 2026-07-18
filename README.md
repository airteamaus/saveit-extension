# SaveIt Browser Extension

The browser extension behind **Newtab Bookmarks**.

**⚠️ BETA SOFTWARE** - This extension is in active development. Features may change and bugs may occur.

Save web pages with AI-powered organization. Automatically extracts content, generates summaries, and creates semantic tags using AI classification. Features semantic search, hierarchical topic navigation, pinned and all-pages feeds, project collections directly on the new tab, and a consolidated Data & sync screen for importing, exporting, and browser-bookmark sync.

## For Testers

### Firefox Installation

**Install from GitHub Release (Signed)**
1. Go to [Releases](https://github.com/airteamaus/saveit-extension/releases)
2. Download the latest `.xpi` file
3. Open Firefox and go to `about:addons`
4. Click the gear icon ⚙️ → "Install Add-on From File..."
5. Select the downloaded `.xpi` file
6. Click "Add" when prompted

### Chrome / Brave Installation

1. Download or clone this repository
2. Open Chrome or Brave and go to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top-right)
4. Click "Load unpacked"
5. Select the **repo root** directory (where `manifest.json` lives, not `src/`)
6. Extension will remain until manually removed

### Getting Started

1. **Sign in**: Click the toolbar button and sign in with Google
2. **Save pages**: Click the toolbar button on any page, then choose a project (or just Save)
3. **Open your library**: Open a new tab - Newtab replaces the new tab page with your pinned feed, all pages feed, and project collections
4. **Search & discover**: Use semantic search to find related content by topic
5. **Navigate topics**: Browse hierarchical topic tags to explore your saved pages by category
6. **Organize projects**: Create project collections from the new-tab sidebar, add pages to multiple projects, and share a project with your company domain when needed
7. **Import & export**: Open the avatar menu → "Data & sync" to import bookmarks from a Raindrop CSV, browser bookmarks HTML, or a Newtab JSON backup; export your data in any of those formats; or toggle browser-bookmark sync

### Known Limitations (Beta)

- AI classification requires backend API access
- Some sites may block content extraction
- Large batch operations may be slow

### Reporting Issues

Found a bug? Please report it on [GitHub Issues](https://github.com/airteamaus/saveit-extension/issues) with:
- Browser version (Firefox/Chrome)
- Extension version (found in `about:addons`)
- Steps to reproduce
- Expected vs actual behavior

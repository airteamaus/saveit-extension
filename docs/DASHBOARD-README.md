# SaveIt Dashboard - Development Guide

## Quick Start: Standalone Testing

The dashboard works **standalone** without needing to load it as a browser extension! This makes development super fast.

### Test in Browser (Instant)

```bash
# Just open the HTML file in any browser
open extension/newtab.html

# Or in Chrome/Firefox
# File → Open File → select newtab.html
```

**That's it!** You'll see the dashboard with 12 mock saved pages. Try:
- ✅ Searching for "motorcycle" or "typescript"
- ✅ Filtering by category (news, blog, code, etc.)
- ✅ Sorting newest/oldest
- ✅ Clicking "Open" to visit the URL
- ✅ Clicking "Delete" to remove a card

### Development Workflow

1. **Edit any file** (CSS, JS, HTML)
2. **Refresh browser** (Cmd+R / F5)
3. **See changes instantly** - no extension reload needed!

This is **perfect for LLM-assisted development** because:
- No build step
- No extension reload
- Immediate visual feedback
- Works in any browser

---

## How It Works

### Automatic Mode Detection

The dashboard automatically detects if it's running:
- **Standalone** (file:// URL) → Uses mock data from `mock-data.js`
- **Extension** (chrome-extension:// or moz-extension://) → Calls real Cloud Function API

Check the footer - it shows the current mode:
- 🟡 "Development Mode (using mock data)"
- 🟢 "Extension Mode"

### File Structure

```
extension/
├── newtab.html       ← Main dashboard page
├── newtab.css        ← Styles (modern card grid)
├── newtab.js         ← Dashboard logic (search, filter, sort)
├── api.js            ← API layer (auto-detects mode)
├── components.js     ← UI components (cards, empty state, etc.)
├── mock-data.js      ← 12 sample pages for testing
└── config.js         ← Cloud Function URL (already exists)
```

### Editing the Dashboard

**Change card styles:**
```bash
# Edit newtab.css, refresh browser
vim extension/newtab.css
```

**Add a new filter:**
```bash
# 1. Add dropdown to newtab.html
# 2. Add event listener in newtab.js
# 3. Refresh to see it work
```

**Modify card layout:**
```bash
# Edit Components.savedPageCard() in components.js
vim extension/components.js
```

---

## Testing as Extension

When you're ready to test with real data:

### Firefox

1. Open `about:debugging`
2. Click "This Firefox" → "Load Temporary Add-on"
3. Select `extension/manifest.json`
4. Open new tab → see dashboard

**Note:** You'll need to update `manifest.json` to include the newtab override:

```json
{
  "chrome_url_overrides": {
    "newtab": "newtab.html"
  },
  "permissions": [
    "storage"
  ]
}
```

### Chrome

1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select `extension/` folder
5. Open new tab → see dashboard

---

## Customizing Mock Data

Edit `mock-data.js` to change test data:

```javascript
const MOCK_DATA = [
  {
    id: '1',
    url: 'https://your-site.com',
    title: 'Your Test Article',
    description: 'This appears in the card',
    thumbnail: 'https://picsum.photos/400/300',
    domain: 'your-site.com',
    domain_category: 'blog',
    reading_time_minutes: 5,
    manual_tags: ['test', 'demo']
  },
  // Add more...
];
```

Refresh browser to see changes.

---

## Features Implemented

### ✅ Core Dashboard
- [x] Card grid layout with thumbnails
- [x] Responsive design (mobile, tablet, desktop)
- [x] Search by title/URL/description/tags
- [x] Filter by category
- [x] Sort by newest/oldest
- [x] Open in new tab
- [x] Delete pages
- [x] Empty states (no pages, no results)
- [x] Loading state
- [x] Error handling

### ✅ Developer Experience
- [x] Standalone mode with mock data
- [x] Auto-detection of extension vs standalone
- [x] Zero build step
- [x] Instant refresh workflow
- [x] Mode indicator in footer

### 🚧 TODO (Backend Required)
- [ ] GET /getSavedPages endpoint in Cloud Function
- [ ] DELETE /deletePage endpoint
- [ ] PATCH /updatePage endpoint
- [ ] Update BigQuery schema with new fields
- [ ] Extension manifest newtab override

---

## Design Decisions

### Why Vanilla JS?
- No build step needed
- Fast iteration
- LLM-friendly (clear, simple code)
- Works anywhere

### Why Client-Side Filtering?
- Instant search feedback
- No API calls while typing
- Works offline in standalone mode
- Server can still send pre-filtered data

### Why Mock Data?
- Test UI without backend
- Share with designers/stakeholders
- Fast prototyping
- Easy to modify

---

## Next Steps

1. **Style tweaks** - Adjust colors, spacing, card size in `newtab.css`
2. **Backend API** - Build Cloud Function endpoints
3. **Extension integration** - Update manifest, test with real OAuth
4. **Metadata extraction** - Add og:image, description extraction to save flow

---

## Screenshots

Open `newtab.html` to see:
- **Grid of 12 cards** with thumbnails, titles, descriptions
- **Search bar** that filters in real-time
- **Category dropdown** (news, blog, code, etc.)
- **Sort selector** (newest/oldest)
- **Stats counter** showing filtered/total count
- **Responsive layout** that adapts to screen size

Try searching "himalaya" or filtering by "code" category!

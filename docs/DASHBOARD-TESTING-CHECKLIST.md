# Dashboard Row Layout - Testing Checklist

**Status:** Code complete, ready for manual browser testing
**Date:** 2025-11-10
**Refactor:** Card grid → Row-based list with AI enrichment

## Quick Start

```bash
cd /Users/rich/Code/saveit-extension
./scripts/run-extension.sh
```

Then open a new tab in Firefox to see the dashboard.

## What Changed

### Visual Changes
- **Layout:** Grid of cards → Vertical list of rows
- **Separators:** Box shadows → Border-bottom lines
- **AI Content:** New AI summary and Dewey classification tags
- **Delete Button:** Fixed position → Hover overlay (absolute positioned)
- **Clickable Area:** Open button → Entire row clickable

### Data Changes
- **API:** Now returns `ai_summary_brief`, `dewey_primary_label`, `ai_enriched_at`
- **Display Priority:** AI summary preferred over plain description
- **Tags:** Dewey labels shown as blue "AI tags" with distinct styling

## Manual Testing Checklist

### 1. Visual Layout ✓

- [ ] Rows display instead of cards
- [ ] Each row has border-bottom separator (no box shadows)
- [ ] Rows span full width
- [ ] Favicon and title on same line
- [ ] Content is left-aligned with consistent padding

**Expected:** Clean list view similar to Gmail or linear.app

### 2. Hover States ✓

- [ ] Row background changes to gray on hover
- [ ] Delete button invisible by default
- [ ] Delete button fades in (opacity 0 → 1) on row hover
- [ ] Delete button positioned on right side, vertically centered
- [ ] Cursor changes to pointer on row hover

**Expected:** Subtle hover feedback, delete button only visible when needed

### 3. AI Field Display ✓

Test with items that have AI enrichment (look for blue tags):

- [ ] AI summary displays instead of description
- [ ] AI summary is 1-2 lines, concise
- [ ] Dewey classification appears as blue tag
- [ ] Blue tag has "AI-generated classification" tooltip
- [ ] Items without AI show regular description

**Test URLs with AI enrichment:**
- https://github.com/Aider-AI/aider
- https://github.com/anthropics/claude-code

**Expected:** AI content clearly distinguishable, graceful fallback for non-enriched items

### 4. Null Handling ✓

- [ ] Items without `ai_summary_brief` show description
- [ ] Items without description show nothing (no empty space)
- [ ] Items without `dewey_primary_label` show no AI tag
- [ ] No console errors for null fields
- [ ] No "undefined" or "null" text rendered

**Expected:** Clean handling of missing data, no errors

### 5. Row Click Interaction ✓

- [ ] Click anywhere on row (except delete button) → Opens URL in new tab
- [ ] Click on title → Opens URL
- [ ] Click on summary text → Opens URL
- [ ] Click on tags → Opens URL
- [ ] Click on metadata → Opens URL

**Expected:** Entire row is clickable target (larger hit area than old Open button)

### 6. Delete Button Interaction ✓

- [ ] Click delete button → Shows confirm dialog
- [ ] Confirm deletion → Row removed, no page opened
- [ ] Cancel deletion → Nothing happens
- [ ] Delete button click does NOT open URL
- [ ] Delete works when row is hovered

**Expected:** Delete isolated from row click, no unintended URL opens

### 7. Metadata Line ✓

- [ ] Author displays if present
- [ ] Published date displays if present (formatted nicely)
- [ ] Domain always displays
- [ ] Reading time displays (e.g., "10 min read")
- [ ] Items separated with bullet " • " character
- [ ] No extra bullets if field missing

**Expected:** Clean metadata line like "John Doe • Jan 15, 2025 • example.com • 5 min read"

### 8. Tags Display ✓

- [ ] Manual tags display as gray tags
- [ ] AI tags (Dewey) display as blue tags
- [ ] Multiple tags wrap to next line if needed
- [ ] Tags use small, readable font
- [ ] No tags section if no tags present

**Expected:** Clear visual distinction between manual and AI tags

### 9. Responsive Mobile Layout (<768px) ✓

Resize browser window to mobile width:

- [ ] Rows stack vertically
- [ ] Delete button moves below content
- [ ] Delete button always visible (not hidden)
- [ ] Delete button at bottom of row
- [ ] Favicon/title still inline
- [ ] No horizontal scrolling

**Expected:** Clean mobile layout with static delete button

### 10. Dark Mode ✓

Switch OS to dark mode (System Preferences → Appearance → Dark):

- [ ] Background dark
- [ ] Text light colored
- [ ] Row hover state visible (lighter background)
- [ ] AI tags have lighter blue color (#60a5fa)
- [ ] Delete button visible on hover
- [ ] No contrast issues

**Expected:** Polished dark mode with proper contrast

### 11. Empty States ✓

Test with user who has no saved pages:

- [ ] Empty state message displays
- [ ] Bookmark icon shows
- [ ] "No saved pages yet" message
- [ ] Helpful text about using extension

**Expected:** Friendly empty state

### 12. Loading State ✓

Watch during initial load:

- [ ] Spinner displays while loading
- [ ] "Loading your saved pages..." message
- [ ] Smooth transition to content
- [ ] No flash of empty state

**Expected:** Brief loading state, smooth transition

### 13. Search/Filter ✓

Use existing search and filter controls:

- [ ] Search works with new row layout
- [ ] Filter by category works
- [ ] Sort options work
- [ ] Filtered results display as rows
- [ ] Clear search works

**Expected:** All existing filtering intact

### 14. Real API Integration ✓

- [ ] Login with Google OAuth
- [ ] Dashboard loads real saved pages
- [ ] AI-enriched items display correctly
- [ ] Non-enriched items display correctly
- [ ] Save new page → Appears in list
- [ ] Delete page → Removed from list

**Expected:** Full round-trip with real backend

### 15. Performance ✓

- [ ] Dashboard loads quickly
- [ ] No lag on hover
- [ ] Scrolling smooth with many items
- [ ] No console errors
- [ ] No memory leaks (check DevTools)

**Expected:** Snappy, responsive UI

## Known Issues

None identified during code review. Report any issues found.

## Rollback

If issues found, revert all iterations:

```bash
# In saveit-backend
git log --oneline | grep "iteration [1-7]"
git revert <commit-hash-range>
./scripts/deploy-function.sh

# In saveit-extension
git log --oneline | grep "iteration [2-6]"
git revert <commit-hash-range>
```

Or revert to specific commit before refactor started.

## API Verification

Test API returns AI fields:

```bash
# Get user_id
bq query --nouse_legacy_sql \
  'SELECT user_id FROM `bookmarking-477502.saveit.things`
   WHERE user_email = "your-email@example.com" LIMIT 1'

# Test API
curl -s "https://saveit-5pu7ljvnuq-uc.a.run.app/getSavedPages?user_id=YOUR_USER_ID&limit=5" \
  | python3 -m json.tool
```

Look for `ai_summary_brief`, `dewey_primary_label`, `ai_enriched_at` in response.

## Code Verification

All code validated:

```bash
cd /Users/rich/Code/saveit-extension

# Syntax check
find src -name "*.js" -exec node --check {} \;

# Lint (expect warnings for innerHTML - acceptable)
npx web-ext lint

# Validate manifest
cat manifest.json | python3 -m json.tool > /dev/null
```

## Files Modified

**Backend (saveit-backend):**
- `cloud-function/index.js` - Added AI fields to SELECT query

**Frontend (saveit-extension):**
- `src/components.js` - Row renderer with AI field display
- `src/newtab.js` - Row click and delete event handlers
- `src/newtab.css` - Row layout styles
- `src/newtab.html` - Inlined CSS synchronized
- `src/mock-data.js` - AI fields added for development

## Success Criteria

All 15 checklist sections pass with no critical issues.

Minor polish (spacing, colors) acceptable to refine after initial validation.

---

**Next Steps:** Complete manual testing, document any issues found, create follow-up iteration for polish if needed.

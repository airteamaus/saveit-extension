# Welcome State Testing Checklist

## Test Overview
Testing the new welcome/onboarding screen that shows to unauthenticated users.

## Test Files
- **Visual test**: `test-welcome.html` (standalone preview)
- **Extension build**: `web-ext-artifacts/saveit-0.20.3.zip`

---

## Test 1: Standalone Visual Preview

**File**: `test-welcome.html` (should be open in browser)

### Checklist
- [ ] Page loads without errors
- [ ] Welcome icon (bookmark) is visible and blue
- [ ] "Welcome to SaveIt" heading is clear and prominent
- [ ] Subtitle "AI-powered bookmarks..." is readable
- [ ] Three feature items are displayed with icons:
  - [ ] "Save pages with one click" (bookmark icon)
  - [ ] "AI reads and classifies content" (brain/help icon)
  - [ ] "Discover through semantic search" (search icon)
- [ ] Feature list items have subtle background color
- [ ] "Sign in with Google" button is large and prominent
- [ ] Button has sign-in icon on the left
- [ ] Clicking button shows alert (test only)

### Theme Testing
- [ ] **Auto theme**: Uses system preference
- [ ] **Light theme**: White background, dark text
- [ ] **Dark theme**: Dark background, light text
- [ ] All themes look good with welcome state

### Visual Quality
- [ ] Overall layout is centered and balanced
- [ ] Spacing feels comfortable (not cramped)
- [ ] Icons are aligned properly
- [ ] Text is readable and hierarchy is clear

---

## Test 2: Extension Integration Test

**Setup**: Load extension in Firefox
```bash
cd /Users/rich/Code/saveit-extension
./install-dev.sh
```

### Test Cases

#### A. Fresh Install (No User)
**Expected**: Welcome state should appear

1. [ ] Install extension for first time
2. [ ] Open new tab or click extension icon
3. [ ] **Verify**: Welcome state appears (not error state)
4. [ ] **Verify**: "Welcome to SaveIt" heading shown
5. [ ] **Verify**: Feature list is visible
6. [ ] **Verify**: "Sign in with Google" button is visible

#### B. Sign-In Flow
**Expected**: Clicking button triggers OAuth

1. [ ] Click "Sign in with Google" button
2. [ ] **Verify**: Google OAuth popup appears
3. [ ] Sign in with Google account
4. [ ] **Verify**: After auth, dashboard loads with real data
5. [ ] **Verify**: Welcome state is replaced with page list

#### C. Sign-Out Flow
**Expected**: Welcome state reappears after sign-out

1. [ ] While signed in, click user profile dropdown
2. [ ] Click "Sign Out"
3. [ ] **Verify**: Welcome state reappears
4. [ ] **Verify**: No error messages shown
5. [ ] **Verify**: Can sign in again from welcome button

#### D. Comparison to Old State
**Before**: "Failed to load pages" → "No user signed in" → "Retry" button
**After**: "Welcome to SaveIt" → Feature list → "Sign in with Google"

1. [ ] **Verify**: No "Failed to load pages" error message
2. [ ] **Verify**: No "Retry" button (replaced with sign-in)
3. [ ] **Verify**: More inviting and less error-like
4. [ ] **Verify**: Value proposition is clear before asking for auth

---

## Test 3: Edge Cases

### Extension Context vs Standalone
- [ ] Welcome state shows in extension when not authenticated
- [ ] Welcome state shows in standalone mode (test-welcome.html)
- [ ] Both contexts render identically

### Button Interactions
- [ ] Button has hover state (darker blue)
- [ ] Button cursor changes to pointer
- [ ] Button is keyboard accessible (Tab + Enter)
- [ ] Multiple clicks don't cause issues

### Responsive Design
- [ ] Looks good on wide screens (1920px+)
- [ ] Looks good on narrow windows (800px)
- [ ] Vertical spacing adjusts appropriately

---

## Test 4: Console/Error Checking

### Browser Console
- [ ] No JavaScript errors in console
- [ ] No CSS warnings or issues
- [ ] Event handlers attach correctly
- [ ] Click events fire properly

### Network Tab
- [ ] No failed requests for images/icons
- [ ] CSS loads correctly
- [ ] No 404s or missing resources

---

## Expected Behavior Summary

| State | Before | After |
|-------|--------|-------|
| **Heading** | "Failed to load pages" ❌ | "Welcome to SaveIt" ✅ |
| **Message** | "No user signed in" | "AI-powered bookmarks..." ✅ |
| **Value Prop** | None | Feature list with icons ✅ |
| **CTA** | "Retry" (confusing) | "Sign in with Google" ✅ |
| **Appearance** | Error-like, scary | Welcoming, inviting ✅ |

---

## Issues Found

### Critical
- [ ] None found

### Minor
- [ ] None found

### Nice to Have
- [ ] None found

---

## Sign-Off

**Tested by**: _______________
**Date**: _______________
**Browser**: Firefox _____ / Chrome _____ / Other: _____
**Result**: ✅ Pass / ❌ Fail

**Notes**:

---

## Next Steps After Testing

If all tests pass:
1. ✅ Merge changes to main
2. ✅ Bump version to 0.20.4 or 0.21.0 (minor feature)
3. ✅ Create release with release notes
4. ✅ Deploy signed build
5. ✅ Monitor user feedback on new onboarding

If issues found:
1. Document issues in GitHub issue
2. Fix issues
3. Re-test
4. Repeat until all tests pass

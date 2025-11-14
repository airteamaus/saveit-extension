# Cache Isolation Fix - Cross-User Data Leakage

**Status:** Fixed in v0.13.5 (pending release)
**Severity:** Critical Security/Privacy Bug
**Date:** 2025-11-14

## Issue

New user Laura (laura@airteam.com.au) signed up and saw 50 bookmarks from other users instead of her own 3 bookmarks.

## Root Cause

**Browser extension cache was not isolated by user_id**, causing cross-user data leakage when multiple users shared the same browser profile.

### Technical Details

The cache implementation used a global key:
```javascript
CACHE_KEY: 'savedPages_cache'  // Shared across ALL users!
```

When Laura logged in:
1. Extension checked `browser.storage.local.get('savedPages_cache')`
2. Found cached data from Rich (previous user in that Firefox profile)
3. Displayed Rich's 44 bookmarks + other users' data = 50 total pages
4. Laura's actual 3 bookmarks were never shown

### Impact

- **Critical privacy violation** - Users could see each other's private bookmarks
- Only affected users sharing the same browser profile (rare but possible)
- Backend was correctly filtering by user_id (not a backend bug)
- Extension cache bypassed backend security

## Fix

### 1. User-Specific Cache Keys

Changed cache key to include user_id:
```javascript
// Before
CACHE_KEY: 'savedPages_cache'

// After
getCacheKey(userId) {
  return `savedPages_cache_${userId}`;
}
```

Now each user has their own cache:
- Rich: `savedPages_cache_F3N5Vom9vihGJW9Dc0ftv6Ixxln1`
- Laura: `savedPages_cache_arrul60ukPQL6n6w6yp7NM5PI6Z2`

### 2. Cache Validation

Added user_id validation when reading cache:
```javascript
if (cached.userId && cached.userId !== userId) {
  console.warn('[getCachedPages] Cache user_id mismatch! Clearing invalid cache.');
  await browser.storage.local.remove(cacheKey);
  return null;
}
```

### 3. Clear Cache on Auth Changes

Clear cache when user signs in/out/switches accounts:
```javascript
window.firebaseOnAuthStateChanged(async (user) => {
  // Clear cache to prevent showing previous user's data
  await API.invalidateCache();

  if (user) {
    await this.loadPages();
    this.render();
  }
});
```

## Files Changed

- `src/api.js` - Cache key generation, validation, user_id storage
- `src/newtab.js` - Clear cache on auth state changes
- `tests/manual-cache-isolation-test.js` - Verification test

## Testing

### Automated Test
```bash
cd /Users/rich/Code/saveit-extension
node tests/manual-cache-isolation-test.js
```

Expected output:
```
✅ All cache keys are unique (isolation works!)
✅ All cache keys include user_id
✅ Cache isolation test PASSED
```

### Manual Testing

1. **Sign in as User A** → Save bookmarks → See correct data
2. **Sign out** → Cache cleared
3. **Sign in as User B** → Should see ONLY User B's bookmarks
4. **Check browser storage** → Should see separate cache keys for each user

### Verification in Production

After Laura updates to v0.13.5:
1. Extension will clear old global cache on first load
2. New cache will be created with `savedPages_cache_{laura_uid}`
3. She will see only her 3 bookmarks
4. No cross-user data leakage

## Prevention

### Code Review Checklist

When adding caching:
- [ ] Cache keys include user_id or other unique identifier
- [ ] Cache is cleared on authentication state changes
- [ ] Cache reads validate data belongs to current user
- [ ] Cache writes include metadata for validation

### Architecture Note

Browser extension caching is tricky because:
- `browser.storage.local` is shared across all extension instances
- Multiple users can use the same browser profile
- Cache must be isolated per user to prevent data leakage

Always use user-scoped cache keys: `{feature}_cache_{user_id}`

## Related Issues

- Backend correctly filters by user_id (no backend fix needed)
- This was purely a frontend/extension caching bug
- Similar issue could affect other browser extensions with caching

## References

- Original bug report: Screenshot showing Laura seeing 50 pages (Rich's data)
- Firestore query: Confirmed Laura has only 3 documents with `user_id=arrul60ukPQL6n6w6yp7NM5PI6Z2`
- Backend code: `cloud-function/index.js:31` - Correctly filters by `user_id` from Firebase token

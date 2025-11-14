# v0.16.6 Release Notes - Critical Security Fix

**Release Date:** 2025-11-14
**Type:** Security/Privacy Hotfix
**Severity:** Critical

## Critical Security Fix

### Fixed: Cross-User Data Leakage in Browser Cache

**Issue:** New users saw other users' bookmarks when using the same browser profile.

**Impact:**
- Users sharing a browser profile could see each other's private bookmarks
- Cache was not isolated by user_id, causing data leakage
- Backend was secure (correctly filtered by user_id)
- Only affected extension cache layer

**Example:**
- Laura signed up with laura@airteam.com.au
- Expected: See her 3 bookmarks
- Actual: Saw 50 bookmarks from Rich and other users

**Root Cause:**
Cache key was global (`savedPages_cache`) instead of user-specific.

**Fix:**
1. **User-specific cache keys:** Each user gets `savedPages_cache_{user_id}`
2. **Cache validation:** Verify cached data belongs to current user
3. **Clear on auth changes:** Cache cleared when user signs in/out/switches
4. **Legacy cleanup:** Old global cache automatically removed on upgrade

## Changes

### Files Modified

- `src/api.js` - Cache isolation, validation, legacy cleanup
- `src/newtab.js` - Clear cache on auth state changes
- `manifest.json` - Version bump to 0.16.6
- `package.json` - Version sync

### Files Added

- `docs/CACHE-ISOLATION-FIX.md` - Detailed security fix documentation
- `tests/manual-cache-isolation-test.js` - Verification test

## Testing

### Automated Tests
```bash
npm test  # All 26 tests pass
node tests/manual-cache-isolation-test.js  # Cache isolation verified
```

### Manual Verification

After updating to v0.16.6:
1. Old global cache automatically cleaned up on first load
2. New user-specific cache created
3. Users see only their own bookmarks
4. Switching accounts clears cache

## Upgrade Instructions

### For Users

**Action Required:** Update to v0.16.6 immediately

1. Extension will auto-update (or manually update from browser extension store)
2. On first load, extension clears legacy cache
3. Fresh data loaded from backend with correct user isolation
4. No further action needed

### For Developers

**Before deploying:**
1. Run tests: `npm test`
2. Test cache isolation: `node tests/manual-cache-isolation-test.js`
3. Manually test sign-in/sign-out/switch user scenarios

**Deployment:**
```bash
# Test locally
just run  # Load in Firefox dev mode

# Release to production
just bump patch  # Creates v0.16.6 tag
git push --tags  # Triggers GitHub Actions CI/CD
```

## Technical Details

### Cache Key Format

**Before (insecure):**
```
savedPages_cache  // Global, shared across all users
```

**After (secure):**
```
savedPages_cache_F3N5Vom9vihGJW9Dc0ftv6Ixxln1  // User 1
savedPages_cache_arrul60ukPQL6n6w6yp7NM5PI6Z2  // User 2
```

### Cache Structure

```javascript
{
  userId: "F3N5Vom9vihGJW9Dc0ftv6Ixxln1",  // For validation
  pages: [...],  // User's bookmarks
  timestamp: 1731547920000  // Cache expiry
}
```

### Migration

On first load of v0.16.6:
1. `cleanupLegacyCache()` removes `savedPages_cache` (old global key)
2. New user-specific cache created on first API call
3. Cache validated on every read to prevent stale data

## References

- Security fix doc: `docs/CACHE-ISOLATION-FIX.md`
- Backend code (secure): `cloud-function/index.js:31` - Filters by user_id
- Extension tests: `tests/manual-cache-isolation-test.js`

## Rollout Plan

1. **Immediate:** Deploy v0.16.6 to production
2. **Monitoring:** Watch for cache-related errors in extension logs
3. **User notification:** Email users about update (optional, auto-update handles it)
4. **Follow-up:** Monitor for 48h, confirm no cross-user data reports

## Prevention

Added to code review checklist:
- [ ] Cache keys include user_id or unique identifier
- [ ] Cache cleared on auth state changes
- [ ] Cache reads validate data ownership
- [ ] Cache writes include metadata for validation

## Credits

- Bug reporter: Laura (laura@airteam.com.au)
- Fix implemented: 2025-11-14
- Testing: Automated + manual verification

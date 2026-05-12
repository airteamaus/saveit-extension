import { describe, expect, it } from 'vitest';

import { isSavedPagesCacheInvalidation } from '../../src/saved-pages-cache.js';

describe('saved-pages cache sync', () => {
  it('detects saved pages cache removals', () => {
    const changes = {
      'savedPages_cache_user123_surface%3Ddashboard': {
        oldValue: { response: { pages: [] } },
        newValue: undefined
      }
    };

    expect(isSavedPagesCacheInvalidation(changes, 'local')).toBe(true);
  });

  it('ignores saved pages cache writes', () => {
    const changes = {
      'savedPages_cache_user123_surface%3Ddashboard': {
        oldValue: undefined,
        newValue: { response: { pages: [] } }
      }
    };

    expect(isSavedPagesCacheInvalidation(changes, 'local')).toBe(false);
  });

  it('ignores unrelated storage changes', () => {
    const changes = {
      newtab_background: {
        oldValue: { id: 'photo-1' },
        newValue: undefined
      }
    };

    expect(isSavedPagesCacheInvalidation(changes, 'local')).toBe(false);
    expect(isSavedPagesCacheInvalidation(changes, 'sync')).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';

import { getPinnedPages } from '../../src/newtab-home.js';

describe('newtab home selectors', () => {
  describe('getPinnedPages', () => {
    it('returns only pinned pages, up to the limit', () => {
      const pages = [
        { id: '1', title: 'Apple', pinned: true },
        { id: '2', title: 'Other' },
        { id: '3', title: 'Banana', pinned: true },
        { id: '4', title: 'Cherry', pinned: true }
      ];

      // Alphabetical by title, sliced to the limit.
      expect(getPinnedPages(pages, 2).map(p => p.id)).toEqual(['1', '3']);
    });

    it('sorts alphabetically by title (case-insensitive)', () => {
      // The store hands us newest-first; the shelf must present a stable
      // alphabetical index regardless of store order.
      const pages = [
        { id: 'z', title: 'zebra', pinned: true },
        { id: 'a', title: 'Apple', pinned: true },
        { id: 'm', title: 'mango', pinned: true },
        { id: 'b', title: 'banana', pinned: true }
      ];

      expect(getPinnedPages(pages).map(p => p.id)).toEqual(['a', 'b', 'm', 'z']);
    });

    it('falls back to domain, then "Untitled", when title is empty', () => {
      // Mirrors the card heading fallback (title || domain || 'Untitled') so
      // shelf order matches what the user reads on the card.
      const pages = [
        { id: 'u', title: '', pinned: true },                              // → Untitled
        { id: 'd', title: null, domain: 'example.com', pinned: true },     // → example.com
        { id: 'a', title: 'Apple', pinned: true }
      ];

      expect(getPinnedPages(pages).map(p => p.id)).toEqual(['a', 'd', 'u']);
    });

    it('treats pages missing the pinned field as not pinned', () => {
      const pages = [
        { id: 'a', title: 'Apple' },
        { id: 'b', title: 'Banana', pinned: true },
        { id: 'c', title: 'Cherry', pinned: false }
      ];

      expect(getPinnedPages(pages).map(p => p.id)).toEqual(['b']);
    });

    it('returns an empty array for empty or invalid input', () => {
      expect(getPinnedPages([])).toEqual([]);
      expect(getPinnedPages(null)).toEqual([]);
      expect(getPinnedPages(undefined)).toEqual([]);
    });

    it('respects the default limit of 8, slicing after the alphabetical sort', () => {
      const pages = Array.from({ length: 20 }, (_, i) => ({
        id: String(i),
        // Titles in reverse so sort reorders them; slice must take the first 8
        // alphabetically, not the first 8 by store order.
        title: `zz${String(19 - i).padStart(2, '0')}`,
        pinned: true
      }));

      const result = getPinnedPages(pages);
      expect(result).toHaveLength(8);
      // First 8 alphabetically are the ones with the smallest titles.
      expect(result.map(p => p.title)).toEqual([
        'zz00', 'zz01', 'zz02', 'zz03', 'zz04', 'zz05', 'zz06', 'zz07'
      ]);
    });

    // Regression: a race that flips `pinned` on an optimistic tile (before the
    // real doc arrives) would otherwise surface a synthetic-id tile on the
    // Pinned shelf, whose click/navigation could reach the backend with an
    // invalid Firestore path.
    it('excludes optimistic (not-yet-enriched) tiles even if pinned', () => {
      const pages = [
        { id: 'real_abc1234567890def', title: 'Bravo', pinned: true },
        { id: 'optimistic:https://example.com/path', title: 'Alpha', pinned: true, optimistic: true },
        { id: 'real_0011223344556677', title: 'Charlie', pinned: true }
      ];

      // 'Alpha' would sort first, but it's optimistic and must be excluded.
      expect(getPinnedPages(pages).map(p => p.id)).toEqual([
        'real_abc1234567890def',
        'real_0011223344556677'
      ]);
    });
  });
});

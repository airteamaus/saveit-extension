import { describe, expect, it } from 'vitest';

import { getPinnedPages } from '../../src/newtab-home.js';

describe('newtab home selectors', () => {
  describe('getPinnedPages', () => {
    it('returns only pinned pages, sorted alphabetically', () => {
      const pages = [
        { id: '1', title: 'Apple', pinned: true },
        { id: '2', title: 'Other' },
        { id: '3', title: 'Banana', pinned: true },
        { id: '4', title: 'Cherry', pinned: true }
      ];

      // All pinned pages returned, alphabetical by title. Non-pinned excluded.
      expect(getPinnedPages(pages).map(p => p.id)).toEqual(['1', '3', '4']);
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

    it('returns all pinned pages with no cap', () => {
      // Regression: the shelf used to cap at 8 items. There must be no limit —
      // every pinned page renders, however many there are.
      const pages = Array.from({ length: 20 }, (_, i) => ({
        id: String(i),
        // Titles in reverse so sort reorders them; all 20 must be returned.
        title: `zz${String(19 - i).padStart(2, '0')}`,
        pinned: true
      }));

      const result = getPinnedPages(pages);
      expect(result).toHaveLength(20);
      // Sorted alphabetically (smallest titles first), not by store order.
      expect(result[0].title).toBe('zz00');
      expect(result[19].title).toBe('zz19');
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

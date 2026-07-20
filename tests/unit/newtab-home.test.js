import { describe, expect, it } from 'vitest';

import { getPinnedPages } from '../../src/newtab-home.js';

describe('newtab home selectors', () => {
  describe('getPinnedPages', () => {
    it('returns only pinned pages, preserving store order, up to the limit', () => {
      // The store sorts newest-first; getPinnedPages is a presentation slice
      // over that order.
      const pages = [
        { id: '1', pinned: true },
        { id: '2' },
        { id: '3', pinned: true },
        { id: '4', pinned: true }
      ];

      expect(getPinnedPages(pages, 2).map(p => p.id)).toEqual(['1', '3']);
    });

    it('treats pages missing the pinned field as not pinned', () => {
      const pages = [
        { id: 'a' },
        { id: 'b', pinned: true },
        { id: 'c', pinned: false }
      ];

      expect(getPinnedPages(pages).map(p => p.id)).toEqual(['b']);
    });

    it('returns an empty array for empty or invalid input', () => {
      expect(getPinnedPages([])).toEqual([]);
      expect(getPinnedPages(null)).toEqual([]);
      expect(getPinnedPages(undefined)).toEqual([]);
    });

    it('respects the default limit of 8', () => {
      const pages = Array.from({ length: 20 }, (_, i) => ({ id: String(i), pinned: true }));

      expect(getPinnedPages(pages)).toHaveLength(8);
    });
  });
});

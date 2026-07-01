import { describe, expect, it } from 'vitest';

import { getRecentPages, getTopicCounts } from '../../src/newtab-home.js';

describe('newtab home selectors', () => {
  describe('getRecentPages', () => {
    it('returns the newest non-pinned pages up to the limit', () => {
      const pages = [
        { id: '1', saved_at: '2026-01-01' },
        { id: '2', saved_at: '2026-01-02' },
        { id: '3', saved_at: '2026-01-03', pinned: true },
        { id: '4', saved_at: '2026-01-04' }
      ];

      // The store sorts newest-first; getRecentPages is a presentation slice.
      expect(getRecentPages(pages, 2).map(p => p.id)).toEqual(['1', '2']);
    });

    it('excludes pinned pages', () => {
      const pages = [
        { id: 'a', pinned: true },
        { id: 'b' },
        { id: 'c', pinned: true }
      ];

      expect(getRecentPages(pages).map(p => p.id)).toEqual(['b']);
    });

    it('returns an empty array for empty or invalid input', () => {
      expect(getRecentPages([])).toEqual([]);
      expect(getRecentPages(null)).toEqual([]);
      expect(getRecentPages(undefined)).toEqual([]);
    });

    it('respects the default limit of 3', () => {
      const pages = Array.from({ length: 10 }, (_, i) => ({ id: String(i) }));

      expect(getRecentPages(pages)).toHaveLength(3);
    });
  });

  describe('getTopicCounts', () => {
    it('tallies topic classification labels', () => {
      const pages = [
        {
          classifications: [
            { type: 'topic', label: 'Cycling', confidence: 0.9 },
            { type: 'domain', label: 'Sports', confidence: 0.8 }
          ]
        },
        {
          classifications: [{ type: 'topic', label: 'Cycling', confidence: 0.7 }]
        },
        {
          classifications: [{ type: 'topic', label: 'AI', confidence: 0.6 }]
        }
      ];

      const counts = getTopicCounts(pages);
      expect(counts).toEqual([
        { label: 'Cycling', count: 2 },
        { label: 'AI', count: 1 }
      ]);
    });

    it('ignores non-topic classifications', () => {
      const pages = [
        {
          classifications: [
            { type: 'general', label: 'Geography', confidence: 0.9 },
            { type: 'domain', label: 'Travel', confidence: 0.8 }
          ]
        }
      ];

      expect(getTopicCounts(pages)).toEqual([]);
    });

    it('sorts by count desc, then label asc for ties', () => {
      const pages = [
        { classifications: [{ type: 'topic', label: 'Zeta', confidence: 1 }] },
        { classifications: [{ type: 'topic', label: 'Alpha', confidence: 1 }] },
        { classifications: [{ type: 'topic', label: 'Alpha', confidence: 1 }] }
      ];

      expect(getTopicCounts(pages).map(c => c.label)).toEqual(['Alpha', 'Zeta']);
    });

    it('limits to the requested number', () => {
      const pages = Array.from({ length: 12 }, (_, i) => ({
        classifications: [{ type: 'topic', label: `Topic ${i}`, confidence: 1 }]
      }));

      expect(getTopicCounts(pages, 5)).toHaveLength(5);
    });

    it('handles pages without classifications', () => {
      const pages = [{ id: '1' }, { id: '2', classifications: undefined }];

      expect(getTopicCounts(pages)).toEqual([]);
    });

    it('returns an empty array for empty or invalid input', () => {
      expect(getTopicCounts([])).toEqual([]);
      expect(getTopicCounts(null)).toEqual([]);
      expect(getTopicCounts(undefined)).toEqual([]);
    });
  });
});

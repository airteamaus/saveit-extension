import { describe, it, expect, beforeEach } from 'vitest';
import {
  getMockFeed,
  voteStandaloneFeedPage,
  resetMockFeedVotesForTests
} from '../../../src/api-feed-standalone.js';

const basePages = [
  { id: '1', url: 'https://a.com', title: 'A', user_email: 'you@gmail.com', saved_at: '2026-08-29T00:00:00Z' },
  { id: '2', url: 'https://b.com', title: 'B', user_email: 'other@gmail.com', saved_at: '2026-08-28T00:00:00Z' },
  { id: '3', url: 'https://c.com', title: 'C', user_email: 'other2@gmail.com', saved_at: '2026-08-27T00:00:00Z' }
];

describe('getMockFeed', () => {
  beforeEach(() => {
    globalThis.MOCK_DATA = structuredClone(basePages);
    resetMockFeedVotesForTests();
  });

  it('returns feed-shaped rows with votes/voted/mine/saved_by', () => {
    const feed = getMockFeed();
    expect(feed.scope).toEqual({ type: 'org', domain: 'gmail.com', public: true });
    expect(feed.pages[0].mine).toBe(true);
    expect(feed.pages[0].saved_by).toBe('You');
    expect(typeof feed.pages[1].votes).toBe('number');
    expect(feed.pages[1].voted).toBe(false);
  });

  it('paginates with offset and has_more', () => {
    const page1 = getMockFeed({ limit: 2 });
    expect(page1.pages).toHaveLength(2);
    expect(page1.pagination.has_more).toBe(true);
    expect(page1.pagination.next_offset).toBe(2);
    const page2 = getMockFeed({ limit: 2, offset: 2 });
    expect(page2.pages).toHaveLength(1);
    expect(page2.pagination.has_more).toBe(false);
  });

  it('throws when the unavailable seam is set, standing in for a backend without /feed', () => {
    globalThis.MOCK_FEED_UNAVAILABLE = true;
    try {
      expect(() => getMockFeed()).toThrow('mock feed unavailable');
    } finally {
      delete globalThis.MOCK_FEED_UNAVAILABLE;
    }
  });
});

describe('voteStandaloneFeedPage', () => {
  beforeEach(() => {
    globalThis.MOCK_DATA = structuredClone(basePages);
    resetMockFeedVotesForTests();
  });

  it('toggles votes on and off for a non-own row', () => {
    const before = getMockFeed().pages.find(p => p.id === '2');
    const on = voteStandaloneFeedPage('2');
    expect(on).toMatchObject({ id: '2', voted: true, votes: before.votes + 1 });
    const off = voteStandaloneFeedPage('2');
    expect(off).toMatchObject({ id: '2', voted: false, votes: before.votes });
  });

  it('throws for an unknown id', () => {
    expect(() => voteStandaloneFeedPage('nope')).toThrow();
  });
});

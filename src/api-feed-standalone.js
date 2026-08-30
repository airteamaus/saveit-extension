// Standalone (file://) feed for UI development. Derives feed rows from
// globalThis.MOCK_DATA with deterministic votes so both voted and unvoted
// rows render without touching mock-data.js. The first row plays the user
// (mine: true) so the disabled own-row chevron is visible.

const DEFAULT_FEED_LIMIT = 50;

const votedOverrides = new Set();

function baseVotes(index) {
  if (typeof globalThis.getMockFeedVotes === 'function') {
    return globalThis.getMockFeedVotes(index) || 0;
  }
  // Every 3rd row (skipping row 0, which is "mine") carries votes.
  return index > 0 && index % 3 === 1 ? 1 + (index % 4) : 0;
}

function buildMockFeedRows() {
  const pages = Array.isArray(globalThis.MOCK_DATA) ? globalThis.MOCK_DATA : [];
  return pages.map((page, index) => ({
    ...page,
    votes: baseVotes(index) + (votedOverrides.has(page.id) ? 1 : 0),
    voted: votedOverrides.has(page.id),
    mine: index === 0,
    saved_by: index === 0 ? 'You' : savedByLabel(page.user_email),
    private: false
  }));
}

function savedByLabel(userEmail) {
  if (typeof userEmail !== 'string' || !userEmail.includes('@')) return null;
  const local = userEmail.slice(0, userEmail.indexOf('@'));
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : null;
}

export function getMockFeed(options = {}) {
  // Test seam for the deploy-order bridge: an old backend without /feed must
  // leave the desk on the personal list. E2E specs set this flag to exercise
  // that fallback in standalone mode.
  if (globalThis.MOCK_FEED_UNAVAILABLE) {
    throw new Error('mock feed unavailable');
  }
  const rows = buildMockFeedRows();
  const limit = options.limit || DEFAULT_FEED_LIMIT;
  const offset = options.offset || 0;
  const page = rows.slice(offset, offset + limit);
  const hasMore = offset + page.length < rows.length;
  // Public gmail scope so the public-feed label + disclosure render in dev.
  return {
    scope: { type: 'org', domain: 'gmail.com', public: true },
    pages: page,
    pagination: {
      total_in_window: rows.length,
      next_offset: hasMore ? offset + page.length : null,
      has_more: hasMore
    }
  };
}

export function voteStandaloneFeedPage(id) {
  const page = (globalThis.MOCK_DATA || []).find((entry) => entry.id === id);
  if (!page) {
    throw new Error('Page not found');
  }
  const index = globalThis.MOCK_DATA.indexOf(page);
  const currentlyVoted = votedOverrides.has(id);
  if (currentlyVoted) {
    votedOverrides.delete(id);
  } else {
    votedOverrides.add(id);
  }
  return {
    id,
    votes: baseVotes(index) + (currentlyVoted ? 0 : 1),
    voted: !currentlyVoted
  };
}

export function resetMockFeedVotesForTests() {
  votedOverrides.clear();
}

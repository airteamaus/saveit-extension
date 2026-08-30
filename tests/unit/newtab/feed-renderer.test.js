import { describe, it, expect } from 'vitest';
import {
  createFeedRenderer,
  renderFeedRowMarkup,
  feedScopeKickerMarkup,
  feedDisclosureMarkup,
  feedProviderLabel
} from '../../../src/feed-renderer.js';

const ROW = {
  id: 't1',
  url: 'https://example.com/a',
  title: 'A great read',
  domain: 'example.com',
  saved_at: '2026-08-29T00:00:00.000Z',
  votes: 4,
  voted: false,
  mine: false,
  saved_by: 'Ann',
  private: false,
  reading_time_minutes: 6,
  ai_summary_brief: 'A summary.',
  manual_tags: []
};

describe('renderFeedRowMarkup', () => {
  it('renders an always-visible vote control with count and aria state', () => {
    const html = renderFeedRowMarkup(ROW);
    expect(html).toContain('data-action="vote"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('feed-vote-count');
    expect(html).toContain('>4</span>');
  });

  it('marks voted rows active', () => {
    const html = renderFeedRowMarkup({ ...ROW, voted: true, votes: 5 });
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('is-active');
  });

  it('disables the chevron on the voter\'s own save with an explanatory title', () => {
    const html = renderFeedRowMarkup({ ...ROW, mine: true });
    expect(html).toContain('disabled');
    expect(html).toContain("You can't vote on your own save");
  });

  it('disables the chevron on optimistic (pending) saves', () => {
    const html = renderFeedRowMarkup({ ...ROW, optimistic: true, id: 'optimistic:x' });
    expect(html).toContain('disabled');
  });

  it('shows attribution and the Only-you marker for private rows', () => {
    const html = renderFeedRowMarkup({ ...ROW, private: true });
    expect(html).toContain('saved by Ann');
    expect(html).toContain('Only you');
  });

  it('hides the saved-by label when the backend sent none', () => {
    const html = renderFeedRowMarkup({ ...ROW, saved_by: null });
    expect(html).not.toContain('saved by');
  });
});

describe('scope kicker', () => {
  it('labels company orgs', () => {
    expect(feedScopeKickerMarkup({ type: 'org', domain: 'acme.com', public: false }))
      .toContain('Everyone at acme.com');
  });

  it('labels public orgs with the provider name', () => {
    expect(feedScopeKickerMarkup({ type: 'org', domain: 'gmail.com', public: true }))
      .toContain('Everyone using Gmail — public');
  });

  it('labels personal scope', () => {
    expect(feedScopeKickerMarkup({ type: 'personal', domain: null, public: false }))
      .toContain('Your saves only');
  });
});

describe('feedDisclosureMarkup', () => {
  it('names the provider and the privacy escape hatch', () => {
    const html = feedDisclosureMarkup({ type: 'org', domain: 'gmail.com', public: true });
    expect(html).toContain('visible to everyone using Gmail');
    expect(html).toContain('Hide from organisation');
    expect(html).toContain('data-action="dismiss-disclosure"');
  });

  it('renders nothing for non-public scopes', () => {
    expect(feedDisclosureMarkup({ type: 'org', domain: 'acme.com', public: false })).toBe('');
    expect(feedDisclosureMarkup({ type: 'personal', domain: null, public: false })).toBe('');
  });
});

describe('feedProviderLabel', () => {
  it('maps known providers, passes domains through', () => {
    expect(feedProviderLabel('gmail.com')).toBe('Gmail');
    expect(feedProviderLabel('outlook.com')).toBe('Outlook');
    expect(feedProviderLabel('acme.com')).toBe('acme.com');
  });
});

describe('createFeedRenderer', () => {
  it('retires stale pages and semantic sections when the feed takes the pane', () => {
    const container = document.createElement('div');
    // Leftovers from a cleared search (semantic) and the personal list
    // (pages) must not linger beside the feed section.
    container.innerHTML = '<div data-section="pages"></div><div data-section="semantic"></div>';

    const renderer = createFeedRenderer({ documentObj: document, resultsContainer: container });
    renderer.renderFeed([ROW]);

    expect(container.querySelector('[data-section="pages"]')).toBeNull();
    expect(container.querySelector('[data-section="semantic"]')).toBeNull();
    expect(container.querySelector('[data-section="feed"] .feed-row')).not.toBeNull();
  });

  it('clear() removes the feed section only', () => {
    const container = document.createElement('div');
    const renderer = createFeedRenderer({ documentObj: document, resultsContainer: container });
    renderer.renderFeed([ROW]);
    renderer.clear();

    expect(container.querySelector('[data-section="feed"]')).toBeNull();
  });
});

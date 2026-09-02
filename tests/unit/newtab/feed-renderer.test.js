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

  it("disables the chevron on the voter's own save with an explanatory title", () => {
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
    expect(html).toContain('index-row-scope-tag-private');
    expect(html).not.toContain('>Shared<');
  });

  it('labels shared rows explicitly — privacy state is never implied by absence', () => {
    const html = renderFeedRowMarkup(ROW);
    expect(html).toContain('index-row-scope-tag-shared');
    expect(html).toContain('>Shared<');
    expect(html).not.toContain('Only you');
  });

  it('own rows get a hover-revealed privacy eye and the has-actions hook', () => {
    const html = renderFeedRowMarkup({ ...ROW, mine: true });
    expect(html).toContain('has-actions');
    expect(html).toContain('data-action="feed-privacy"');
    expect(html).toContain('Hide from organisation');
    expect(html).toContain('aria-pressed="false"');
    expect(html).not.toContain('index-row-privacy-btn is-active');
  });

  it('own private rows show the eye active', () => {
    const html = renderFeedRowMarkup({ ...ROW, mine: true, private: true });
    expect(html).toContain('index-row-privacy-btn is-active');
    expect(html).toContain('Show in organisation');
    expect(html).toContain('aria-pressed="true"');
  });

  it("org-mates' rows carry no action slot, so their date never yields", () => {
    const html = renderFeedRowMarkup(ROW);
    expect(html).not.toContain('has-actions');
    expect(html).not.toContain('index-row-actions');
    expect(html).not.toContain('feed-privacy');
  });

  it('own rows carry the full management set: edit, pin, privacy, projects, delete', () => {
    const html = renderFeedRowMarkup({ ...ROW, mine: true });
    expect(html).toContain('data-action="feed-edit"');
    expect(html).toContain('data-action="feed-pin"');
    expect(html).toContain('data-action="feed-privacy"');
    expect(html).toContain('data-action="feed-projects"');
    expect(html).toContain('data-action="feed-delete"');
    expect(html).toContain('Pin page');
  });

  it('own rows render display-only project pills (no remove control)', () => {
    const html = renderFeedRowMarkup(
      { ...ROW, mine: true },
      {
        getProjectPills: () => [{ id: 'p1', name: 'Research' }]
      }
    );
    expect(html).toContain('project-pill-label');
    expect(html).toContain('Research');
    expect(html).not.toContain('project-pill-remove');
  });

  it('projects button disabled when projects are unavailable', () => {
    const html = renderFeedRowMarkup({ ...ROW, mine: true }, { projectsUnavailable: true });
    expect(html).toContain('Projects unavailable');
    expect(html).toMatch(/data-action="feed-projects"[^>]*disabled/s);
  });

  it('editing swaps the row body for the inline edit form and drops the actions', () => {
    const html = renderFeedRowMarkup(
      { ...ROW, mine: true, title: 'Old title', ai_summary_brief: 'Old summary' },
      { editingId: ROW.id }
    );
    expect(html).toContain('feed-edit-form');
    expect(html).toContain('value="Old title"');
    expect(html).not.toContain('data-action="feed-edit"');
    expect(html).not.toContain('data-action="feed-delete"');

    const saving = renderFeedRowMarkup(
      { ...ROW, mine: true },
      { editingId: ROW.id, savingEditId: ROW.id }
    );
    expect(saving).toContain('Saving…');
  });

  it('hides the saved-by label when the backend sent none', () => {
    const html = renderFeedRowMarkup({ ...ROW, saved_by: null });
    expect(html).not.toContain('saved by');
  });
});

describe('scope kicker', () => {
  it('renders no kicker for company orgs — the pressed switcher segment is the label', () => {
    expect(feedScopeKickerMarkup({ type: 'org', domain: 'acme.com', public: false })).toBe('');
  });

  it('labels public orgs with the provider name', () => {
    expect(feedScopeKickerMarkup({ type: 'org', domain: 'gmail.com', public: true })).toContain(
      'Everyone using Gmail — public'
    );
  });

  it('labels personal scope', () => {
    expect(feedScopeKickerMarkup({ type: 'personal', domain: null, public: false })).toContain(
      'Your saves only'
    );
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

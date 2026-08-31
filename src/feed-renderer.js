import { createElementFromHtml, replaceElementHtml } from './dom-render.js';
import { reconcileKeyedChildren } from './keyed-dom-list.js';
import {
  escapeHtml,
  formatSavedDate,
  getFaviconUrlForDomain,
  getPageDomain,
  renderPageTags,
  truncateText
} from './newtab-shared.js';
import { isOptimisticPage } from './pending-saves.js';

// Known free providers get a plainer-English label in scope copy. Unknown
// domains render as themselves — the list only shapes wording, never access.
const PROVIDER_LABELS = {
  'gmail.com': 'Gmail',
  'googlemail.com': 'Gmail',
  'outlook.com': 'Outlook',
  'hotmail.com': 'Hotmail',
  'live.com': 'Outlook',
  'yahoo.com': 'Yahoo',
  'icloud.com': 'iCloud',
  'proton.me': 'Proton',
  'protonmail.com': 'Proton'
};

export function feedProviderLabel(domain) {
  return PROVIDER_LABELS[domain] || domain || 'your email provider';
}

export function feedScopeKickerMarkup(scope) {
  if (!scope) {
    return '';
  }
  let label;
  if (scope.type === 'personal') {
    label = 'Your saves only';
  } else if (scope.public) {
    label = `Everyone using ${feedProviderLabel(scope.domain)} — public`;
  } else {
    label = `Everyone at ${scope.domain}`;
  }
  return `<span class="feed-scope-kicker">${escapeHtml(label)}</span>`;
}

export function feedDisclosureMarkup(scope) {
  if (!scope || scope.type !== 'org' || !scope.public) {
    return '';
  }
  return `
    <aside class="feed-disclosure" role="note">
      <p>Saves in this feed are visible to everyone using ${escapeHtml(feedProviderLabel(scope.domain))}. Use “Hide from organisation” on a save to keep it private.</p>
      <button class="feed-disclosure-dismiss" type="button" data-action="dismiss-disclosure">Got it</button>
    </aside>
  `;
}

function voteControlHtml(row) {
  const optimistic = isOptimisticPage(row);
  const disabled = row.mine || optimistic;
  const title = row.mine
    ? "You can't vote on your own save"
    : optimistic
      ? 'Saving…'
      : row.voted
        ? 'Remove vote'
        : 'Upvote';
  return `
    <button
      class="feed-vote ${row.voted ? 'is-active' : ''}"
      type="button"
      data-action="vote"
      data-id="${escapeHtml(row.id)}"
      aria-pressed="${row.voted ? 'true' : 'false'}"
      title="${escapeHtml(title)}"
      aria-label="${escapeHtml(title)}"
      ${disabled ? 'disabled' : ''}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
        <path d="M12 19V5"></path>
        <path d="M5 12l7-7 7 7"></path>
      </svg>
      <span class="feed-vote-count">${escapeHtml(String(row.votes ?? 0))}</span>
    </button>
  `;
}

export function renderFeedRowMarkup(row) {
  const domain = getPageDomain(row);
  const summary = (row.ai_summary_brief || row.description || '').trim();
  const url = row.url || '';
  const navigationAttrs = url ? ` data-url="${escapeHtml(url)}" role="link" tabindex="0"` : '';
  const meta = [];
  if (domain) {
    meta.push(`<span>${escapeHtml(domain)}</span>`);
  }
  if (row.saved_by) {
    meta.push(`<span>saved by ${escapeHtml(row.saved_by)}</span>`);
  }
  if (row.reading_time_minutes) {
    meta.push(`<span>${escapeHtml(String(row.reading_time_minutes))} min read</span>`);
  }
  const tagsHtml = renderPageTags(row);

  // Feed rows reuse the index-row anatomy but drop the personal management
  // actions (edit/pin/privacy/projects/delete) — those belong to the drawer.
  // Voting sits first in the meta line, always visible (DESIGN.md: hover
  // reveals never shift layout; voting is a primary action).
  return `
    <article class="index-row feed-row" data-page-id="${escapeHtml(row.id || '')}"${navigationAttrs}>
      <div class="index-row-main">
        <h3 class="index-row-title">${escapeHtml(row.title || domain || 'Untitled')}</h3>
        <span class="index-row-date">${escapeHtml(formatSavedDate(row.saved_at, { day: 'numeric', month: 'short' }))}</span>
      </div>
      ${summary ? `<p class="index-row-summary">${escapeHtml(truncateText(summary))}</p>` : ''}
      <div class="index-row-footer">
        <div class="index-row-meta">
          ${voteControlHtml(row)}
          ${
            row.private
              ? '<span class="index-row-scope-tag index-row-scope-tag-private">Only you</span>'
              : '<span class="index-row-scope-tag index-row-scope-tag-shared">Shared</span>'
          }
          ${domain ? `<img class="index-row-favicon" src="${getFaviconUrlForDomain(domain)}" alt="" width="14" height="14">` : ''}
          ${meta.length ? meta.join('<span class="index-row-meta-sep">·</span>') : ''}
        </div>
        ${tagsHtml ? `<div class="index-row-tags">${tagsHtml}</div>` : ''}
      </div>
    </article>
  `;
}

export function createFeedRenderer({ documentObj = document, resultsContainer }) {
  // The feed owns its own section beside the drawer's "pages" section so
  // each surface can reconcile without wiping the other; renderFeed clears
  // the pages and semantic sections because those surfaces never show at the
  // same time as the feed (search/scoped views retire it first).
  function ensureFeedSection() {
    if (!resultsContainer) {
      return null;
    }
    resultsContainer.querySelector('[data-section="pages"]')?.remove();
    resultsContainer.querySelector('[data-section="semantic"]')?.remove();
    let section = resultsContainer.querySelector('[data-section="feed"]');
    if (!section) {
      section = createElementFromHtml('<div data-section="feed"></div>', documentObj);
      resultsContainer.append(section);
    }
    return section;
  }

  function renderFeed(rows) {
    const section = ensureFeedSection();
    if (!section) {
      return;
    }
    if (!Array.isArray(rows) || !rows.length) {
      replaceElementHtml(
        section,
        `
        <div class="empty-state saved-pages-drawer-state">
          <p>No saves in this feed yet.</p>
        </div>
      `
      );
      return;
    }
    reconcileKeyedChildren(section, rows, {
      getKey: (row) => row.id || null,
      getNodeKey: (node) => node?.dataset?.pageId || null,
      pruneUnkeyed: true,
      renderItem: (row, existingNode) => {
        const next = createElementFromHtml(renderFeedRowMarkup(row), documentObj);
        return existingNode && existingNode.outerHTML === next?.outerHTML ? existingNode : next;
      }
    });
  }

  function clear() {
    resultsContainer?.querySelector('[data-section="feed"]')?.remove();
  }

  return { renderFeed, clear };
}

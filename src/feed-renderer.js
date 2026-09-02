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

// Short label for the desk switcher's org segment: known providers keep
// their plain-English label ("Gmail"); company domains render their leftmost
// label capitalized ("airteam.com.au" -> "Airteam").
export function feedOrgSegmentLabel(domain) {
  if (!domain) {
    return null;
  }
  if (PROVIDER_LABELS[domain]) {
    return PROVIDER_LABELS[domain];
  }
  const leftmost = domain.split('.')[0];
  return leftmost.charAt(0).toUpperCase() + leftmost.slice(1);
}

// Desk view switcher: quiet segmented control beside the scope kicker.
// "Your saves" | <org label>. Hidden when there is no org (null-domain
// users) — nothing to switch to. State rides on aria-pressed so the button
// semantics and styling share one source of truth.
export function feedViewSwitcherMarkup({ view, orgLabel }) {
  if (!orgLabel) {
    return '';
  }
  const segment = (feedView, label) => `
    <button type="button" class="feed-view-switch" data-feed-view="${feedView}" aria-pressed="${view === feedView}">
      ${escapeHtml(label)}
    </button>`;
  return `
    <div class="feed-view-switcher" role="group" aria-label="Desk view">
      ${segment('personal', 'Your saves')}
      ${segment('org', orgLabel)}
    </div>`;
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
    // Company orgs carry no kicker — the switcher's pressed org segment
    // ("Airteam") already names the feed, so "Everyone at <domain>" would
    // only repeat it.
    return '';
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

// Hover-revealed management actions for the voter's OWN feed rows — the same
// set the drawer rows have (edit/pin/privacy/projects/delete), so a save is
// fully manageable in place without opening the drawer. Org-mates' saves are
// not mine to manage, so their rows keep no action slot (and their date
// therefore never fades — there is nothing to reveal).
function ownActionsHtml(row, { editing, projectsUnavailable }) {
  if (!row.mine || editing) {
    return '';
  }
  const isPrivate = row.private === true;
  const privacyLabel = isPrivate ? 'Show in organisation' : 'Hide from organisation';
  const projectsLabel = projectsUnavailable ? 'Projects unavailable' : 'Manage projects';
  const actionButton = (action, cssClass, label, svg, extraAttrs = '') => `
    <button
      class="index-row-action ${cssClass}"
      type="button"
      data-action="${action}"
      data-id="${escapeHtml(row.id)}"
      title="${escapeHtml(label)}"
      aria-label="${escapeHtml(label)}"
      ${extraAttrs}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
        ${svg}
      </svg>
    </button>
  `;
  return `
    <div class="index-row-actions">
      ${actionButton('feed-edit', 'index-row-edit-btn', 'Edit page', '<path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z"></path>')}
      ${actionButton('feed-pin', 'index-row-pin-btn', 'Pin page', '<path d="M12 17v5"></path><path d="M8 3h8l-1 5 3 3v2H6v-2l3-3-1-5z"></path>')}
      ${actionButton(
        'feed-privacy',
        `index-row-privacy-btn ${isPrivate ? 'is-active' : ''}`.trim(),
        privacyLabel,
        isPrivate
          ? '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-10-8-10-8a18.45 18.45 0 0 1 5.06-5.94"></path><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a18.5 18.5 0 0 1 -2.16 3.19"></path><path d="M1 1l22 22"></path>'
          : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>',
        `aria-pressed="${isPrivate ? 'true' : 'false'}"`
      )}
      ${actionButton('feed-projects', 'index-row-projects-btn btn-projects', projectsLabel, '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v8a2.5 2.5 0 0 1 -2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"></path>', projectsUnavailable ? 'disabled' : '')}
      ${actionButton('feed-delete', 'index-row-delete-btn', 'Delete page', '<path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M19 6l-1 14H6L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path>')}
    </div>
  `;
}

// Inline edit form for own rows. Carries the drawer form's class (so the
// existing form CSS applies unchanged) plus a feed-edit-form marker the
// shared submit delegation branches on — one listener, two surfaces.
function ownEditFormHtml(row, { savingEdit }) {
  return `
    <form class="saved-pages-drawer-edit-form feed-edit-form" data-page-id="${escapeHtml(row.id)}">
      <label class="saved-pages-drawer-edit-field">
        <span class="saved-pages-drawer-edit-label">Title</span>
        <input
          class="saved-pages-drawer-edit-input"
          name="title"
          type="text"
          value="${escapeHtml(row.title || '')}"
          placeholder="Untitled"
          ${savingEdit ? 'disabled' : ''}
          required
        >
      </label>
      <label class="saved-pages-drawer-edit-field">
        <span class="saved-pages-drawer-edit-label">Summary</span>
        <textarea
          class="saved-pages-drawer-edit-textarea"
          name="ai_summary_brief"
          rows="4"
          placeholder="Add a summary"
          ${savingEdit ? 'disabled' : ''}
        >${escapeHtml(row.ai_summary_brief || '')}</textarea>
      </label>
      <div class="saved-pages-drawer-edit-actions">
        <button
          class="saved-pages-drawer-edit-save"
          type="submit"
          ${savingEdit ? 'disabled' : ''}
        >${savingEdit ? 'Saving…' : 'Save'}</button>
        <button
          class="saved-pages-drawer-edit-cancel"
          type="button"
          data-action="feed-edit-cancel"
          data-id="${escapeHtml(row.id)}"
          ${savingEdit ? 'disabled' : ''}
        >Cancel</button>
      </div>
    </form>
  `;
}

// Display-only project pills for own rows. Membership editing happens in the
// projects modal (the feed row's pills are labels, not controls) — the modal
// save already refreshes things docs, which the feed re-pulls via realtime.
function ownProjectPillsHtml(row, getProjectPills) {
  if (!row.mine || typeof getProjectPills !== 'function') {
    return '';
  }
  const pills = getProjectPills(row) || [];
  if (!pills.length) {
    return '';
  }
  return `
    <div class="index-row-projects">
      ${pills
        .map(
          (project) => `
        <span class="project-pill" title="${escapeHtml(project.name)}">
          <span class="project-pill-label">${escapeHtml(project.name)}</span>
        </span>
      `
        )
        .join('')}
    </div>
  `;
}

export function renderFeedRowMarkup(row, ctx = {}) {
  const domain = getPageDomain(row);
  const rawSummary = row.ai_summary_brief || row.description || '';
  const url = row.url || '';
  const navigationAttrs = url ? ` data-url="${escapeHtml(url)}" role="link" tabindex="0"` : '';
  const editing = ctx.editingId != null && ctx.editingId === row.id;
  const savingEdit = ctx.savingEditId != null && ctx.savingEditId === row.id;
  // While editing, the row is a form — navigating it like a link would fight
  // focus inside the inputs.
  const navAttrs = editing ? '' : navigationAttrs;
  const meta = [];
  if (domain) {
    meta.push(`<span>${escapeHtml(domain)}</span>`);
  }
  // My own row does not need "saved by me" — attribution is for org-mates.
  if (row.saved_by && !row.mine) {
    meta.push(`<span>saved by ${escapeHtml(row.saved_by)}</span>`);
  }
  if (row.reading_time_minutes) {
    meta.push(`<span>${escapeHtml(String(row.reading_time_minutes))} min read</span>`);
  }
  const tagsHtml = renderPageTags(row);
  const summary =
    rawSummary.trim() &&
    rawSummary.trim().toLowerCase() !== (row.title || '').trim().toLowerCase() &&
    rawSummary.trim().toLowerCase() !== domain
      ? rawSummary
      : '';

  const actionsHtml = ownActionsHtml(row, {
    editing,
    projectsUnavailable: ctx.projectsUnavailable === true
  });
  const bodyHtml = editing
    ? ownEditFormHtml(row, { savingEdit })
    : `
      ${summary ? `<p class="index-row-summary">${escapeHtml(truncateText(summary))}</p>` : ''}
      ${ownProjectPillsHtml(row, ctx.getProjectPills)}
    `;

  return `
    <article class="index-row feed-row${actionsHtml ? ' has-actions' : ''}" data-page-id="${escapeHtml(row.id || '')}"${navAttrs}>
      <div class="index-row-main">
        <h3 class="index-row-title">${escapeHtml(row.title || domain || 'Untitled')}</h3>
        <span class="index-row-date">${escapeHtml(formatSavedDate(row.saved_at, { day: 'numeric', month: 'short' }))}</span>
        ${actionsHtml}
      </div>
      ${bodyHtml}
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

  function renderFeed(rows, ctx = {}) {
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
        const next = createElementFromHtml(renderFeedRowMarkup(row, ctx), documentObj);
        return existingNode && existingNode.outerHTML === next?.outerHTML ? existingNode : next;
      }
    });
  }

  function clear() {
    resultsContainer?.querySelector('[data-section="feed"]')?.remove();
  }

  return { renderFeed, clear };
}

import {
  createElementFromHtml,
  replaceElementHtml
} from './dom-render.js';
import { reconcileKeyedChildren } from './keyed-dom-list.js';
import {
  escapeHtml,
  getFaviconUrlForDomain,
  getPageDomain,
  renderPageTags,
  truncateText
} from './newtab-shared.js';
import { LOADING_ILLUSTRATION_SVG } from './loading-illustration.js';

export function renderDrawerCardMarkup(page, {
  editingPageId = null,
  savingEditPageId = null,
  getProjectPills,
  projectsUnavailable = false
}) {
  const isEditing = page.id === editingPageId;
  const isSavingEdit = page.id === savingEditPageId;
  const domain = getPageDomain(page);
  // Show the AI summary, falling back to the scraped page description when the
  // user clears the AI summary. Both fields are read-only here; the edit form
  // writes ai_summary_brief.
  const rawSummary = page.ai_summary_brief || page.description || '';
  const normalizedSummary = rawSummary.trim().toLowerCase();
  const normalizedTitle = (page.title || '').trim().toLowerCase();
  const normalizedDomain = (domain || '').trim().toLowerCase();
  const summary = normalizedSummary && normalizedSummary !== normalizedTitle && normalizedSummary !== normalizedDomain
    ? rawSummary
    : '';
  const meta = [];

  if (domain) {
    meta.push(`<span>${escapeHtml(domain)}</span>`);
  }

  if (page.reading_time_minutes) {
    meta.push(`<span>${page.reading_time_minutes} min read</span>`);
  }

  const tagsHtml = renderPageTags(page);
  const projectPills = getProjectPills(page);
  const url = page.url || '';
  const navigationAttrs = url
    ? ` data-url="${escapeHtml(url)}" role="link" tabindex="0"`
    : '';
  const projectPillsHtml = projectPills.length
    ? `
      <div class="saved-pages-drawer-card-projects">
        ${projectPills.map(project => `
          <span class="project-pill" title="${escapeHtml(project.name)}">
            <span class="project-pill-label">${escapeHtml(project.name)}</span>
            <button
              class="project-pill-remove"
              type="button"
              data-action="remove-project"
              data-id="${escapeHtml(page.id)}"
              data-project-id="${escapeHtml(project.id)}"
              title="Remove from ${escapeHtml(project.name)}"
              aria-label="Remove from ${escapeHtml(project.name)}"
            >×</button>
          </span>
        `).join('')}
      </div>
    `
    : '';
  const editButtonHtml = `
    <button
      class="saved-pages-drawer-action-btn saved-pages-drawer-edit-btn"
      type="button"
      data-action="edit"
      data-id="${escapeHtml(page.id)}"
      title="Edit page"
      aria-label="Edit page"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
        <path d="M12 20h9"></path>
        <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z"></path>
      </svg>
    </button>
  `;
  // "Hide from organisation" / "Show in organisation". `private` governs only
  // whether the page appears in org-mates' Slack /links results (bucket 2);
  // the owner always sees their own private pages. Mirrors the pin button's
  // is-active + title/aria-label pattern.
  const isPrivate = page.private === true;
  const privacyButtonLabel = isPrivate ? 'Show in organisation' : 'Hide from organisation';
  const privacyButtonHtml = `
    <button
      class="saved-pages-drawer-action-btn saved-pages-drawer-privacy-btn ${isPrivate ? 'is-active' : ''}"
      type="button"
      data-action="toggle-privacy"
      data-id="${escapeHtml(page.id)}"
      title="${privacyButtonLabel}"
      aria-label="${privacyButtonLabel}"
      aria-pressed="${isPrivate ? 'true' : 'false'}"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
        ${isPrivate
          ? '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-10-8-10-8a18.45 18.45 0 0 1 5.06-5.94"></path><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19"></path><path d="M1 1l22 22"></path>'
          : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>'}
      </svg>
    </button>
  `;
  const projectsButtonLabel = projectsUnavailable ? 'Projects unavailable' : 'Manage projects';
  const projectsButtonHtml = `
    <button
      class="saved-pages-drawer-action-btn saved-pages-drawer-projects-btn btn-projects"
      type="button"
      data-action="projects"
      data-id="${escapeHtml(page.id)}"
      ${projectsUnavailable ? 'disabled' : ''}
      title="${projectsButtonLabel}"
      aria-label="${projectsButtonLabel}"
      ${isEditing ? 'disabled' : ''}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
        <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2h7.5A2.5 2.5 0 0 1 21 9.5v8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"></path>
      </svg>
    </button>
  `;
  const editFormHtml = `
    <form class="saved-pages-drawer-edit-form" data-page-id="${escapeHtml(page.id)}">
      <label class="saved-pages-drawer-edit-field">
        <span class="saved-pages-drawer-edit-label">Title</span>
        <input
          class="saved-pages-drawer-edit-input"
          name="title"
          type="text"
          value="${escapeHtml(page.title || '')}"
          placeholder="Untitled"
          ${isSavingEdit ? 'disabled' : ''}
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
          ${isSavingEdit ? 'disabled' : ''}
        >${escapeHtml(page.ai_summary_brief || '')}</textarea>
      </label>
      <div class="saved-pages-drawer-edit-actions">
        <button
          class="saved-pages-drawer-edit-save"
          type="submit"
          ${isSavingEdit ? 'disabled' : ''}
        >${isSavingEdit ? 'Saving…' : 'Save'}</button>
        <button
          class="saved-pages-drawer-edit-cancel"
          type="button"
          data-action="cancel-edit"
          data-id="${escapeHtml(page.id)}"
          ${isSavingEdit ? 'disabled' : ''}
        >Cancel</button>
      </div>
    </form>
  `;

  return `
    <article class="saved-pages-drawer-card" data-page-id="${escapeHtml(page.id || '')}"${navigationAttrs}>
      <div class="saved-pages-drawer-card-header">
        <div class="saved-pages-drawer-card-heading">
          ${domain ? `<img class="saved-pages-drawer-card-favicon" src="${getFaviconUrlForDomain(domain)}" alt="" width="18" height="18">` : ''}
          <h3 class="saved-pages-drawer-card-title">${escapeHtml(page.title || domain || 'Untitled')}</h3>
        </div>
        <div class="saved-pages-drawer-card-actions">
          ${isEditing ? '' : editButtonHtml}
          <button
            class="saved-pages-drawer-action-btn saved-pages-drawer-pin-btn ${page.pinned ? 'is-active' : ''}"
            type="button"
            data-action="pin"
            data-id="${escapeHtml(page.id)}"
            title="${page.pinned ? 'Unpin page' : 'Pin page'}"
            aria-label="${page.pinned ? 'Unpin page' : 'Pin page'}"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <path d="M12 17v5"></path>
              <path d="M8 3h8l-1 5 3 3v2H6v-2l3-3-1-5z"></path>
            </svg>
          </button>
          ${isEditing ? '' : privacyButtonHtml}
          ${projectsButtonHtml}
          <button
            class="saved-pages-drawer-action-btn saved-pages-drawer-delete-btn"
            type="button"
            data-action="delete"
            data-id="${escapeHtml(page.id)}"
            title="Delete page"
            aria-label="Delete page"
            ${isEditing ? 'disabled' : ''}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <path d="M3 6h18"></path>
              <path d="M8 6V4h8v2"></path>
              <path d="M19 6l-1 14H6L5 6"></path>
              <path d="M10 11v6"></path>
              <path d="M14 11v6"></path>
            </svg>
          </button>
        </div>
      </div>
      ${isEditing
        ? editFormHtml
        : (summary ? `<p class="saved-pages-drawer-card-summary">${escapeHtml(truncateText(summary))}</p>` : '')}
      ${projectPillsHtml}
      <div class="saved-pages-drawer-card-footer">
        ${meta.length ? `<div class="saved-pages-drawer-card-meta">${meta.join('<span class="saved-pages-drawer-meta-separator">•</span>')}</div>` : '<span></span>'}
        ${tagsHtml ? `<div class="saved-pages-drawer-card-tags">${tagsHtml}</div>` : ''}
      </div>
    </article>
  `;
}

// Compact card for the home-view Pinned shelf. Denser than the drawer card —
// favicon + title + domain + an always-visible unpin button — so a row of
// pinned pages scans at a glance. Reuses the drawer card's pin-button markup
// (same data-action/data-id/class) so the existing click delegation routes
// unpin through handleDrawerPin with no new event wiring, and the same
// data-url/role/tabindex nav attrs so card-click opens the page.
export function renderHomePinnedCardMarkup(page) {
  const domain = getPageDomain(page);
  const url = page.url || '';
  const navigationAttrs = url
    ? ` data-url="${escapeHtml(url)}" role="link" tabindex="0"`
    : '';
  const faviconHtml = domain
    ? `<img class="saved-pages-home-pinned-card-favicon" src="${getFaviconUrlForDomain(domain)}" alt="" width="16" height="16">`
    : '';

  // Pin/unpin happens from the drawer card below; the shelf card is a compact
  // launch surface, so it carries only the favicon + title.
  return `
    <article class="saved-pages-home-pinned-card" data-page-id="${escapeHtml(page.id || '')}"${navigationAttrs}>
      <div class="saved-pages-home-pinned-card-heading">
        ${faviconHtml}
        <h3 class="saved-pages-home-pinned-card-title">${escapeHtml(page.title || domain || 'Untitled')}</h3>
      </div>
    </article>
  `;
}

export function getDrawerEmptyStateContent({ query = '', scopeLabel, hasSelectedProject = false }) {
  return {
    title: query ? `No results for "${escapeHtml(query)}"` : `No pages in ${escapeHtml(scopeLabel)}`,
    description: query
      ? `Try different words or clear the search in ${escapeHtml(scopeLabel)}.`
      : hasSelectedProject
        ? 'Pages you add to this project will appear here.'
        : 'Save a page and it will appear here.'
  };
}

export function createDrawerRenderer({
  documentObj = document,
  resultsContainer,
  getEditingPageId,
  getSavingEditPageId,
  getRenderLimit,
  renderChrome,
  getProjectPills,
  isProjectsUnavailable,
  getProjectScopeLabel
}) {
  function createDrawerCardElement(page) {
    return createElementFromHtml(renderDrawerCardMarkup(page, {
      editingPageId: getEditingPageId?.() || null,
      savingEditPageId: getSavingEditPageId?.() || null,
      getProjectPills,
      projectsUnavailable: isProjectsUnavailable()
    }), documentObj);
  }

  function createHomePinnedCardElement(page) {
    return createElementFromHtml(renderHomePinnedCardMarkup(page), documentObj);
  }

  function getDrawerCardElement(pageId) {
    if (!resultsContainer || !pageId) {
      return null;
    }

    // Scope to the pages section only so card lookups never match a card in
    // the semantic-results section (which is reconciled separately).
    const scope = resultsContainer.querySelector('[data-section="pages"]') || resultsContainer;
    return Array.from(scope.querySelectorAll('.saved-pages-drawer-card'))
      .find(card => card.dataset.pageId === pageId) || null;
  }

  function renderDrawerState(html) {
    replaceElementHtml(resultsContainer, html);
    renderChrome();
  }

  // Cold-start loading state. Reuses the semantic-search digging-dog
  // illustration (theme-aware via currentColor, reduced-motion safe) so a
  // genuinely empty warm cache shows the same friendly loader rather than a
  // bare spinner + "Gathering…" copy. The message arg is accepted for
  // signature compatibility but intentionally not rendered: the dog reads as
  // "loading" without text, which avoids the brief flash of copy swapping in.
  function renderLoadingState(_message) {
    renderDrawerState(`
      <div class="saved-pages-semantic-loading saved-pages-semantic-loading-pane" aria-live="polite">
        ${LOADING_ILLUSTRATION_SVG}
      </div>
    `);
  }

  // Post-login warming state: the digging dog plus a determinate progress bar.
  // Replaces the sign-in / bare-loading panel while the cache warms fully.
  // `percent` is a 0-100 integer; when `indeterminate` is true (e.g. the server
  // has not yet returned a total) no percentage is shown and the bar gets the
  // indeterminate modifier class for a shimmer animation.
  function renderWarmingState({ percent = 0, indeterminate = false } = {}) {
    const clampedPercent = Math.max(0, Math.min(100, Math.round(percent)));
    // Indeterminate means the total is unknown: no percentage is shown anywhere
    // (no label, no aria-valuenow, and no width:% on the fill — the shimmer
    // animation styles it via the modifier class instead).
    const barFillStyle = indeterminate ? '' : `width: ${clampedPercent}%`;
    const barClass = indeterminate
      ? 'saved-pages-warming-bar saved-pages-warming-bar-indeterminate'
      : 'saved-pages-warming-bar';
    const percentLabel = indeterminate ? '' : `<span class="saved-pages-warming-percent">${clampedPercent}%</span>`;

    renderDrawerState(`
      <div class="saved-pages-semantic-loading saved-pages-semantic-loading-pane saved-pages-warming-pane" aria-live="polite">
        ${LOADING_ILLUSTRATION_SVG}
        <div class="saved-pages-warming-copy">Gathering your saved pages…</div>
        <div class="${barClass}" role="progressbar" aria-valuemin="0" aria-valuemax="100"${indeterminate ? '' : ` aria-valuenow="${clampedPercent}"`}>
          <div class="saved-pages-warming-bar-fill"${barFillStyle ? ` style="${barFillStyle}"` : ''}></div>
        </div>
        ${percentLabel}
      </div>
    `);
  }

  function renderErrorState(message) {
    renderDrawerState(`
      <div class="saved-pages-drawer-state saved-pages-drawer-state-error">
        <h2>Could not reach your saved pages</h2>
        <p>${escapeHtml(message || 'Please try again in a moment.')}</p>
      </div>
    `);
  }

  function renderEmptyState(query = '', { hasSelectedProject = false } = {}) {
    const content = getDrawerEmptyStateContent({
      query,
      scopeLabel: getProjectScopeLabel(),
      hasSelectedProject
    });

    renderDrawerState(`
      <div class="empty-state saved-pages-drawer-state">
        <h2>${content.title}</h2>
        <p>${content.description}</p>
      </div>
    `);
  }

  function renderSignInState() {
    renderDrawerState(`
      <div class="empty-state saved-pages-drawer-state">
        <h2>Sign in to browse saved pages</h2>
        <p>Sign in and your saved pages will appear here.</p>
      </div>
    `);
  }

  // The results container hosts up to two stable sub-containers so the two
  // keyed card lists (saved pages and semantic matches) can be reconciled
  // independently without wiping each other. These are lazily created on
  // demand. Stale siblings left by full-container state renders (loading /
  // empty / sign-in) are pruned so they don't linger over the card lists.
  function ensureSection(dataSection, { ariaLabel } = {}) {
    if (!resultsContainer) {
      return null;
    }

    // Prune any non-section children (e.g. a leftover loading/empty state
    // div) before (re)building the sections.
    Array.from(resultsContainer.children).forEach(child => {
      if (!child.hasAttribute('data-section')) {
        child.remove();
      }
    });

    let section = resultsContainer.querySelector(`[data-section="${dataSection}"]`);
    if (!section) {
      section = createElementFromHtml(`<div data-section="${dataSection}"${ariaLabel ? ` aria-label="${escapeHtml(ariaLabel)}"` : ''}></div>`, documentObj);
      resultsContainer.append(section);
    }
    return section;
  }

  function renderResults(pages) {
    if (!resultsContainer) {
      return;
    }

    const pagesSection = ensureSection('pages');
    if (!pagesSection) {
      renderChrome();
      return;
    }

    if (!pages.length) {
      // No saved-page matches. The pages section is kept (rather than the
      // full-container empty state) so a semantic section can render below.
      replaceElementHtml(pagesSection, `
        <div class="empty-state saved-pages-drawer-state">
          <p>No saved pages match this search.</p>
        </div>
      `);
      renderChrome();
      return;
    }

    // Render a windowed slice. `pages` holds the full filtered set (needed for
    // count math and load-more decisions); only the first `renderLimit` cards
    // become DOM nodes. reconcileKeyedChildren reuses existing nodes by key, so
    // growing the window only creates the newly-revealed cards.
    const renderLimit = typeof getRenderLimit === 'function' ? getRenderLimit() : pages.length;
    const visiblePages = Number.isFinite(renderLimit) && renderLimit < pages.length
      ? pages.slice(0, renderLimit)
      : pages;

    reconcileKeyedChildren(pagesSection, visiblePages, {
      getKey: page => page.id || null,
      getNodeKey: node => node?.dataset?.pageId || null,
      pruneUnkeyed: true,
      renderItem: (page, existingNode) => {
        const nextCard = createDrawerCardElement(page);
        return existingNode && existingNode.outerHTML === nextCard?.outerHTML
          ? existingNode
          : nextCard;
      }
    });
    renderChrome();
  }

  function renderSemanticResults(results, { loading = false, query = '' } = {}) {
    if (!resultsContainer) {
      return;
    }

    const trimmedQuery = (query || '').trim();
    const hasResults = Array.isArray(results) && results.length > 0;

    // No query and not loading: remove the section entirely so the saved-page
    // list takes the full pane.
    if (!trimmedQuery && !loading) {
      resultsContainer.querySelector('[data-section="semantic"]')?.remove();
      return;
    }

    const section = ensureSection('semantic', { ariaLabel: 'From across everything' });
    if (!section) {
      return;
    }

    if (loading) {
      replaceElementHtml(section, `
        <p class="saved-pages-semantic-heading">From across everything</p>
        <div class="saved-pages-semantic-loading" aria-live="polite">
          ${LOADING_ILLUSTRATION_SVG}
        </div>
      `);
      return;
    }

    if (!hasResults) {
      replaceElementHtml(section, `
        <p class="saved-pages-semantic-heading">From across everything</p>
        <div class="saved-pages-drawer-state saved-pages-semantic-state">
          <p>No matches beyond your saved pages.</p>
        </div>
      `);
      return;
    }

    replaceElementHtml(section, '<p class="saved-pages-semantic-heading">From across everything</p>');
    const list = createElementFromHtml('<div class="saved-pages-semantic-list"></div>', documentObj);
    section.append(list);

    reconcileKeyedChildren(list, results, {
      getKey: page => page.id || null,
      getNodeKey: node => node?.dataset?.pageId || null,
      pruneUnkeyed: true,
      renderItem: (page, existingNode) => {
        const nextCard = createDrawerCardElement(page);
        return existingNode && existingNode.outerHTML === nextCard?.outerHTML
          ? existingNode
          : nextCard;
      }
    });
  }

  // While a semantic search is in flight, the dog takes over the whole pane:
  // all saved-page cards are hidden and only the centered illustration shows,
  // whether the search came from a tag click or the search box.
  function renderSemanticLoadingState() {
    renderDrawerState(`
      <div class="saved-pages-semantic-loading saved-pages-semantic-loading-pane" aria-live="polite">
        ${LOADING_ILLUSTRATION_SVG}
      </div>
    `);
  }

  // Drop the saved-pages section so the semantic results can occupy the full
  // pane without the local cards (or their empty-state) alongside.
  function clearPagesSection() {
    resultsContainer?.querySelector('[data-section="pages"]')?.remove();
    renderChrome();
  }

  function refreshCard(pageId, pages, query, { onMissingPage } = {}) {
    if (!pageId || !resultsContainer) {
      return;
    }

    const existingCard = getDrawerCardElement(pageId);
    const page = pages.find(entry => entry.id === pageId) || null;

    if (!page) {
      if (existingCard) {
        existingCard.remove();
      }

      onMissingPage?.(query);
      return;
    }

    const nextCard = createDrawerCardElement(page);
    if (!nextCard) {
      return;
    }

    if (!existingCard) {
      renderResults(pages);
      return;
    }

    existingCard.replaceWith(nextCard);
  }

  // Pinned shelf: a horizontal row of compact cards shown above the browse
  // list when idle (no query, no scope) and the user has pinned pages. Lives in
  // its own data-section="pinned" sibling, ordered before data-section="pages"
  // so it reads as a header. Compact cards reuse the drawer pin button so the
  // existing click delegation handles unpin with no new event wiring.
  function renderPinnedShelf(pinnedPages = []) {
    if (!resultsContainer) {
      return;
    }

    const shelfSection = ensureSection('pinned');
    if (!shelfSection) {
      renderChrome();
      return;
    }

    // The shelf reads as a header above the browse list, so keep it before the
    // pages section in DOM order. ensureSection appends; reorder if needed.
    const pagesSection = resultsContainer.querySelector('[data-section="pages"]');
    if (pagesSection && pagesSection.previousElementSibling !== shelfSection) {
      resultsContainer.insertBefore(shelfSection, pagesSection);
    }

    const pinnedSlotsHtml = pinnedPages.length
      ? pinnedPages.map(() => '<div class="saved-pages-home-pinned-slot"></div>').join('')
      : '';

    replaceElementHtml(shelfSection, `
      <div class="saved-pages-pinned-shelf">
        <div class="saved-pages-home-pinned">
          ${pinnedSlotsHtml}
        </div>
      </div>
    `);

    // Compact cards are real DOM nodes; slot them into the placeholders after
    // setting the HTML shell.
    const pinnedSlots = shelfSection.querySelectorAll('.saved-pages-home-pinned-slot');
    pinnedPages.forEach((page, index) => {
      const slot = pinnedSlots[index];
      if (slot) {
        slot.replaceWith(createHomePinnedCardElement(page));
      }
    });

    renderChrome();
  }

  // Hide the shelf when a query or scope is active. Removes the section so the
  // browse list owns the full pane.
  function clearPinnedShelf() {
    if (!resultsContainer) {
      return;
    }
    resultsContainer.querySelector('[data-section="pinned"]')?.remove();
  }

  return {
    clearPagesSection,
    clearPinnedShelf,
    refreshCard,
    renderEmptyState,
    renderErrorState,
    renderLoadingState,
    renderPinnedShelf,
    renderResults,
    renderSemanticLoadingState,
    renderSemanticResults,
    renderSignInState,
    renderWarmingState
  };
}

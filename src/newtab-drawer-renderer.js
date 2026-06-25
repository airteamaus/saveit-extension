import {
  createElementFromHtml,
  replaceElementHtml
} from './dom-render.js';
import { reconcileKeyedChildren } from './keyed-dom-list.js';
import {
  escapeHtml,
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
  const rawSummary = page.description || page.ai_summary_brief || '';
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
        <span class="saved-pages-drawer-edit-label">Description</span>
        <textarea
          class="saved-pages-drawer-edit-textarea"
          name="description"
          rows="4"
          placeholder="Add a description"
          ${isSavingEdit ? 'disabled' : ''}
        >${escapeHtml(page.description || '')}</textarea>
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
          ${domain ? `<img class="saved-pages-drawer-card-favicon" src="https://icons.duckduckgo.com/ip3/${escapeHtml(domain)}.ico" alt="" width="18" height="18">` : ''}
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

export function getDrawerEmptyStateContent({ query = '', scopeLabel, hasSelectedProject = false }) {
  return {
    title: query ? `No results for "${escapeHtml(query)}"` : `No pages in ${escapeHtml(scopeLabel)}`,
    description: query
      ? `Try different words or clear the search in ${escapeHtml(scopeLabel)}.`
      : hasSelectedProject
        ? 'Add pages to this project to see them here.'
        : 'Save a page to see it here.'
  };
}

export function createDrawerRenderer({
  documentObj = document,
  resultsContainer,
  getEditingPageId,
  getSavingEditPageId,
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

  function renderLoadingState(message = 'Loading saved pages...') {
    renderDrawerState(`
      <div class="saved-pages-drawer-state">
        <div class="saved-pages-drawer-spinner" aria-hidden="true"></div>
        <p>${escapeHtml(message)}</p>
      </div>
    `);
  }

  function renderErrorState(message) {
    renderDrawerState(`
      <div class="saved-pages-drawer-state saved-pages-drawer-state-error">
        <h2>Could not load saved pages</h2>
        <p>${escapeHtml(message || 'Please try again.')}</p>
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
        <p>Your saved pages appear here once you are signed in.</p>
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

    reconcileKeyedChildren(pagesSection, pages, {
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

  return {
    clearPagesSection,
    refreshCard,
    renderEmptyState,
    renderErrorState,
    renderLoadingState,
    renderResults,
    renderSemanticLoadingState,
    renderSemanticResults,
    renderSignInState
  };
}

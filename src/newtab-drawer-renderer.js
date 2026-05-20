import { reconcileKeyedChildren } from './keyed-dom-list.js';
import {
  escapeHtml,
  getPageDomain,
  renderPageTags,
  truncateText
} from './newtab-shared.js';

export function renderDrawerCardMarkup(page, {
  getProjectPills,
  projectsUnavailable = false
}) {
  const domain = getPageDomain(page);
  const summary = page.ai_summary_brief || page.description || '';
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

  return `
    <article class="saved-pages-drawer-card" data-page-id="${escapeHtml(page.id || '')}"${navigationAttrs}>
      <div class="saved-pages-drawer-card-header">
        <div class="saved-pages-drawer-card-heading">
          ${domain ? `<img class="saved-pages-drawer-card-favicon" src="https://icons.duckduckgo.com/ip3/${escapeHtml(domain)}.ico" alt="" width="18" height="18">` : ''}
          <h3 class="saved-pages-drawer-card-title">${escapeHtml(page.title || domain || 'Untitled')}</h3>
        </div>
        <div class="saved-pages-drawer-card-actions">
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
          <button
            class="btn-projects"
            type="button"
            data-action="projects"
            data-id="${escapeHtml(page.id)}"
            ${projectsUnavailable ? 'disabled' : ''}
            title="Manage projects"
            aria-label="Manage projects"
          >${projectsUnavailable ? 'Projects unavailable' : 'Projects'}</button>
          <button
            class="saved-pages-drawer-action-btn saved-pages-drawer-delete-btn"
            type="button"
            data-action="delete"
            data-id="${escapeHtml(page.id)}"
            title="Delete page"
            aria-label="Delete page"
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
      ${summary ? `<p class="saved-pages-drawer-card-summary">${escapeHtml(truncateText(summary))}</p>` : ''}
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
  renderChrome,
  getProjectPills,
  isProjectsUnavailable,
  getProjectScopeLabel
}) {
  function createDrawerCardElement(page) {
    const wrapper = documentObj.createElement('div');
    wrapper.innerHTML = renderDrawerCardMarkup(page, {
      getProjectPills,
      projectsUnavailable: isProjectsUnavailable()
    }).trim();
    return wrapper.firstElementChild;
  }

  function getDrawerCardElement(pageId) {
    if (!resultsContainer || !pageId) {
      return null;
    }

    return Array.from(resultsContainer.querySelectorAll('.saved-pages-drawer-card'))
      .find(card => card.dataset.pageId === pageId) || null;
  }

  function renderDrawerState(html) {
    if (resultsContainer) {
      resultsContainer.innerHTML = html;
    }
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
        <p>Your drawer is available once you are signed in.</p>
      </div>
    `);
  }

  function renderResults(pages) {
    if (!resultsContainer) {
      return;
    }

    reconcileKeyedChildren(resultsContainer, pages, {
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
    refreshCard,
    renderEmptyState,
    renderErrorState,
    renderLoadingState,
    renderResults,
    renderSignInState
  };
}

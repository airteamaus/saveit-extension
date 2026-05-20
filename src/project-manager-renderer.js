export function getProjectActionIcon(action) {
  if (action === 'rename') {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="M12 20h9"></path>
        <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z"></path>
      </svg>
    `;
  }

  if (action === 'visibility') {
    return `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
        <circle cx="8.5" cy="7" r="4"></circle>
        <path d="M20 8v6"></path>
        <path d="M23 11h-6"></path>
      </svg>
    `;
  }

  return `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      <polyline points="21 8 21 21 3 21 3 8"></polyline>
      <rect x="1" y="3" width="22" height="5"></rect>
      <line x1="10" y1="12" x2="14" y2="12"></line>
    </svg>
  `;
}

export function renderProjectSidebar(container, {
  dashboard,
  htmlUtils,
  isProjectsUnavailable,
  getProjectsUnavailableMessage,
  getSelectedProject
}) {
  if (!container) {
    return;
  }

  if (isProjectsUnavailable(dashboard)) {
    container.innerHTML = `
      <div class="project-sidebar-header">
        <div>
          <p class="project-sidebar-eyebrow">Projects</p>
          <h2 class="project-sidebar-title">Collections</h2>
        </div>
      </div>
      <p class="project-sidebar-empty">${htmlUtils.escapeHtml(getProjectsUnavailableMessage(dashboard))}</p>
    `;
    return;
  }

  if (dashboard.projectsLoading) {
    container.innerHTML = `
      <div class="project-sidebar-header">
        <div>
          <p class="project-sidebar-eyebrow">Projects</p>
          <h2 class="project-sidebar-title">Collections</h2>
        </div>
        <button class="project-sidebar-create" type="button" disabled>New</button>
      </div>
      <p class="project-sidebar-empty">Loading projects...</p>
    `;
    return;
  }

  const totalCount = typeof dashboard.allItemsTotal === 'number'
    ? dashboard.allItemsTotal
    : (typeof dashboard.totalPages === 'number' ? dashboard.totalPages : null);
  const selectedProject = getSelectedProject(dashboard);
  const projectRows = (dashboard.projects || [])
    .filter(project => !project.archived)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(project => {
      const activeClass = project.id === dashboard.selectedProjectId ? 'is-active' : '';
      const visibilityLabel = project.visibility === 'company' ? 'Shared' : 'Private';

      return `
        <div class="project-nav-row has-actions ${activeClass}" data-project-id="${htmlUtils.escapeHtml(project.id)}">
          <button class="project-nav-item ${activeClass}" data-project-id="${htmlUtils.escapeHtml(project.id)}">
            <span class="project-nav-name">${htmlUtils.escapeHtml(project.name)}</span>
          </button>
          <div class="project-nav-meta">
            <span class="project-nav-visibility">${visibilityLabel}</span>
            <div class="project-nav-meta-right">
              <span class="project-nav-count">${project.page_count || 0}</span>
              <div class="project-nav-actions" aria-label="Project actions for ${htmlUtils.escapeHtml(project.name)}">
                <button
                  class="project-nav-action project-action-rename"
                  data-project-id="${htmlUtils.escapeHtml(project.id)}"
                  title="Rename project"
                  aria-label="Rename ${htmlUtils.escapeHtml(project.name)}"
                >${getProjectActionIcon('rename')}</button>
                <button
                  class="project-nav-action project-action-visibility"
                  data-project-id="${htmlUtils.escapeHtml(project.id)}"
                  title="${project.visibility === 'company' ? 'Make private' : 'Share with company'}"
                  aria-label="${project.visibility === 'company' ? 'Make private' : 'Share with company'}"
                >${getProjectActionIcon('visibility')}</button>
                <button
                  class="project-nav-action project-action-archive"
                  data-project-id="${htmlUtils.escapeHtml(project.id)}"
                  title="Archive project"
                  aria-label="Archive ${htmlUtils.escapeHtml(project.name)}"
                >${getProjectActionIcon('archive')}</button>
              </div>
            </div>
          </div>
        </div>
      `;
    })
    .join('');

  container.innerHTML = `
    <div class="project-sidebar-header">
      <div>
        <p class="project-sidebar-eyebrow">Projects</p>
        <h2 class="project-sidebar-title">Collections</h2>
      </div>
      <button class="project-sidebar-create" type="button">New</button>
    </div>

    <div class="project-nav">
      <div class="project-nav-row ${selectedProject ? '' : 'is-active'}" data-project-id="">
        <button class="project-nav-item ${selectedProject ? '' : 'is-active'}" data-project-id="">
          <span class="project-nav-name">All saved items</span>
        </button>
        <div class="project-nav-meta">
          <span class="project-nav-visibility">Default feed</span>
          ${typeof totalCount === 'number'
            ? `<div class="project-nav-meta-right"><span class="project-nav-count">${totalCount}</span></div>`
            : ''}
        </div>
      </div>

      <div class="project-nav-section-label">My projects</div>
      ${projectRows || '<p class="project-sidebar-empty">No projects yet. Create one to group related pages.</p>'}
    </div>
  `;
}

export function renderProjectEditor(backdrop, dialog, {
  dashboard,
  htmlUtils,
  isProjectsUnavailable,
  getProjectsUnavailableMessage,
  getProjectPills,
  onMissingPage
}) {
  if (!backdrop || !dialog) {
    return;
  }

  if (isProjectsUnavailable(dashboard)) {
    backdrop.classList.remove('hidden');
    dialog.classList.remove('hidden');
    dialog.innerHTML = `
      <div class="project-editor-header">
        <div>
          <p class="project-editor-eyebrow">Page projects</p>
          <h2 id="project-editor-title" class="project-editor-title">Projects unavailable</h2>
        </div>
        <button class="project-editor-close" type="button" aria-label="Close project editor">Close</button>
      </div>
      <p class="project-editor-empty">${htmlUtils.escapeHtml(getProjectsUnavailableMessage(dashboard))}</p>
    `;
    return;
  }

  const pageId = dashboard.projectEditorState?.pageId;
  if (!pageId) {
    backdrop.classList.add('hidden');
    dialog.classList.add('hidden');
    dialog.innerHTML = '';
    return;
  }

  const page = dashboard.allPages.find(entry => entry.id === pageId) || dashboard.pages.find(entry => entry.id === pageId);
  if (!page) {
    onMissingPage?.();
    return;
  }

  const query = dashboard.projectEditorState.query || '';
  const filteredProjects = (dashboard.projects || [])
    .filter(project => !project.archived)
    .filter(project => project.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));
  const exactNameMatch = (dashboard.projects || []).some(project => project.name.toLowerCase() === query.trim().toLowerCase());
  const assignedProjects = getProjectPills(page, dashboard);

  const projectOptions = filteredProjects.length > 0
    ? filteredProjects.map(project => {
      const isChecked = page.project_ids?.includes(project.id);
      return `
        <label class="project-editor-option">
          <input
            class="project-editor-checkbox"
            type="checkbox"
            data-page-id="${htmlUtils.escapeHtml(page.id)}"
            data-project-id="${htmlUtils.escapeHtml(project.id)}"
            ${isChecked ? 'checked' : ''}
          >
          <span class="project-editor-option-main">
            <span class="project-editor-option-name">${htmlUtils.escapeHtml(project.name)}</span>
            <span class="project-editor-option-meta">${project.visibility === 'company' ? 'Shared with company' : 'Private project'}</span>
          </span>
        </label>
      `;
    }).join('')
    : '<p class="project-editor-empty">No matching projects yet.</p>';

  const createButton = query.trim() && !exactNameMatch
    ? `
      <button
        class="project-editor-create"
        type="button"
        data-page-id="${htmlUtils.escapeHtml(page.id)}"
        data-project-name="${htmlUtils.escapeHtml(query.trim())}"
      >
        Create "${htmlUtils.escapeHtml(query.trim())}"
      </button>
    `
    : '';

  dialog.innerHTML = `
    <div class="project-editor-header">
      <div>
        <p class="project-editor-eyebrow">Page projects</p>
        <h2 id="project-editor-title" class="project-editor-title">${htmlUtils.escapeHtml(page.title || 'Saved page')}</h2>
      </div>
      <button class="project-editor-close" type="button" aria-label="Close project editor">Close</button>
    </div>

    <div class="project-editor-assigned">
      ${assignedProjects.length > 0
        ? assignedProjects.map(project => `<span class="project-chip">${htmlUtils.escapeHtml(project.name)}</span>`).join('')
        : '<span class="project-editor-empty-inline">Not assigned to any projects yet.</span>'}
    </div>

    <label class="project-editor-search">
      <span class="project-editor-search-label">Search projects</span>
      <input
        id="project-editor-search-input"
        class="search-input project-editor-search-input"
        type="text"
        value="${htmlUtils.escapeHtml(query)}"
        placeholder="Find or create a project"
        autocomplete="off"
      >
    </label>

    ${createButton}

    <div class="project-editor-list">
      ${projectOptions}
    </div>
  `;

  backdrop.classList.remove('hidden');
  dialog.classList.remove('hidden');
}

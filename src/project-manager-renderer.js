import { PINNED_PAGES_SCOPE_ID } from './project-manager-state.js';

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

function createElement(documentObj, tagName, { className = '', text = '', attributes = {} } = {}) {
  const element = documentObj.createElement(tagName);
  if (className) {
    element.className = className;
  }
  if (text) {
    element.textContent = text;
  }
  Object.entries(attributes).forEach(([name, value]) => {
    if (value !== undefined && value !== null) {
      element.setAttribute(name, value);
    }
  });
  return element;
}

function createIconElement(documentObj, action) {
  const parser = new DOMParser();
  const iconDocument = parser.parseFromString(getProjectActionIcon(action).trim(), 'image/svg+xml');
  return documentObj.importNode(iconDocument.documentElement, true);
}

function createSidebarHeader(documentObj, { disableCreate = false } = {}) {
  const header = createElement(documentObj, 'div', { className: 'project-sidebar-header' });
  const titleWrap = createElement(documentObj, 'div');
  titleWrap.append(createElement(documentObj, 'h2', {
    className: 'project-sidebar-title',
    text: 'Collections'
  }));
  header.append(titleWrap);

  if (disableCreate !== null) {
    header.append(createElement(documentObj, 'button', {
      className: 'project-sidebar-create',
      text: 'New',
      attributes: {
        type: 'button',
        ...(disableCreate ? { disabled: 'disabled' } : {})
      }
    }));
  }

  return header;
}

function createSidebarRow(documentObj, {
  projectId = '',
  name,
  visibility,
  count,
  isActive = false,
  actions = []
}) {
  const row = createElement(documentObj, 'div', {
    className: `project-nav-row${actions.length ? ' has-actions' : ''}${isActive ? ' is-active' : ''}`,
    attributes: {
      'data-project-id': projectId
    }
  });
  const button = createElement(documentObj, 'button', {
    className: `project-nav-item${isActive ? ' is-active' : ''}`,
    attributes: {
      'data-project-id': projectId
    }
  });
  button.append(createElement(documentObj, 'span', {
    className: 'project-nav-name',
    text: name
  }));
  row.append(button);

  const meta = createElement(documentObj, 'div', { className: 'project-nav-meta' });
  meta.append(createElement(documentObj, 'span', {
    className: 'project-nav-visibility',
    text: visibility
  }));

  if (typeof count === 'number' || actions.length) {
    const metaRight = createElement(documentObj, 'div', { className: 'project-nav-meta-right' });
    if (typeof count === 'number') {
      metaRight.append(createElement(documentObj, 'span', {
        className: 'project-nav-count',
        text: String(count)
      }));
    }

    if (actions.length) {
      const actionGroup = createElement(documentObj, 'div', {
        className: 'project-nav-actions',
        attributes: {
          'aria-label': `Project actions for ${name}`
        }
      });
      actions.forEach(action => {
        const actionButton = createElement(documentObj, 'button', {
          className: `project-nav-action project-action-${action.action}`,
          attributes: {
            'data-project-id': projectId,
            type: 'button',
            title: action.title,
            'aria-label': action.label
          }
        });
        actionButton.append(createIconElement(documentObj, action.action));
        actionGroup.append(actionButton);
      });
      metaRight.append(actionGroup);
    }

    meta.append(metaRight);
  }

  row.append(meta);
  return row;
}

function createEditorHeader(documentObj, title) {
  const header = createElement(documentObj, 'div', { className: 'project-editor-header' });
  const titleWrap = createElement(documentObj, 'div');
  titleWrap.append(
    createElement(documentObj, 'p', {
      className: 'project-editor-eyebrow',
      text: 'Page projects'
    }),
    createElement(documentObj, 'h2', {
      className: 'project-editor-title',
      text: title,
      attributes: {
        id: 'project-editor-title'
      }
    })
  );
  header.append(
    titleWrap,
    createElement(documentObj, 'button', {
      className: 'project-editor-close',
      text: 'Close',
      attributes: {
        type: 'button',
        'aria-label': 'Close project editor'
      }
    })
  );
  return header;
}

export function renderProjectSidebar(container, {
  dashboard,
  htmlUtils: _htmlUtils,
  isProjectsUnavailable,
  getProjectsUnavailableMessage,
  getSelectedProject,
  documentObj = container?.ownerDocument || document
}) {
  if (!container) {
    return;
  }

  if (isProjectsUnavailable(dashboard)) {
    container.replaceChildren(
      createSidebarHeader(documentObj, { disableCreate: null }),
      createElement(documentObj, 'p', {
        className: 'project-sidebar-empty',
        text: getProjectsUnavailableMessage(dashboard)
      })
    );
    return;
  }

  if (dashboard.projectsLoading) {
    container.replaceChildren(
      createSidebarHeader(documentObj, { disableCreate: true }),
      createElement(documentObj, 'p', {
        className: 'project-sidebar-empty',
        text: 'Loading projects...'
      })
    );
    return;
  }

  const allPagesCount = (dashboard.allPages || []).filter(page => page.pinned !== true).length;
  const pinnedCount = (dashboard.allPages || []).filter(page => page.pinned).length;
  const selectedProject = getSelectedProject(dashboard);
  const isPinnedSelected = dashboard.selectedProjectId === PINNED_PAGES_SCOPE_ID;
  const projectRows = (dashboard.projects || [])
    .filter(project => !project.archived)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(project => {
      const activeClass = project.id === dashboard.selectedProjectId ? 'is-active' : '';
      const visibilityLabel = project.visibility === 'company' ? 'Shared' : 'Private';

      return createSidebarRow(documentObj, {
        projectId: project.id,
        name: project.name,
        visibility: visibilityLabel,
        count: project.page_count || 0,
        isActive: Boolean(activeClass),
        actions: [
          {
            action: 'rename',
            title: 'Rename project',
            label: `Rename ${project.name}`
          },
          {
            action: 'visibility',
            title: project.visibility === 'company' ? 'Make private' : 'Share with company',
            label: project.visibility === 'company' ? 'Make private' : 'Share with company'
          },
          {
            action: 'archive',
            title: 'Archive project',
            label: `Archive ${project.name}`
          }
        ]
      });
    })
    ;

  const nav = createElement(documentObj, 'div', { className: 'project-nav' });
  nav.append(
    createSidebarRow(documentObj, {
      projectId: PINNED_PAGES_SCOPE_ID,
      name: 'Pinned',
      visibility: 'Pinned pages',
      count: pinnedCount,
      isActive: isPinnedSelected
    }),
    createSidebarRow(documentObj, {
      projectId: '',
      name: 'All pages',
      visibility: 'Default feed',
      count: typeof allPagesCount === 'number' ? allPagesCount : null,
      isActive: !selectedProject && !isPinnedSelected
    }),
    createElement(documentObj, 'div', {
      className: 'project-nav-section-label',
      text: 'My projects'
    })
  );

  if (projectRows.length) {
    projectRows.forEach(row => nav.append(row));
  } else {
    nav.append(createElement(documentObj, 'p', {
      className: 'project-sidebar-empty',
      text: 'No projects yet. Create one to group related pages.'
    }));
  }

  container.replaceChildren(
    createSidebarHeader(documentObj),
    nav
  );
}

export function renderProjectEditor(backdrop, dialog, {
  dashboard,
  htmlUtils: _htmlUtils,
  isProjectsUnavailable,
  getProjectsUnavailableMessage,
  getProjectPills,
  onMissingPage,
  documentObj = dialog?.ownerDocument || document
}) {
  if (!backdrop || !dialog) {
    return;
  }

  if (isProjectsUnavailable(dashboard)) {
    backdrop.classList.remove('hidden');
    dialog.classList.remove('hidden');
    dialog.replaceChildren(
      createEditorHeader(documentObj, 'Projects unavailable'),
      createElement(documentObj, 'p', {
        className: 'project-editor-empty',
        text: getProjectsUnavailableMessage(dashboard)
      })
    );
    return;
  }

  const pageId = dashboard.projectEditorState?.pageId;
  if (!pageId) {
    backdrop.classList.add('hidden');
    dialog.classList.add('hidden');
    dialog.replaceChildren();
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
  const assigned = createElement(documentObj, 'div', { className: 'project-editor-assigned' });
  if (assignedProjects.length > 0) {
    assignedProjects.forEach(project => {
      assigned.append(createElement(documentObj, 'span', {
        className: 'project-chip',
        text: project.name
      }));
    });
  } else {
    assigned.append(createElement(documentObj, 'span', {
      className: 'project-editor-empty-inline',
      text: 'Not assigned to any projects yet.'
    }));
  }

  const search = createElement(documentObj, 'label', { className: 'project-editor-search' });
  const searchInput = createElement(documentObj, 'input', {
    className: 'search-input project-editor-search-input',
    attributes: {
      id: 'project-editor-search-input',
      type: 'text',
      placeholder: 'Find or create a project',
      autocomplete: 'off',
      value: query
    }
  });
  search.append(
    createElement(documentObj, 'span', {
      className: 'project-editor-search-label',
      text: 'Search projects'
    }),
    searchInput
  );

  const editorList = createElement(documentObj, 'div', { className: 'project-editor-list' });
  if (filteredProjects.length > 0) {
    filteredProjects.forEach(project => {
      const option = createElement(documentObj, 'label', { className: 'project-editor-option' });
      const checkbox = createElement(documentObj, 'input', {
        className: 'project-editor-checkbox',
        attributes: {
          type: 'checkbox',
          'data-page-id': page.id,
          'data-project-id': project.id
        }
      });
      checkbox.checked = page.project_ids?.includes(project.id) === true;
      const optionMain = createElement(documentObj, 'span', { className: 'project-editor-option-main' });
      optionMain.append(
        createElement(documentObj, 'span', {
          className: 'project-editor-option-name',
          text: project.name
        }),
        createElement(documentObj, 'span', {
          className: 'project-editor-option-meta',
          text: project.visibility === 'company' ? 'Shared with company' : 'Private project'
        })
      );
      option.append(checkbox, optionMain);
      editorList.append(option);
    });
  } else {
    editorList.append(createElement(documentObj, 'p', {
      className: 'project-editor-empty',
      text: 'No matching projects yet.'
    }));
  }

  const children = [
    createEditorHeader(documentObj, page.title || 'Saved page'),
    assigned,
    search
  ];

  if (query.trim() && !exactNameMatch) {
    children.push(createElement(documentObj, 'button', {
      className: 'project-editor-create',
      text: `Create "${query.trim()}"`,
      attributes: {
        type: 'button',
        'data-page-id': page.id,
        'data-project-name': query.trim()
      }
    }));
  }

  children.push(editorList);
  dialog.replaceChildren(...children);

  backdrop.classList.remove('hidden');
  dialog.classList.remove('hidden');
}

import { PINNED_PAGES_SCOPE_ID } from './project-manager-state.js';

// Collection row action icons. We use Streamline "Ultimate Light" icons
// (stored as black-on-transparent PNGs in src/img) and render them with a CSS
// mask painted by currentColor. That keeps the same theming behaviour the old
// inline stroke="currentColor" SVGs had: they adapt to light/dark mode and the
// archive icon still turns red on hover.
const ACTION_ICON_FILES = {
  rename: 'img/Pencil-Edit-Desktop--Streamline-Ultimate.png',
  visibility: 'img/Share-1--Streamline-Ultimate.png',
  archive: 'img/Archive--Streamline-Ultimate.png'
};

export function getProjectActionIcon(action) {
  const file = ACTION_ICON_FILES[action] || ACTION_ICON_FILES.archive;
  // The span carries the visual via .project-action-icon--{action} CSS mask;
  // the data attribute is kept for debugging/tests.
  return `<span class="project-action-icon project-action-icon--${action}" data-action-icon="${action}" style="mask-image: url('${file}'); -webkit-mask-image: url('${file}');" aria-hidden="true"></span>`;
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
  // Parsed as HTML (not image/svg+xml) because the icons are now masked spans
  // rather than inline SVGs. documentElement gives the span itself.
  const iconDocument = parser.parseFromString(getProjectActionIcon(action).trim(), 'text/html');
  return documentObj.importNode(iconDocument.body.firstElementChild, true);
}

function createSidebarHeader(documentObj, { disableCreate = false } = {}) {
  // The header now holds nothing visible: the create button moved next to the
  // "My projects" label. Kept as a stable attachment point so callers and
  // tests that reference it still work.
  void disableCreate;
  return createElement(documentObj, 'div', { className: 'project-sidebar-header' });
}

// Create-project icon button. Lives next to the "My projects" section label.
function createCreateButton(documentObj, { disableCreate = false } = {}) {
  const createBtn = createElement(documentObj, 'button', {
    className: 'project-sidebar-create',
    attributes: {
      type: 'button',
      title: 'New project',
      'aria-label': 'New project',
      ...(disableCreate ? { disabled: 'disabled' } : {})
    }
  });
  // Icon button (masked PNG painted by currentColor), matching the row
  // action icons. The tag-plus icon reads as "create".
  const iconFile = 'img/Tag-New--Streamline-Ultimate.png';
  createBtn.innerHTML = `<span class="project-action-icon project-sidebar-create-icon" style="mask-image: url('${iconFile}'); -webkit-mask-image: url('${iconFile}');" aria-hidden="true"></span>`;
  return createBtn;
}

function createSectionLabel(documentObj, text, dotColor = null, trailing = null) {
  const label = createElement(documentObj, 'div', {
    className: 'project-nav-section-label'
  });
  // Colored dot ties each group to an accent (personal vs shared), matching
  // the reference's colored section markers.
  label.append(createElement(documentObj, 'span', {
    className: 'project-nav-section-dot',
    attributes: dotColor ? { style: `background: ${dotColor};` } : {}
  }));
  label.append(createElement(documentObj, 'span', {
    className: 'project-nav-section-text',
    text
  }));
  if (trailing) {
    label.append(trailing);
  }
  return label;
}

function createSidebarRow(documentObj, {
  projectId = '',
  name,
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
    className: 'project-nav-hash',
    text: '#',
    attributes: { 'aria-hidden': 'true' }
  }));
  button.append(createElement(documentObj, 'span', {
    className: 'project-nav-name',
    text: name
  }));
  row.append(button);

  if (typeof count === 'number' || actions.length) {
    const meta = createElement(documentObj, 'div', { className: 'project-nav-meta' });
    if (typeof count === 'number') {
      meta.append(createElement(documentObj, 'span', {
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
      meta.append(actionGroup);
    }

    row.append(meta);
  }

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
  const visibleProjects = (dashboard.projects || [])
    .filter(project => !project.archived)
    .sort((a, b) => a.name.localeCompare(b.name));
  const createProjectRow = project => {
      const activeClass = project.id === dashboard.selectedProjectId ? 'is-active' : '';

      return createSidebarRow(documentObj, {
        projectId: project.id,
        name: project.name,
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
    };
  const privateProjects = visibleProjects.filter(project => project.visibility !== 'company');
  const sharedProjects = visibleProjects.filter(project => project.visibility === 'company');

  const nav = createElement(documentObj, 'div', { className: 'project-nav' });
  nav.append(
    createSidebarRow(documentObj, {
      projectId: '',
      name: 'All pages',
      count: typeof allPagesCount === 'number' ? allPagesCount : null,
      isActive: !selectedProject && !isPinnedSelected
    }),
    createSidebarRow(documentObj, {
      projectId: PINNED_PAGES_SCOPE_ID,
      name: 'Pinned',
      count: pinnedCount,
      isActive: isPinnedSelected
    })
  );

  // The create-project button sits on the right of the first section label
  // (My projects, or Shared projects when there are no personal ones).
  const createButton = createCreateButton(documentObj);

  if (privateProjects.length) {
    nav.append(createSectionLabel(documentObj, 'My projects', 'var(--color-primary)', createButton));
    privateProjects.forEach(project => nav.append(createProjectRow(project)));
    if (sharedProjects.length) {
      nav.append(createSectionLabel(documentObj, 'Shared projects', 'var(--color-primary)'));
      sharedProjects.forEach(project => nav.append(createProjectRow(project)));
    }
  } else if (sharedProjects.length) {
    nav.append(createSectionLabel(documentObj, 'Shared projects', 'var(--color-primary)', createButton));
    sharedProjects.forEach(project => nav.append(createProjectRow(project)));
  } else {
    // No projects at all: still show the "My projects" label so the create
    // button is reachable, plus the empty hint.
    nav.append(createSectionLabel(documentObj, 'My projects', 'var(--color-primary)', createButton));
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

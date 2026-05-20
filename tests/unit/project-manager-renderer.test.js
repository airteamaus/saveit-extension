import { describe, expect, it, vi } from 'vitest';

import {
  getProjectActionIcon,
  renderProjectEditor,
  renderProjectSidebar
} from '../../src/project-manager-renderer.js';

describe('project manager renderer helpers', () => {
  it('renders the sidebar unavailable state message', () => {
    document.body.innerHTML = '<div id="project-sidebar"></div>';
    const container = document.getElementById('project-sidebar');

    renderProjectSidebar(container, {
      dashboard: {
        projectsAvailable: false
      },
      htmlUtils: {
        escapeHtml: value => value
      },
      isProjectsUnavailable: () => true,
      getProjectsUnavailableMessage: () => 'Projects unavailable right now.',
      getSelectedProject: () => null
    });

    expect(container.textContent).toContain('Projects unavailable right now.');
  });

  it('renders the sidebar project rows and archive icon actions', () => {
    document.body.innerHTML = '<div id="project-sidebar"></div>';
    const container = document.getElementById('project-sidebar');

    renderProjectSidebar(container, {
      dashboard: {
        allItemsTotal: 4,
        projectsLoading: false,
        selectedProjectId: 'project-1',
        projects: [
          { id: 'project-1', name: 'Alpha', page_count: 2, visibility: 'private' }
        ]
      },
      htmlUtils: {
        escapeHtml: value => value
      },
      isProjectsUnavailable: () => false,
      getProjectsUnavailableMessage: () => '',
      getSelectedProject: dashboard => dashboard.projects[0]
    });

    expect(container.innerHTML).toContain('project-action-archive');
    expect(container.textContent).toContain('Alpha');
    expect(container.textContent).toContain('Default feed');
  });

  it('renders the editor unavailable state and can clear missing pages', () => {
    document.body.innerHTML = `
      <div id="project-editor-backdrop" class="hidden"></div>
      <div id="project-editor-dialog" class="hidden"></div>
    `;
    const backdrop = document.getElementById('project-editor-backdrop');
    const dialog = document.getElementById('project-editor-dialog');

    renderProjectEditor(backdrop, dialog, {
      dashboard: {
        projectsAvailable: false
      },
      htmlUtils: {
        escapeHtml: value => value
      },
      isProjectsUnavailable: () => true,
      getProjectsUnavailableMessage: () => 'Unsupported backend',
      getProjectPills: () => [],
      onMissingPage: vi.fn()
    });

    expect(backdrop.classList.contains('hidden')).toBe(false);
    expect(dialog.textContent).toContain('Unsupported backend');

    const onMissingPage = vi.fn();
    renderProjectEditor(backdrop, dialog, {
      dashboard: {
        projectsAvailable: true,
        projectEditorState: { pageId: 'missing', query: '' },
        allPages: [],
        pages: [],
        projects: []
      },
      htmlUtils: {
        escapeHtml: value => value
      },
      isProjectsUnavailable: () => false,
      getProjectsUnavailableMessage: () => '',
      getProjectPills: () => [],
      onMissingPage
    });

    expect(onMissingPage).toHaveBeenCalled();
  });

  it('returns distinct action icons for rename and archive actions', () => {
    expect(getProjectActionIcon('rename')).toContain('M16.5 3.5');
    expect(getProjectActionIcon('archive')).toContain('<rect x="1" y="3" width="22" height="5"></rect>');
  });
});

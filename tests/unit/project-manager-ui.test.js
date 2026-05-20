import { describe, expect, it, vi } from 'vitest';

import {
  createProjectManagerUi,
  focusProjectEditorSearchInput
} from '../../src/project-manager-ui.js';

describe('project manager ui', () => {
  it('focuses the editor search input and restores the caret', () => {
    document.body.innerHTML = '<input id="project-editor-search-input" value="alpha">';
    const input = document.getElementById('project-editor-search-input');
    input.focus = vi.fn();
    input.setSelectionRange = vi.fn();

    focusProjectEditorSearchInput(document, 'alpha');

    expect(input.focus).toHaveBeenCalled();
    expect(input.setSelectionRange).toHaveBeenCalledWith(5, 5);
  });

  it('opens the editor and focuses the search field', () => {
    document.body.innerHTML = `
      <div id="project-editor-backdrop" class="hidden"></div>
      <div id="project-editor-dialog" class="hidden"></div>
    `;
    const ui = createProjectManagerUi({
      htmlUtils: { escapeHtml: value => value },
      isProjectsUnavailable: () => false,
      getProjectsUnavailableMessage: () => '',
      getSelectedProject: () => null,
      getProjectPills: () => []
    });
    const dashboard = {
      projectsAvailable: true,
      allPages: [{ id: 'page-1', title: 'Alpha', project_ids: [] }],
      pages: [],
      projects: [],
      projectEditorState: { pageId: null, query: '' }
    };

    ui.openEditor(dashboard, 'page-1');

    expect(dashboard.projectEditorState).toEqual({ pageId: 'page-1', query: '' });
    expect(document.activeElement?.id).toBe('project-editor-search-input');
  });

  it('alerts instead of opening when projects are unavailable', () => {
    const alertFn = vi.fn();
    const ui = createProjectManagerUi({
      htmlUtils: { escapeHtml: value => value },
      alertFn,
      isProjectsUnavailable: () => true,
      getProjectsUnavailableMessage: () => 'Unsupported backend',
      getSelectedProject: () => null,
      getProjectPills: () => []
    });
    const dashboard = {
      projectEditorState: { pageId: null, query: '' }
    };

    ui.openEditor(dashboard, 'page-1');

    expect(alertFn).toHaveBeenCalledWith('Unsupported backend');
    expect(dashboard.projectEditorState).toEqual({ pageId: null, query: '' });
  });

  it('updates the editor query, re-renders, and restores the caret', () => {
    document.body.innerHTML = `
      <div id="project-editor-backdrop" class="hidden"></div>
      <div id="project-editor-dialog"></div>
    `;
    const ui = createProjectManagerUi({
      htmlUtils: { escapeHtml: value => value },
      isProjectsUnavailable: () => false,
      getProjectsUnavailableMessage: () => '',
      getSelectedProject: () => null,
      getProjectPills: () => []
    });
    const dashboard = {
      projectsAvailable: true,
      allPages: [{ id: 'page-1', title: 'Alpha', project_ids: [] }],
      pages: [],
      projects: [{ id: 'project-1', name: 'Alpha', visibility: 'private' }],
      projectEditorState: { pageId: 'page-1', query: '' }
    };

    ui.updateEditorQuery(dashboard, 'alp');

    expect(dashboard.projectEditorState.query).toBe('alp');
    expect(document.activeElement?.id).toBe('project-editor-search-input');
    expect(document.getElementById('project-editor-search-input').value).toBe('alp');
  });

  it('renders the sidebar through the shared renderer contract', () => {
    document.body.innerHTML = '<div id="project-sidebar"></div>';
    const ui = createProjectManagerUi({
      htmlUtils: { escapeHtml: value => value },
      isProjectsUnavailable: () => false,
      getProjectsUnavailableMessage: () => '',
      getSelectedProject: dashboard => dashboard.projects[0]
    });
    const dashboard = {
      allItemsTotal: 2,
      projectsLoading: false,
      selectedProjectId: 'project-1',
      projects: [{ id: 'project-1', name: 'Alpha', page_count: 1, visibility: 'private' }]
    };

    ui.renderSidebar(dashboard);

    expect(document.getElementById('project-sidebar').textContent).toContain('Alpha');
  });
});

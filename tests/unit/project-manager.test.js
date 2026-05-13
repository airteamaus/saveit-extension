import { beforeEach, describe, expect, it, vi } from 'vitest';

import projectManagerModule from '../../src/project-manager.js';

const ProjectManager = projectManagerModule.ProjectManager || window.ProjectManager;
const htmlUtils = {
  escapeHtml(value = '') {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll('\'', '&#39;');
  }
};

describe('ProjectManager', () => {
  let api;
  let manager;
  let dashboard;

  beforeEach(() => {
    document.body.innerHTML = `
      <aside id="project-sidebar"></aside>
      <div id="project-editor-backdrop" class="hidden"></div>
      <section id="project-editor-dialog" class="hidden"></section>
    `;

    api = {
      addPageToProject: vi.fn(async () => ({ success: true })),
      removePageFromProject: vi.fn(async () => ({ success: true })),
      createProject: vi.fn(async payload => ({
        id: 'project-new',
        ...payload,
        page_count: 0,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      })),
      updateProject: vi.fn(async (_projectId, updates) => updates)
    };

    manager = new ProjectManager(api, htmlUtils);
    vi.stubGlobal('alert', vi.fn());
    dashboard = {
      allPages: [
        { id: '1', title: 'Page one', project_ids: ['project-1'] },
        { id: '2', title: 'Page two', project_ids: ['project-2'] },
        { id: '3', title: 'Page three', project_ids: ['project-1', 'project-2'] }
      ],
      pages: [
        { id: '1', title: 'Page one', project_ids: ['project-1'] },
        { id: '2', title: 'Page two', project_ids: ['project-2'] },
        { id: '3', title: 'Page three', project_ids: ['project-1', 'project-2'] }
      ],
      projects: [
        { id: 'project-1', name: 'SaveIt product', visibility: 'private', page_count: 2 },
        { id: 'project-2', name: 'AI radar', visibility: 'company', page_count: 2 }
      ],
      projectsLoading: false,
      projectsAvailable: true,
      projectsUnavailableMessage: '',
      allItemsTotal: 3,
      totalPages: 3,
      selectedProjectId: null,
      projectEditorState: {
        pageId: null,
        query: ''
      },
      currentFilter: {
        search: '',
        projectId: null,
        cursor: null
      },
      tagInteractionManager: {
        clearSelection: vi.fn()
      },
      discoveryManager: {
        exit: vi.fn()
      },
      showLoading: vi.fn(),
      loadPages: vi.fn(async () => {}),
      handleFilterChange: vi.fn(async () => {}),
      render: vi.fn(),
      onProjectsUpdated: vi.fn(),
      getCurrentUser: vi.fn(() => ({
        uid: 'user-123',
        email: 'rich@airteam.com.au'
      }))
    };
  });

  it('filters pages by selected project', () => {
    dashboard.selectedProjectId = 'project-1';

    const scopedPages = manager.getScopedPages(dashboard, dashboard.allPages);

    expect(scopedPages.map(page => page.id)).toEqual(['1', '3']);
  });

  it('renders the project sidebar with counts and actions', () => {
    manager.renderSidebar(dashboard);

    const sidebar = document.getElementById('project-sidebar');
    expect(sidebar.textContent).toContain('All saved items');
    expect(sidebar.textContent).toContain('SaveIt product');
    expect(sidebar.textContent).toContain('AI radar');
    expect(sidebar.textContent).toContain('Share');
    expect(sidebar.textContent).toContain('Rename');
  });

  it('selects a project and reloads the scoped dashboard data', async () => {
    await manager.selectProject(dashboard, 'project-2');

    expect(dashboard.selectedProjectId).toBe('project-2');
    expect(dashboard.currentFilter.projectId).toBe('project-2');
    expect(dashboard.showLoading).toHaveBeenCalled();
    expect(dashboard.loadPages).toHaveBeenCalled();
    expect(dashboard.handleFilterChange).toHaveBeenCalled();
  });

  it('updates local membership and project counts when toggling a page project', async () => {
    await manager.togglePageProject(dashboard, '2', 'project-1', true);

    expect(api.addPageToProject).toHaveBeenCalledWith('project-1', '2');
    expect(dashboard.allPages.find(page => page.id === '2').project_ids).toEqual(['project-2', 'project-1']);
    expect(dashboard.projects.find(project => project.id === 'project-1').page_count).toBe(3);
    expect(dashboard.handleFilterChange).toHaveBeenCalled();
  });

  it('renders the project editor with assigned projects and matching options', () => {
    dashboard.projectEditorState = {
      pageId: '3',
      query: 'save'
    };

    manager.renderEditor(dashboard);

    const dialog = document.getElementById('project-editor-dialog');
    expect(dialog.textContent).toContain('Page three');
    expect(dialog.textContent).toContain('SaveIt product');
    expect(dialog.textContent).toContain('Create "save"');
  });

  it('alerts instead of throwing when project creation fails', async () => {
    api.createProject.mockRejectedValueOnce(new Error('Project name already exists'));

    const result = await manager.createProject(dashboard, 'Duplicate name');

    expect(result).toBeNull();
    expect(global.alert).toHaveBeenCalledWith('Project name already exists');
  });

  it('renders an unavailable message when the backend does not support projects', () => {
    dashboard.projectsAvailable = false;
    dashboard.projectsUnavailableMessage = 'Project collections are not supported by the connected backend yet.';

    manager.renderSidebar(dashboard);

    const sidebar = document.getElementById('project-sidebar');
    expect(sidebar.textContent).toContain('not supported by the connected backend');
    expect(sidebar.textContent).not.toContain('New');
  });

  it('renders a loading state while projects are hydrating', () => {
    dashboard.projects = [];
    dashboard.projectsLoading = true;

    manager.renderSidebar(dashboard);

    const sidebar = document.getElementById('project-sidebar');
    expect(sidebar.textContent).toContain('Loading projects...');
  });

  it('refreshes cached projects in the background and notifies the dashboard', async () => {
    api.getProjects = vi
      .fn()
      .mockResolvedValueOnce(Object.assign([{ id: 'project-1', name: 'Cached project', visibility: 'private', page_count: 1 }], {
        meta: { fromCache: true }
      }))
      .mockResolvedValueOnce([{ id: 'project-1', name: 'Fresh project', visibility: 'private', page_count: 2 }]);

    await manager.loadProjects(dashboard);
    await Promise.resolve();
    await Promise.resolve();

    expect(api.getProjects).toHaveBeenNthCalledWith(1);
    expect(api.getProjects).toHaveBeenNthCalledWith(2, { skipCache: true });
    expect(dashboard.projects[0].name).toBe('Fresh project');
    expect(dashboard.onProjectsUpdated).toHaveBeenCalled();
  });

  it('alerts immediately when opening projects while unsupported', () => {
    dashboard.projectsAvailable = false;
    dashboard.projectsUnavailableMessage = 'Project collections are not supported by the connected backend yet.';

    manager.openEditor(dashboard, '1');

    expect(global.alert).toHaveBeenCalledWith('Project collections are not supported by the connected backend yet.');
  });
});

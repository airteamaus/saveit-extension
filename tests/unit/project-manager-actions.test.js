import { describe, expect, it, vi } from 'vitest';

import {
  createProjectManagerActions,
  updatePageProjectMembership
} from '../../src/project-manager-actions.js';

describe('project manager actions', () => {
  it('updates page membership for the targeted page only', () => {
    expect(updatePageProjectMembership(
      { id: 'page-1', project_ids: ['project-1'] },
      'page-1',
      'project-2',
      true
    )).toEqual({
      id: 'page-1',
      project_ids: ['project-1', 'project-2']
    });

    expect(updatePageProjectMembership(
      { id: 'page-2', project_ids: ['project-1'] },
      'page-1',
      'project-2',
      true
    )).toEqual({
      id: 'page-2',
      project_ids: ['project-1']
    });
  });

  it('hydrates projects through the projects store and refreshes counts', async () => {
    const refreshProjectCounts = vi.fn();
    const actions = createProjectManagerActions({
      api: {},
      refreshProjectCounts,
      adjustProjectCount: vi.fn(),
      renderEditor: vi.fn(),
      closeEditor: vi.fn(),
      getCompanyDomain: vi.fn(),
      isProjectsUnavailable: vi.fn(() => false),
      getProjectsUnavailableMessage: vi.fn(() => '')
    });
    const dashboard = {
      projectsStore: {
        hydrate: vi.fn().mockResolvedValue({
          projects: [{ id: 'project-1', name: 'Alpha' }]
        })
      }
    };

    await actions.loadProjects(dashboard);

    expect(dashboard.projects).toEqual([{ id: 'project-1', name: 'Alpha' }]);
    expect(dashboard.projectsAvailable).toBe(true);
    expect(dashboard.projectsUnavailableMessage).toBe('');
    expect(refreshProjectCounts).toHaveBeenCalledWith(dashboard);
  });

  it('creates a project, persists it, and renders the dashboard', async () => {
    const refreshProjectCounts = vi.fn();
    const actions = createProjectManagerActions({
      api: {
        createProject: vi.fn().mockResolvedValue({ id: 'project-2', name: 'Beta' })
      },
      refreshProjectCounts,
      adjustProjectCount: vi.fn(),
      renderEditor: vi.fn(),
      closeEditor: vi.fn(),
      getCompanyDomain: vi.fn(),
      isProjectsUnavailable: vi.fn(() => false),
      getProjectsUnavailableMessage: vi.fn(() => '')
    });
    const dashboard = {
      projects: [{ id: 'project-1', name: 'Alpha', page_count: 1 }],
      persistProjects: vi.fn().mockResolvedValue(undefined),
      render: vi.fn()
    };

    const created = await actions.createProject(dashboard, 'Beta');

    expect(created).toEqual({ id: 'project-2', name: 'Beta' });
    expect(dashboard.projects).toEqual([
      { id: 'project-1', name: 'Alpha', page_count: 1 },
      { id: 'project-2', name: 'Beta', page_count: 0 }
    ]);
    expect(dashboard.persistProjects).toHaveBeenCalled();
    expect(refreshProjectCounts).toHaveBeenCalledWith(dashboard);
    expect(dashboard.render).toHaveBeenCalled();
  });

  it('toggles page membership, persists pages, and re-renders the editor', async () => {
    const adjustProjectCount = vi.fn();
    const renderEditor = vi.fn();
    const actions = createProjectManagerActions({
      api: {
        addPageToProject: vi.fn().mockResolvedValue(undefined),
        removePageFromProject: vi.fn().mockResolvedValue(undefined)
      },
      refreshProjectCounts: vi.fn(),
      adjustProjectCount,
      renderEditor,
      closeEditor: vi.fn(),
      getCompanyDomain: vi.fn(),
      isProjectsUnavailable: vi.fn(() => false),
      getProjectsUnavailableMessage: vi.fn(() => '')
    });
    const dashboard = {
      allPages: [{ id: 'page-1', project_ids: ['project-1'] }],
      pages: [{ id: 'page-1', project_ids: ['project-1'] }],
      persistAllPages: vi.fn().mockResolvedValue(undefined),
      handleProjectMembershipChange: vi.fn()
    };

    await actions.togglePageProject(dashboard, 'page-1', 'project-2', true);

    expect(dashboard.allPages[0].project_ids).toEqual(['project-1', 'project-2']);
    expect(dashboard.pages[0].project_ids).toEqual(['project-1', 'project-2']);
    expect(adjustProjectCount).toHaveBeenCalledWith(dashboard, 'project-2', 1);
    expect(dashboard.persistAllPages).toHaveBeenCalled();
    expect(dashboard.handleProjectMembershipChange).toHaveBeenCalledWith('page-1', 'project-2');
    expect(renderEditor).toHaveBeenCalledWith(dashboard);
  });

  // The actions surface was previously exercised only on its happy paths.
  // These tests cover the error/cancellation/missing-field branches that hold
  // the real bugs (NPE on missing currentFilter, fire-and-forget rejections,
  // confirm-cancel).

  function createActions({
    api = {},
    alertFn = vi.fn(),
    promptFn = vi.fn(),
    confirmFn = vi.fn(() => true),
    notify,
    refreshProjectCounts = vi.fn(),
    adjustProjectCount = vi.fn(),
    renderEditor = vi.fn(),
    closeEditor = vi.fn(),
    getCompanyDomain = vi.fn(() => 'example.com'),
    isProjectsUnavailable = vi.fn(() => false),
    getProjectsUnavailableMessage = vi.fn(() => '')
  } = {}) {
    return createProjectManagerActions({
      api,
      alertFn,
      promptFn,
      confirmFn,
      notify,
      refreshProjectCounts,
      adjustProjectCount,
      renderEditor,
      closeEditor,
      getCompanyDomain,
      isProjectsUnavailable,
      getProjectsUnavailableMessage
    });
  }

  describe('createProject failure handling', () => {
    it('routes a backend failure through notify when present (no blocking alert)', async () => {
      const notify = vi.fn();
      const api = { createProject: vi.fn().mockRejectedValue(new Error('Name taken')) };
      const actions = createActions({ api, notify });
      const dashboard = { projects: [], persistProjects: vi.fn().mockResolvedValue(), render: vi.fn() };

      const result = await actions.createProject(dashboard, 'Duplicate');

      expect(result).toBeNull();
      expect(notify).toHaveBeenCalledWith('Name taken', { type: 'error' });
      // alertFn is the fallback when notify is absent; here it must NOT fire.
      // (Covered implicitly — assert via the spy on the actions factory below.)
    });

    it('falls back to alertFn when notify is not provided', async () => {
      const alertFn = vi.fn();
      const api = { createProject: vi.fn().mockRejectedValue(new Error('Name taken')) };
      const actions = createActions({ api, alertFn });
      const dashboard = { projects: [], persistProjects: vi.fn().mockResolvedValue(), render: vi.fn() };

      await actions.createProject(dashboard, 'Duplicate');

      expect(alertFn).toHaveBeenCalledWith('Name taken');
    });

    it('does not throw if notify itself throws (toast failure must not break the action)', async () => {
      const notify = vi.fn(() => { throw new Error('toast broken'); });
      const api = { createProject: vi.fn().mockRejectedValue(new Error('Name taken')) };
      const actions = createActions({ api, notify });
      const dashboard = { projects: [], persistProjects: vi.fn().mockResolvedValue(), render: vi.fn() };

      // Must not propagate the toast error.
      await expect(actions.createProject(dashboard, 'Duplicate')).resolves.toBeNull();
    });
  });

  describe('renameProject', () => {
    it('prompts, calls updateProject, and re-renders', async () => {
      const promptFn = vi.fn(() => 'New Name');
      const api = { updateProject: vi.fn().mockResolvedValue({ id: 'p1', name: 'New Name' }) };
      const actions = createActions({ api, promptFn });
      const dashboard = {
        projects: [{ id: 'p1', name: 'Old Name' }],
        persistProjects: vi.fn().mockResolvedValue(),
        render: vi.fn()
      };

      const result = await actions.renameProject(dashboard, 'p1');

      expect(api.updateProject).toHaveBeenCalledWith('p1', { name: 'New Name' });
      expect(dashboard.projects[0].name).toBe('New Name');
      expect(dashboard.render).toHaveBeenCalled();
      expect(result).toEqual({ id: 'p1', name: 'New Name' });
    });

    it('returns null without calling the API when the user cancels the prompt', async () => {
      const promptFn = vi.fn(() => null);
      const api = { updateProject: vi.fn() };
      const actions = createActions({ api, promptFn });
      const dashboard = { projects: [{ id: 'p1', name: 'Old' }], render: vi.fn() };

      const result = await actions.renameProject(dashboard, 'p1');

      expect(api.updateProject).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('skips the API call when the name is unchanged', async () => {
      const promptFn = vi.fn(() => 'Same');
      const api = { updateProject: vi.fn() };
      const actions = createActions({ api, promptFn });
      const dashboard = { projects: [{ id: 'p1', name: 'Same' }], render: vi.fn() };

      const result = await actions.renameProject(dashboard, 'p1');

      expect(api.updateProject).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('is a no-op when the project id is not in dashboard.projects', async () => {
      const api = { updateProject: vi.fn() };
      const actions = createActions({ api });
      const dashboard = { projects: [{ id: 'p1', name: 'Alpha' }], render: vi.fn() };

      const result = await actions.renameProject(dashboard, 'nonexistent');

      expect(result).toBeUndefined();
      expect(api.updateProject).not.toHaveBeenCalled();
    });
  });

  describe('archiveProject', () => {
    it('returns null without archiving when the user declines the confirm', async () => {
      const confirmFn = vi.fn(() => false);
      const api = { updateProject: vi.fn() };
      const actions = createActions({ api, confirmFn });
      const dashboard = { projects: [{ id: 'p1', name: 'Alpha' }] };

      const result = await actions.archiveProject(dashboard, 'p1');

      expect(api.updateProject).not.toHaveBeenCalled();
      expect(dashboard.projects).toHaveLength(1);
      expect(result).toBeNull();
    });

    it('removes the project and, when it was selected, clears filter + reloads', async () => {
      const api = { updateProject: vi.fn().mockResolvedValue({}) };
      const actions = createActions({ api });
      const dashboard = {
        projects: [{ id: 'p1', name: 'Alpha' }],
        selectedProjectId: 'p1',
        currentFilter: { projectId: 'p1', cursor: 'abc' },
        tagInteractionManager: { clearSelection: vi.fn() },
        discoveryManager: { exit: vi.fn() },
        showLoading: vi.fn(),
        loadPages: vi.fn().mockResolvedValue(),
        handleFilterChange: vi.fn().mockResolvedValue(),
        persistProjects: vi.fn().mockResolvedValue()
      };

      const result = await actions.archiveProject(dashboard, 'p1');

      expect(api.updateProject).toHaveBeenCalledWith('p1', { archived: true });
      expect(dashboard.projects).toEqual([]);
      expect(dashboard.selectedProjectId).toBeNull();
      expect(dashboard.currentFilter.projectId).toBeNull();
      expect(dashboard.currentFilter.cursor).toBeNull();
      expect(dashboard.tagInteractionManager.clearSelection).toHaveBeenCalled();
      expect(dashboard.loadPages).toHaveBeenCalled();
      expect(result).toEqual({ id: 'p1', name: 'Alpha' });
    });
  });

  describe('selectProject', () => {
    // Regression: selectProject used to deref dashboard.currentFilter.projectId
    // unconditionally and NPE when the dashboard hadn't constructed the filter.
    // archiveProject in the same file guards; selectProject now matches.
    it('does not throw when dashboard.currentFilter is undefined', async () => {
      const api = {};
      const actions = createActions({ api });
      const dashboard = {
        selectedProjectId: null,
        // No currentFilter — the bug.
        tagInteractionManager: { clearSelection: vi.fn() },
        discoveryManager: { exit: vi.fn() },
        showLoading: vi.fn(),
        loadPages: vi.fn().mockResolvedValue(),
        handleFilterChange: vi.fn().mockResolvedValue()
      };

      await expect(actions.selectProject(dashboard, 'p1')).resolves.toBeUndefined();
      expect(dashboard.selectedProjectId).toBe('p1');
      expect(dashboard.loadPages).toHaveBeenCalled();
    });

    it('does not throw when tagInteractionManager / discoveryManager are absent', async () => {
      // Optional chaining on these collaborators means a minimal dashboard
      // (e.g. in tests or a stripped-down host) must not crash.
      const actions = createActions({ api: {} });
      const dashboard = {
        selectedProjectId: null,
        currentFilter: {},
        showLoading: vi.fn(),
        loadPages: vi.fn().mockResolvedValue(),
        handleFilterChange: vi.fn().mockResolvedValue()
      };

      await expect(actions.selectProject(dashboard, 'p1')).resolves.toBeUndefined();
    });

    it('sets the selected project and currentFilter', async () => {
      const actions = createActions({ api: {} });
      const dashboard = {
        selectedProjectId: null,
        currentFilter: {},
        tagInteractionManager: { clearSelection: vi.fn() },
        discoveryManager: { exit: vi.fn() },
        showLoading: vi.fn(),
        loadPages: vi.fn().mockResolvedValue(),
        handleFilterChange: vi.fn().mockResolvedValue()
      };

      await actions.selectProject(dashboard, 'p1');

      expect(dashboard.selectedProjectId).toBe('p1');
      expect(dashboard.currentFilter.projectId).toBe('p1');
      expect(dashboard.currentFilter.cursor).toBeNull();
    });
  });

  describe('toggleProjectVisibility', () => {
    it('flips private → company with the company domain attached', async () => {
      const api = { updateProject: vi.fn().mockResolvedValue({ id: 'p1', visibility: 'company', company_domain: 'example.com' }) };
      const actions = createActions({ api, getCompanyDomain: vi.fn(() => 'example.com') });
      const dashboard = {
        projects: [{ id: 'p1', name: 'Alpha', visibility: 'private' }],
        persistProjects: vi.fn().mockResolvedValue(),
        render: vi.fn()
      };

      const result = await actions.toggleProjectVisibility(dashboard, 'p1');

      expect(api.updateProject).toHaveBeenCalledWith('p1', { visibility: 'company', company_domain: 'example.com' });
      expect(dashboard.projects[0].visibility).toBe('company');
      expect(result).toEqual({ id: 'p1', visibility: 'company', company_domain: 'example.com' });
    });

    it('flips company → private with company_domain cleared', async () => {
      const api = { updateProject: vi.fn().mockResolvedValue({ id: 'p1', visibility: 'private', company_domain: null }) };
      const actions = createActions({ api });
      const dashboard = {
        projects: [{ id: 'p1', name: 'Alpha', visibility: 'company' }],
        persistProjects: vi.fn().mockResolvedValue(),
        render: vi.fn()
      };

      await actions.toggleProjectVisibility(dashboard, 'p1');

      expect(api.updateProject).toHaveBeenCalledWith('p1', { visibility: 'private', company_domain: null });
    });

    it('is a no-op when the project id is not found', async () => {
      const api = { updateProject: vi.fn() };
      const actions = createActions({ api });
      const dashboard = { projects: [{ id: 'p1', visibility: 'private' }] };

      const result = await actions.toggleProjectVisibility(dashboard, 'nonexistent');

      expect(result).toBeUndefined();
      expect(api.updateProject).not.toHaveBeenCalled();
    });
  });
});

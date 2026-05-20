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
});

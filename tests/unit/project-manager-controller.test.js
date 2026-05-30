import { describe, expect, it, vi } from 'vitest';

import { createProjectManagerController } from '../../src/project-manager-controller.js';

describe('project manager controller', () => {
  it('exposes the public project manager methods from one composed controller', () => {
    const controller = createProjectManagerController({
      api: {},
      htmlUtils: { escapeHtml: value => value }
    });

    expect(typeof controller.getScopedPages).toBe('function');
    expect(typeof controller.renderSidebar).toBe('function');
    expect(typeof controller.openEditor).toBe('function');
    expect(typeof controller.loadProjects).toBe('function');
    expect(typeof controller.togglePageProject).toBe('function');
  });

  it('uses injected alert and document dependencies for editor flows', () => {
    const alertFn = vi.fn();
    const documentObj = {
      getElementById: vi.fn(() => null)
    };
    const controller = createProjectManagerController({
      api: {},
      htmlUtils: { escapeHtml: value => value },
      alertFn,
      documentObj
    });
    const dashboard = {
      projectsAvailable: false,
      projectsUnavailableMessage: 'Unsupported backend',
      projectEditorState: { pageId: null, query: '' },
      projects: []
    };

    controller.openEditor(dashboard, 'page-1');

    expect(alertFn).toHaveBeenCalledWith('Unsupported backend');
    expect(documentObj.getElementById).not.toHaveBeenCalled();
  });

  it('routes state helpers through the composed controller surface', () => {
    const controller = createProjectManagerController({
      api: {},
      htmlUtils: { escapeHtml: value => value }
    });
    const dashboard = {
      selectedProjectId: 'project-1',
      projects: [
        { id: 'project-1', name: 'Alpha', page_count: 2, visibility: 'private' },
        { id: 'project-2', name: 'Beta', page_count: 1, visibility: 'company' }
      ],
      allPages: [
        { id: 'page-1', project_ids: ['project-1'] },
        { id: 'page-2', project_ids: ['project-2'] },
        { id: 'page-3', project_ids: ['project-1', 'project-2'] }
      ],
      totalPages: 3,
      getCurrentUser: () => ({ email: 'rich@airteam.com.au' })
    };

    expect(controller.getSelectedProject(dashboard)?.name).toBe('Alpha');
    expect(controller.getScopedPages(dashboard, dashboard.allPages).map(page => page.id)).toEqual(['page-1', 'page-3']);
    expect(controller.getStatsTotal(dashboard)).toBe(2);
    expect(controller.getCompanyDomain(dashboard)).toBe('airteam.com.au');

    dashboard.selectedProjectId = null;
    dashboard.allPages[0].pinned = true;
    expect(controller.getScopedPages(dashboard, dashboard.allPages).map(page => page.id)).toEqual(['page-2', 'page-3']);
    expect(controller.getStatsTotal(dashboard)).toBe(2);
  });
});

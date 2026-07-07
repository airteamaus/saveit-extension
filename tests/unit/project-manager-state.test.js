import { describe, expect, it } from 'vitest';

import {
  adjustProjectCount,
  getCompanyDomain,
  getCurrentUserUid,
  getProjectPills,
  getProjectsUnavailableMessage,
  getScopedPages,
  getSelectedProject,
  getStatsTotal,
  isOwnedProject,
  isProjectsUnavailable,
  refreshProjectCounts
} from '../../src/project-manager-state.js';

describe('project manager state helpers', () => {
  it('detects unavailable projects and uses the default message fallback', () => {
    expect(isProjectsUnavailable({ projectsAvailable: false })).toBe(true);
    expect(getProjectsUnavailableMessage({})).toBe(
      'Project collections are not supported by the connected backend yet.'
    );
  });

  it('selects the active project and scopes pages to it', () => {
    const dashboard = {
      selectedProjectId: 'project-2',
      projects: [
        { id: 'project-1', name: 'Alpha' },
        { id: 'project-2', name: 'Beta' }
      ]
    };
    const pages = [
      { id: 'page-1', project_ids: ['project-1'] },
      { id: 'page-2', project_ids: ['project-2'] },
      { id: 'page-3', project_ids: ['project-2', 'project-3'] }
    ];

    expect(getSelectedProject(dashboard)).toEqual({ id: 'project-2', name: 'Beta' });
    expect(getScopedPages(dashboard, pages).map(page => page.id)).toEqual(['page-2', 'page-3']);
  });

  it('treats the default all-pages scope as unpinned pages only', () => {
    const dashboard = {
      selectedProjectId: null
    };
    const pages = [
      { id: 'page-1', pinned: true },
      { id: 'page-2', pinned: false },
      { id: 'page-3' }
    ];

    expect(getScopedPages(dashboard, pages).map(page => page.id)).toEqual(['page-2', 'page-3']);
  });

  it('recomputes missing counts and returns pills for assigned projects', () => {
    const dashboard = {
      allPages: [
        { id: 'page-1', project_ids: ['project-1'] },
        { id: 'page-2', project_ids: ['project-2'] },
        { id: 'page-3', project_ids: ['project-2'] }
      ],
      projects: [
        { id: 'project-1', name: 'Alpha' },
        { id: 'project-2', name: 'Beta', page_count: 7 }
      ]
    };

    refreshProjectCounts(dashboard);

    expect(dashboard.projects).toEqual([
      { id: 'project-1', name: 'Alpha', page_count: 1 },
      { id: 'project-2', name: 'Beta', page_count: 7 }
    ]);
    expect(getProjectPills({ project_ids: ['project-2', 'missing'] }, dashboard)).toEqual([
      { id: 'project-2', name: 'Beta', page_count: 7 }
    ]);
  });

  it('adjusts counts without going below zero and computes stats totals', () => {
    const dashboard = {
      selectedProjectId: 'project-1',
      totalPages: 12,
      allPages: [
        { id: 'page-1', project_ids: ['project-1'], pinned: true },
        { id: 'page-2', project_ids: ['project-1'] },
        { id: 'page-3', project_ids: ['project-2'] }
      ],
      projects: [
        { id: 'project-1', name: 'Alpha', page_count: 1 }
      ]
    };

    adjustProjectCount(dashboard, 'project-1', -4);
    expect(dashboard.projects[0].page_count).toBe(0);
    expect(getStatsTotal(dashboard)).toBe(2);

    dashboard.selectedProjectId = null;
    expect(getStatsTotal(dashboard)).toBe(2);
  });

  it('derives the company domain from the current user email with a fallback', () => {
    expect(getCompanyDomain({
      getCurrentUser() {
        return { email: 'user@example.com' };
      }
    })).toBe('example.com');

    expect(getCompanyDomain({
      getCurrentUser() {
        return null;
      }
    })).toBe('airteam.com.au');
  });

  it('reads the current user uid from the raw Firebase user shape', () => {
    expect(getCurrentUserUid({
      getCurrentUser() {
        return { uid: 'uid-123', email: 'user@example.com' };
      }
    })).toBe('uid-123');

    expect(getCurrentUserUid({
      getCurrentUser() {
        return null;
      }
    })).toBeNull();
  });

  it('treats a project as owned when owner_user_id matches the current uid', () => {
    const dashboard = {
      getCurrentUser() {
        return { uid: 'uid-rich' };
      }
    };

    // Owned: owner_user_id matches the signed-in uid, regardless of visibility.
    expect(isOwnedProject(dashboard, { owner_user_id: 'uid-rich', visibility: 'company' })).toBe(true);
    expect(isOwnedProject(dashboard, { owner_user_id: 'uid-rich', visibility: 'private' })).toBe(true);

    // Not owned: a project someone else created and shared into this domain.
    expect(isOwnedProject(dashboard, { owner_user_id: 'uid-nick', visibility: 'company' })).toBe(false);

    // Defensive: no signed-in user means nothing is "owned".
    expect(isOwnedProject({ getCurrentUser: () => null }, { owner_user_id: 'uid-rich' })).toBe(false);
  });
});

import { describe, expect, it, vi } from 'vitest';

import {
  canHydrateDrawerWithWarmCache,
  createDrawerFiltersApplier,
  createDrawerStateSyncHelpers,
  createSavedPagesTotalNotifier,
  getDrawerCurrentUser
} from '../../src/newtab-drawer-coordination.js';

describe('newtab drawer coordination', () => {
  it('reads the current user from the drawer window context', () => {
    expect(getDrawerCurrentUser({
      firebaseAuth: {
        currentUser: { uid: 'user-1' }
      }
    })).toEqual({ uid: 'user-1' });
    expect(getDrawerCurrentUser({})).toBeNull();
  });

  describe('canHydrateDrawerWithWarmCache', () => {
    // The gate every data-fetch entry routes through before minting an auth
    // token. A cold start with no user and no bootstrap hint must fall through
    // to the sign-in state rather than erroring in getIdToken.
    it('allows hydration in standalone (non-extension) mode without a user', async () => {
      const api = { isExtension: false };
      await expect(canHydrateDrawerWithWarmCache(api, () => null)).resolves.toBe(true);
    });

    it('allows hydration in extension mode when a current user is present', async () => {
      const api = { isExtension: true, getLastKnownUserId: vi.fn() };
      await expect(canHydrateDrawerWithWarmCache(api, () => ({ uid: 'user-1' }))).resolves.toBe(true);
      // Short-circuits before touching storage when a live user exists.
      expect(api.getLastKnownUserId).not.toHaveBeenCalled();
    });

    it('allows hydration in extension mode via the last-known-user bootstrap', async () => {
      const api = {
        isExtension: true,
        getLastKnownUserId: vi.fn().mockResolvedValue('cached-user-1')
      };
      await expect(canHydrateDrawerWithWarmCache(api, () => null)).resolves.toBe(true);
      expect(api.getLastKnownUserId).toHaveBeenCalled();
    });

    it('blocks hydration in extension mode when there is no user and no bootstrap hint', async () => {
      const api = {
        isExtension: true,
        getLastKnownUserId: vi.fn().mockResolvedValue(null)
      };
      await expect(canHydrateDrawerWithWarmCache(api, () => null)).resolves.toBe(false);
    });

    it('blocks hydration when reading the bootstrap hint throws', async () => {
      const api = {
        isExtension: true,
        getLastKnownUserId: vi.fn().mockRejectedValue(new Error('storage read failed'))
      };
      await expect(canHydrateDrawerWithWarmCache(api, () => null)).resolves.toBe(false);
    });
  });

  it('notifies footer updates using the saved-pages store total', () => {
    const onSavedPagesTotalChange = vi.fn();
    const notifySavedPagesTotalChange = createSavedPagesTotalNotifier({
      savedPagesStore: {
        getSnapshot: () => ({ total: 12 })
      },
      onSavedPagesTotalChange
    });

    notifySavedPagesTotalChange();

    expect(onSavedPagesTotalChange).toHaveBeenCalledWith(12);
  });

  it('applies drawer filters against the current saved-pages view', () => {
    const state = {
      query: '',
      currentFilter: {
        search: '',
        projectId: 'project-1',
        cursor: null
      },
      selectedProjectId: 'project-1',
      allItemsTotal: 3,
      allPages: [
        { id: 'page-1', title: 'Alpha note', project_ids: ['project-1'] },
        { id: 'page-2', title: 'Alpha elsewhere', project_ids: ['project-2'] },
        { id: 'page-3', title: 'Beta note', project_ids: ['project-1'] }
      ],
      pages: [],
      total: null
    };
    const projectManager = {
      getScopedPages: vi.fn((dashboard, pages) => pages.filter(page => (
        page.project_ids?.includes(dashboard.selectedProjectId)
      )))
    };
    const applyDrawerFilters = createDrawerFiltersApplier({
      state,
      projectManager,
      getSavedPagesView: () => ({
        get selectedProjectId() {
          return state.selectedProjectId;
        }
      })
    });

    applyDrawerFilters('alpha');

    expect(projectManager.getScopedPages).toHaveBeenCalled();
    expect(state.currentFilter.search).toBe('alpha');
    expect(state.total).toBe(2);
    expect(state.pages.map(page => page.id)).toEqual(['page-1']);
  });

  it('syncs saved-pages and project snapshots through controller render hooks', () => {
    const state = {
      query: '',
      currentFilter: {
        search: '',
        projectId: null,
        cursor: null
      },
      selectedProjectId: null,
      allPages: [],
      pages: [],
      total: null,
      allItemsTotal: null,
      hasInitialized: true,
      projects: []
    };
    const applyDrawerFilters = vi.fn(query => {
      state.query = query;
      state.pages = [...state.allPages];
    });
    const renderDrawerResults = vi.fn();
    const renderDrawerChrome = vi.fn();
    const projectManager = {
      refreshProjectCounts: vi.fn()
    };
    const syncHelpers = createDrawerStateSyncHelpers({
      state,
      projectManager,
      getSavedPagesView: () => ({}),
      applyDrawerFilters,
      renderDrawerResults,
      renderDrawerChrome
    });

    syncHelpers.syncDrawerStateFromStore({
      allPages: [{ id: 'page-1' }, { id: 'page-2' }],
      total: 12
    }, {
      query: 'alpha',
      render: true
    });
    syncHelpers.syncProjectsStateFromStore({
      allPages: [{ id: 'project-1', name: 'Alpha' }]
    }, {
      render: true
    });

    expect(state.allPages.map(page => page.id)).toEqual(['page-1', 'page-2']);
    expect(state.total).toBe(12);
    expect(state.allItemsTotal).toBe(12);
    expect(projectManager.refreshProjectCounts).toHaveBeenCalled();
    expect(applyDrawerFilters).toHaveBeenCalledWith('alpha');
    expect(renderDrawerResults).toHaveBeenCalled();
    expect(state.projects).toEqual([{ id: 'project-1', name: 'Alpha' }]);
    expect(renderDrawerChrome).toHaveBeenCalled();
  });

  it('normalizes stale cached totals so all-pages counts never drop below loaded pages', () => {
    const state = {
      query: '',
      currentFilter: {
        search: '',
        projectId: '__pinned__',
        cursor: null
      },
      selectedProjectId: '__pinned__',
      allPages: [],
      pages: [],
      total: null,
      allItemsTotal: null,
      hasInitialized: true,
      projects: []
    };
    const applyDrawerFilters = vi.fn(query => {
      state.query = query;
    });
    const syncHelpers = createDrawerStateSyncHelpers({
      state,
      projectManager: {
        refreshProjectCounts: vi.fn()
      },
      getSavedPagesView: () => ({}),
      applyDrawerFilters,
      renderDrawerResults: vi.fn(),
      renderDrawerChrome: vi.fn()
    });

    syncHelpers.syncDrawerStateFromStore({
      allPages: [{ id: 'page-1' }, { id: 'page-2' }, { id: 'page-3' }],
      total: 1
    }, {
      render: false
    });

    expect(state.allItemsTotal).toBe(3);
    expect(state.total).toBe(3);
  });
});

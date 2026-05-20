import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  getDrawerEmptyStateContent,
  renderDrawerCardMarkup
} from '../../src/newtab-drawer-renderer.js';
import { createDrawerDataController } from '../../src/newtab-drawer-data.js';
import { getInitialDrawerUrlState } from '../../src/newtab-drawer-events.js';
import { shouldSyncDrawerStoreUpdate } from '../../src/newtab-drawer-sync.js';
import {
  applyAuthUI,
  getUserFacingSignInErrorMessage
} from '../../src/newtab-auth.js';
import { getDrawerSearchableText } from '../../src/newtab-drawer.js';
import { getFavoritesLayout } from '../../src/newtab-favorites.js';
import {
  getFaviconUrl,
  updateStatsDisplay
} from '../../src/newtab-shared.js';

describe('newtab modules', () => {
  describe('getFaviconUrl', () => {
    it('returns a DuckDuckGo favicon URL for valid URLs', () => {
      expect(getFaviconUrl('https://example.com/page')).toBe(
        'https://icons.duckduckgo.com/ip3/example.com.ico'
      );
    });

    it('returns null for invalid URLs', () => {
      expect(getFaviconUrl('not-a-url')).toBeNull();
    });
  });

  describe('updateStatsDisplay', () => {
    let versionIndicator;

    beforeEach(() => {
      document.body.innerHTML = '<div id="version-indicator"></div>';
      versionIndicator = document.getElementById('version-indicator');
    });

    it('renders footer stats when a numeric total is present', () => {
      updateStatsDisplay(versionIndicator, { total: 42 });

      expect(versionIndicator.querySelector('.footer-stats')?.textContent).toBe('(42 things saved)');
    });

    it('removes footer stats when pagination is unavailable', () => {
      updateStatsDisplay(versionIndicator, { total: 7 });
      updateStatsDisplay(versionIndicator, null);

      expect(versionIndicator.querySelector('.footer-stats')).toBeNull();
    });
  });

  describe('getFavoritesLayout', () => {
    it('uses the mobile grid for narrow screens', () => {
      expect(getFavoritesLayout(640, 700)).toMatchObject({
        columns: 4,
        rows: 2,
        pageSize: 8,
        tileWidth: 80
      });
    });

    it('uses the taller desktop grid for wide screens', () => {
      expect(getFavoritesLayout(1400, 900)).toMatchObject({
        columns: 10,
        rows: 3,
        pageSize: 30,
        tileWidth: 88
      });
    });
  });

  describe('getDrawerSearchableText', () => {
    it('combines title, content, tags, and classifications', () => {
      const searchable = getDrawerSearchableText({
        title: 'SaveIt',
        description: 'Browser extension',
        ai_summary_brief: 'Useful summary',
        manual_tags: ['Bookmarks'],
        classifications: [{ label: 'Research' }]
      });

      expect(searchable).toContain('saveit');
      expect(searchable).toContain('browser extension');
      expect(searchable).toContain('useful summary');
      expect(searchable).toContain('bookmarks');
      expect(searchable).toContain('research');
    });
  });

  describe('drawer renderer helpers', () => {
    it('builds an empty-state message for project-scoped views', () => {
      expect(getDrawerEmptyStateContent({
        scopeLabel: 'Project Alpha',
        hasSelectedProject: true
      })).toEqual({
        title: 'No pages in Project Alpha',
        description: 'Add pages to this project to see them here.'
      });
    });

    describe('drawer event helpers', () => {
      it('parses open drawer state from the URL search params', () => {
        expect(getInitialDrawerUrlState('?drawer=saved-pages&search=alpha')).toEqual({
          isOpen: true,
          searchQuery: 'alpha'
        });
      });

      describe('drawer sync helpers', () => {
        it('blocks store sync while suppressed', () => {
          expect(shouldSyncDrawerStoreUpdate({
            suppressSavedPagesStoreSync: true,
            hasInitialized: true,
            isExtension: false
          })).toBe(false);
        });

        it('blocks store sync before the drawer is initialized', () => {
          expect(shouldSyncDrawerStoreUpdate({
            suppressSavedPagesStoreSync: false,
            hasInitialized: false,
            isExtension: false
          })).toBe(false);
        });

        it('allows sync when the drawer is initialized and the auth preconditions are met', () => {
          expect(shouldSyncDrawerStoreUpdate({
            suppressSavedPagesStoreSync: false,
            hasInitialized: true,
            isExtension: true,
            hasCurrentUser: true
          })).toBe(true);
        });
      });

      it('ignores search when the drawer param is not active', () => {
        expect(getInitialDrawerUrlState('?search=alpha')).toEqual({
          isOpen: false,
          searchQuery: ''
        });
      });
    });

    it('renders drawer card markup with project pills and actions', () => {
      const markup = renderDrawerCardMarkup({
        id: 'page-1',
        title: 'SaveIt',
        url: 'https://example.com/article',
        description: 'A useful page',
        pinned: true
      }, {
        getProjectPills: () => [{ id: 'project-1', name: 'Important' }],
        projectsUnavailable: false
      });

      expect(markup).toContain('saved-pages-drawer-card');
      expect(markup).toContain('data-page-id="page-1"');
      expect(markup).toContain('Important');
      expect(markup).toContain('data-action="pin"');
      expect(markup).toContain('data-action="delete"');
    });
  });

  describe('drawer data helpers', () => {
   function createDrawerDataHarness(overrides = {}) {
     const state = {
       hasInitialized: false,
       isLoading: false,
       query: '',
       currentFilter: {
         search: '',
         projectId: null,
         cursor: null
       },
       pages: [],
       allPages: [],
       projects: [],
       projectsLoading: false,
       projectsAvailable: true,
       projectsUnavailableMessage: '',
       selectedProjectId: null,
       projectEditorState: {
         pageId: null,
         query: ''
       },
       total: null,
       allItemsTotal: null,
       requestId: 0,
       ...(overrides.state || {})
     };
     const savedPagesView = {
       persistAllPages: vi.fn(),
       ...(overrides.savedPagesView || {})
     };
     const api = {
       isExtension: false,
       getSavedPages: vi.fn(),
       deletePage: vi.fn(),
       pinPage: vi.fn(),
       ...(overrides.api || {})
     };
     const savedPagesStore = {
       getSnapshot: vi.fn(() => ({ allPages: [], total: 0 })),
       hydrate: vi.fn(),
       removePage: vi.fn(),
       reset: vi.fn(),
       ...(overrides.savedPagesStore || {})
     };
     const projectsStore = {
       hydrate: vi.fn().mockResolvedValue({ projects: [] }),
       ...(overrides.projectsStore || {})
     };
     const projectManager = {
       refreshProjectCounts: vi.fn(),
       adjustProjectCount: vi.fn(),
       ...(overrides.projectManager || {})
     };
     const applyDrawerFilters = vi.fn((query = '') => {
       state.query = query.trim();
       state.pages = [...state.allPages];
     });
     const dependencies = {
       api,
       state,
       savedPagesStore,
       projectsStore,
       projectManager,
       savedPagesView,
       getCurrentUser: vi.fn(() => null),
       isDrawerOpen: vi.fn(() => false),
       setDrawerSearchValue: vi.fn(),
       updateDrawerUrl: vi.fn(),
       renderDrawerLoadingState: vi.fn(),
       renderDrawerErrorState: vi.fn(),
       renderDrawerSignInState: vi.fn(),
       renderDrawerResults: vi.fn(),
       syncDrawerStateFromStore: vi.fn(),
       syncProjectsStateFromStore: vi.fn(snapshot => {
         state.projects = snapshot.projects || [];
       }),
       applyDrawerFilters,
       windowObj: {
         confirm: vi.fn(() => true),
         alert: vi.fn(),
         location: {
           href: 'https://example.com/newtab.html'
         },
         history: {
           replaceState: vi.fn()
         }
       },
       ...(overrides.dependencies || {})
     };

     return {
       controller: createDrawerDataController(dependencies),
       state,
       api,
       savedPagesStore,
       projectsStore,
       projectManager,
       savedPagesView,
       applyDrawerFilters,
       dependencies
     };
   }

   it('loads project pages across pagination and applies the trimmed query', async () => {
     const { controller, state, api, projectsStore, applyDrawerFilters, dependencies } =
       createDrawerDataHarness({
         state: {
           selectedProjectId: 'project-1'
         },
         api: {
           getSavedPages: vi.fn()
             .mockResolvedValueOnce({
               pages: [{ id: 'page-1' }, { id: 'page-2' }],
               pagination: {
                 total: 3,
                 hasNextPage: true,
                 nextCursor: 'cursor-2'
               }
             })
             .mockResolvedValueOnce({
               pages: [{ id: 'page-3' }],
               pagination: {
                 total: 3,
                 hasNextPage: false,
                 nextCursor: null
               }
             })
         }
       });

     await controller.loadDrawerProjectPages('project-1', { query: '  alpha  ' });
     await Promise.resolve();

     expect(projectsStore.hydrate).toHaveBeenCalledTimes(1);
     expect(api.getSavedPages).toHaveBeenNthCalledWith(1, {
       limit: 100,
       sort: 'newest',
       pinnedFirst: false,
       projectId: 'project-1',
       cursor: null,
       skipCache: true
     });
     expect(api.getSavedPages).toHaveBeenNthCalledWith(2, {
       limit: 100,
       sort: 'newest',
       pinnedFirst: false,
       projectId: 'project-1',
       cursor: 'cursor-2',
       skipCache: true
     });
     expect(dependencies.renderDrawerLoadingState).toHaveBeenCalledWith('Searching project pages...');
     expect(applyDrawerFilters).toHaveBeenCalledWith('alpha');
     expect(state.allPages.map(page => page.id)).toEqual(['page-1', 'page-2', 'page-3']);
     expect(state.pages.map(page => page.id)).toEqual(['page-1', 'page-2', 'page-3']);
     expect(state.total).toBe(3);
     expect(state.allItemsTotal).toBe(3);
     expect(state.hasInitialized).toBe(true);
     expect(dependencies.syncProjectsStateFromStore).toHaveBeenCalled();
   });

   it('rolls back optimistic pin updates when the API request fails', async () => {
     const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
     const { controller, state, api, savedPagesView, dependencies } = createDrawerDataHarness({
       state: {
         pages: [{ id: 'page-1', pinned: false }],
         allPages: [{ id: 'page-1', pinned: false }]
       },
       api: {
         pinPage: vi.fn().mockRejectedValue(new Error('pin failed'))
       }
     });

     await controller.handleDrawerPin('page-1');

     expect(api.pinPage).toHaveBeenCalledWith('page-1', true);
     expect(savedPagesView.persistAllPages).toHaveBeenCalledTimes(2);
     expect(dependencies.renderDrawerResults).toHaveBeenCalledTimes(2);
     expect(state.allPages[0].pinned).toBe(false);
     expect(state.pages[0].pinned).toBe(false);
     expect(dependencies.windowObj.alert).toHaveBeenCalledWith(
       'Failed to update pin status. Please try again.'
     );

     consoleErrorSpy.mockRestore();
   });
  });

  describe('applyAuthUI', () => {
    it('updates compact auth chrome for signed-in users', () => {
      const signInBtn = {
        classList: {
          add: vi.fn(),
          remove: vi.fn()
        }
      };
      const AuthMenu = {
        updateCompactMenu: vi.fn()
      };
      const user = { email: 'test@example.com' };

      applyAuthUI(user, {
        AuthMenu,
        menuRoot: {},
        avatarEl: {},
        userEmailEl: {},
        signInBtn
      });

      expect(AuthMenu.updateCompactMenu).toHaveBeenCalled();
      expect(signInBtn.classList.add).toHaveBeenCalledWith('hidden');
    });

    it('shows the sign-in button for signed-out users', () => {
      const signInBtn = {
        classList: {
          add: vi.fn(),
          remove: vi.fn()
        }
      };

      applyAuthUI(null, {
        AuthMenu: { updateCompactMenu: vi.fn() },
        menuRoot: {},
        avatarEl: {},
        userEmailEl: {},
        signInBtn
      });

      expect(signInBtn.classList.remove).toHaveBeenCalledWith('hidden');
    });
  });

  describe('getUserFacingSignInErrorMessage', () => {
    it('returns a standalone message when runtime is unavailable', () => {
      expect(getUserFacingSignInErrorMessage(new Error('Browser runtime not available'))).toBe(
        'Sign in is only available when running as a browser extension.'
      );
    });

    it('returns the generic message for other sign-in failures', () => {
      expect(getUserFacingSignInErrorMessage(new Error('Popup closed'))).toBe(
        'Failed to sign in. Please try again.'
      );
    });
  });
});

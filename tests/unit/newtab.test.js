import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  applyDrawerFilters as applySavedPagesDrawerFilters,
  getDrawerSearchableText,
  syncDrawerStateFromStore as syncSavedPagesDrawerStateFromStore
} from '../../src/newtab-drawer-state.js';
import {
  createDrawerShellController,
  getSavedPagesDrawerUrl,
  shouldOpenDrawerCardInNewTab
} from '../../src/newtab-drawer-shell.js';
import {
  createDrawerUiController,
  getDrawerProjectScopeLabel
} from '../../src/newtab-drawer-ui.js';
import {
  bindNewtabEventHandlers,
  getNewtabElements,
  getSubmittedSearchQuery,
  startNewtabPage
} from '../../src/newtab-page.js';
import {
  getDrawerEmptyStateContent,
  renderDrawerCardMarkup
} from '../../src/newtab-drawer-renderer.js';
import { createDrawerDataController } from '../../src/newtab-drawer-data.js';
import { createSavedPagesView } from '../../src/newtab-drawer-view.js';
import { getInitialDrawerUrlState } from '../../src/newtab-drawer-events.js';
import { shouldSyncDrawerStoreUpdate } from '../../src/newtab-drawer-sync.js';
import {
  applyAuthUI,
  getUserFacingSignInErrorMessage
} from '../../src/newtab-auth.js';
import {
  createFavoritesController,
  getFavoritesLayout
} from '../../src/newtab-favorites.js';
import {
  createBookmarkIconElement,
  getFaviconUrl,
  updateStatsDisplay
} from '../../src/newtab-shared.js';
import {
  createProjectsStore,
  createSavedPagesStore
} from '../../src/newtab-drawer.js';

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

  describe('createBookmarkIconElement', () => {
    it('creates the bookmark fallback svg without HTML injection', () => {
      const icon = createBookmarkIconElement(document);

      expect(icon.tagName.toLowerCase()).toBe('svg');
      expect(icon.getAttribute('viewBox')).toBe('0 0 24 24');
      expect(icon.querySelector('path')?.getAttribute('d')).toBe('M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z');
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

    describe('newtab page helpers', () => {
      it('returns trimmed submitted search queries', () => {
        expect(getSubmittedSearchQuery({ value: '  alpha  ' })).toBe('alpha');
        expect(getSubmittedSearchQuery(null)).toBe('');
      });

      it('collects newtab DOM elements by their expected ids', () => {
        document.body.innerHTML = `
          <form id="search-form"></form>
          <input id="search-input">
          <button id="hero-sign-in-btn"></button>
          <div id="favorites-section"></div>
          <div id="hero-version-indicator"></div>
        `;

        const elements = getNewtabElements(document);

        expect(elements.searchForm?.id).toBe('search-form');
        expect(elements.searchInput?.id).toBe('search-input');
        expect(elements.signInBtn?.id).toBe('hero-sign-in-btn');
        expect(elements.favoritesSection?.id).toBe('favorites-section');
        expect(elements.versionIndicator?.id).toBe('hero-version-indicator');
      });

      it('binds search and auth event handlers', () => {
        document.body.innerHTML = `
          <form id="search-form"></form>
          <input id="search-input" value="  alpha  ">
          <button id="hero-sign-in-btn"></button>
          <button id="hero-user-avatar-btn"></button>
          <button id="hero-sign-out-btn"></button>
        `;
        const elements = getNewtabElements(document);
        const drawerController = { open: vi.fn() };
        const authController = {
          handleSignIn: vi.fn(),
          handleSignOut: vi.fn(),
          hideDropdownForOutsideClick: vi.fn(),
          toggleUserDropdown: vi.fn()
        };

        bindNewtabEventHandlers({
          elements,
          authController,
          drawerController,
          documentObj: document
        });

        elements.searchForm.dispatchEvent(new Event('submit'));
        elements.signInBtn.click();
        elements.userAvatarBtn.click();
        elements.signOutBtn.click();
        document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        expect(drawerController.open).toHaveBeenCalledWith({ searchQuery: 'alpha' });
        expect(authController.handleSignIn).toHaveBeenCalled();
        expect(authController.toggleUserDropdown).toHaveBeenCalled();
        expect(authController.handleSignOut).toHaveBeenCalled();
        expect(authController.hideDropdownForOutsideClick).toHaveBeenCalledWith(document.body);
      });

      it('starts the page by initializing controllers and chrome', async () => {
        const ThemeManager = { init: vi.fn() };
        const updateVersionIndicator = vi.fn();
        const favoritesController = {
          init: vi.fn(),
          load: vi.fn()
        };
        const drawerController = {
          init: vi.fn(),
          loadSummary: vi.fn()
        };
        const authController = {
          init: vi.fn().mockResolvedValue(undefined)
        };

        await startNewtabPage({
          ThemeManager,
          versionNumberEl: { id: 'version' },
          updateVersionIndicator,
          favoritesController,
          drawerController,
          authController
        });

        expect(ThemeManager.init).toHaveBeenCalledWith('hero-theme-toggle-container');
        expect(updateVersionIndicator).toHaveBeenCalledWith({ id: 'version' });
        expect(favoritesController.init).toHaveBeenCalled();
        expect(drawerController.init).toHaveBeenCalled();
        expect(favoritesController.load).toHaveBeenCalled();
        expect(drawerController.loadSummary).toHaveBeenCalled();
        expect(authController.init).toHaveBeenCalled();
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

  describe('favorites controller', () => {
    it('renders the bookmark fallback icon and hover preview content', () => {
      document.body.innerHTML = `
        <section id="favorites-section">
          <div id="favorites-viewport"></div>
          <div id="favorites-row"></div>
          <button id="favorites-prev-btn"></button>
          <button id="favorites-next-btn"></button>
          <div id="favorites-dots"></div>
          <div id="favorite-hover-connector" class="hidden"></div>
          <div id="favorite-hover-card" class="hidden"></div>
        </section>
      `;

      const snapshot = {
        pagedPages: [[{
          id: 'page-1',
          url: 'not-a-url',
          title: 'Example page',
          domain: 'example.com',
          ai_summary_brief: 'AI summary',
          manual_tags: ['alpha'],
          saved_at: '2026-05-20T00:00:00.000Z',
          pinned: true
        }]],
        currentPage: 0,
        pageSize: 12,
        columns: 6,
        rows: 2,
        tileWidth: 88,
        gridWidth: 600
      };
      const store = {
        getSnapshot: vi.fn(() => snapshot),
        subscribe: vi.fn(),
        applyLayout: vi.fn(),
        goToPage: vi.fn()
      };
      const controller = createFavoritesController({
        store,
        elements: {
          favoritesSection: document.getElementById('favorites-section'),
          favoritesViewport: document.getElementById('favorites-viewport'),
          favoritesRow: document.getElementById('favorites-row'),
          favoritesPrevBtn: document.getElementById('favorites-prev-btn'),
          favoritesNextBtn: document.getElementById('favorites-next-btn'),
          favoritesDots: document.getElementById('favorites-dots'),
          favoriteHoverConnector: document.getElementById('favorite-hover-connector'),
          favoriteHoverCard: document.getElementById('favorite-hover-card')
        },
        windowObj: window,
        documentObj: document
      });

      const favoritesSection = document.getElementById('favorites-section');
      const favoriteHoverCard = document.getElementById('favorite-hover-card');

      favoritesSection.getBoundingClientRect = () => ({
        left: 0, top: 0, right: 800, bottom: 400, width: 800, height: 400
      });
      favoriteHoverCard.getBoundingClientRect = () => ({
        left: 160, top: 40, right: 520, bottom: 200, width: 360, height: 160
      });

      controller.init();

      const favoriteItem = document.querySelector('.favorite-item');
      favoriteItem.getBoundingClientRect = () => ({
        left: 20, top: 20, right: 108, bottom: 108, width: 88, height: 88
      });
      favoriteItem.dispatchEvent(new Event('mouseenter'));

      expect(document.querySelector('.favorite-icon svg')).not.toBeNull();
      expect(favoriteHoverCard.querySelector('.favorite-hover-card-title')?.textContent).toBe('Example page');
      expect(favoriteHoverCard.querySelector('.favorite-hover-card-summary')?.textContent).toContain('AI summary');
      expect(favoriteHoverCard.querySelector('.favorite-hover-card-meta')?.textContent).toContain('Pinned');
    });
  });

  describe('drawer store factories', () => {
    it('creates a saved pages store with drawer cache scope defaults', () => {
      const store = createSavedPagesStore({});

      expect(store.options.initialFetchLimit).toBe(50);
      expect(store.options.prefetchBatchLimit).toBe(100);
      expect(store.options.warmCacheScope).toEqual({
        surface: 'saved-pages-drawer',
        sort: 'newest',
        pinnedFirst: false,
        limit: 'all'
      });
      expect(store.buildInitialFetchOptions()).toEqual({
        limit: 50,
        sort: 'newest',
        pinnedFirst: false
      });
    });

    it('creates a projects store with the projects warm cache scope', () => {
      const store = createProjectsStore({});

      expect(store.options.warmCacheScope).toEqual({
        surface: 'projects'
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

  describe('drawer state helpers', () => {
    it('filters pages within the selected project scope', () => {
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
      const savedPagesView = {
        get selectedProjectId() {
          return state.selectedProjectId;
        }
      };

      applySavedPagesDrawerFilters({
        state,
        projectManager,
        savedPagesView,
        query: 'alpha'
      });

      expect(projectManager.getScopedPages).toHaveBeenCalled();
      expect(state.currentFilter.search).toBe('alpha');
      expect(state.total).toBe(2);
      expect(state.pages.map(page => page.id)).toEqual(['page-1']);
    });

    it('syncs store snapshots into drawer state and triggers a render', () => {
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
        hasInitialized: true
      };
      const applyDrawerFilters = vi.fn(query => {
        state.query = query;
        state.pages = [...state.allPages];
      });
      const renderDrawerResults = vi.fn();
      const projectManager = {
        refreshProjectCounts: vi.fn()
      };

      syncSavedPagesDrawerStateFromStore({
        snapshot: {
          allPages: [{ id: 'page-1' }, { id: 'page-2' }],
          total: 12
        },
        state,
        savedPagesView: {},
        projectManager,
        applyDrawerFilters,
        renderDrawerResults,
        query: 'alpha',
        render: true
      });

      expect(state.allPages.map(page => page.id)).toEqual(['page-1', 'page-2']);
      expect(state.total).toBe(12);
      expect(state.allItemsTotal).toBe(12);
      expect(projectManager.refreshProjectCounts).toHaveBeenCalled();
      expect(applyDrawerFilters).toHaveBeenCalledWith('alpha');
      expect(renderDrawerResults).toHaveBeenCalled();
    });
  });

  describe('drawer shell helpers', () => {
    it('builds a drawer URL with search when the drawer is open', () => {
      expect(
        getSavedPagesDrawerUrl('https://example.com/newtab.html?foo=bar', {
          isOpen: true,
          searchQuery: '  alpha  '
        }).toString()
      ).toBe('https://example.com/newtab.html?foo=bar&drawer=saved-pages&search=alpha');
    });

    it('detects new-tab navigation gestures for drawer cards', () => {
      expect(shouldOpenDrawerCardInNewTab({ metaKey: true })).toBe(true);
      expect(shouldOpenDrawerCardInNewTab({ ctrlKey: true })).toBe(true);
      expect(shouldOpenDrawerCardInNewTab({ button: 1 })).toBe(true);
      expect(shouldOpenDrawerCardInNewTab({})).toBe(false);
    });

    it('opens the drawer and triggers the initial base-page load', async () => {
      document.body.innerHTML = `
        <button id="toggle"></button>
        <div id="drawer" class="hidden"></div>
        <input id="search">
        <button id="clear" class="hidden"></button>
      `;
      const savedPagesToggleBtn = document.getElementById('toggle');
      const savedPagesDrawer = document.getElementById('drawer');
      const savedPagesDrawerSearchInput = document.getElementById('search');
      const savedPagesDrawerClearBtn = document.getElementById('clear');
      const state = {
        hasInitialized: false,
        query: ''
      };
      const dataController = {
        loadDrawerBasePages: vi.fn().mockResolvedValue(undefined),
        loadDrawerResults: vi.fn().mockResolvedValue(undefined)
      };
      const windowObj = {
        location: {
          href: 'https://example.com/newtab.html'
        },
        history: {
          replaceState: vi.fn()
        },
        open: vi.fn()
      };

      const shellController = createDrawerShellController({
        state,
        savedPagesToggleBtn,
        savedPagesDrawer,
        savedPagesDrawerSearchInput,
        savedPagesDrawerClearBtn,
        getDataController: () => dataController,
        renderDrawerResults: vi.fn(),
        windowObj,
        documentObj: document
      });

      shellController.openSavedPagesDrawer({ searchQuery: 'alpha' });
      await Promise.resolve();

      expect(savedPagesDrawer.classList.contains('hidden')).toBe(false);
      expect(savedPagesDrawer.getAttribute('aria-hidden')).toBe('false');
      expect(document.body.classList.contains('saved-pages-drawer-open')).toBe(true);
      expect(savedPagesToggleBtn.getAttribute('aria-expanded')).toBe('true');
      expect(savedPagesDrawerSearchInput.value).toBe('alpha');
      expect(savedPagesDrawerClearBtn.classList.contains('hidden')).toBe(false);
      expect(dataController.loadDrawerBasePages).toHaveBeenCalledWith({
        query: 'alpha',
        syncUrl: false
      });
      expect(windowObj.history.replaceState).toHaveBeenCalled();
    });
  });

  describe('drawer UI helpers', () => {
    it('uses the selected project name as the drawer scope label', () => {
      const projectManager = {
        getSelectedProject: vi.fn(() => ({ id: 'project-1', name: 'Reading List' }))
      };

      expect(getDrawerProjectScopeLabel(projectManager, { selectedProjectId: 'project-1' })).toBe('Reading List');
    });

    it('renders the empty state when there are no pages', () => {
      document.body.innerHTML = '<div id="results"></div>';
      const resultsContainer = document.getElementById('results');
      const state = {
        query: '',
        pages: [],
        selectedProjectId: null
      };
      const savedPagesView = {
        projectsAvailable: true
      };
      const projectManager = {
        getSelectedProject: vi.fn(() => null),
        getProjectPills: vi.fn(() => []),
        renderSidebar: vi.fn(),
        renderEditor: vi.fn()
      };
      const uiController = createDrawerUiController({
        state,
        projectManager,
        resultsContainer,
        getSavedPagesView: () => savedPagesView,
        documentObj: document
      });

      uiController.renderResults();

      expect(resultsContainer.textContent).toContain('No pages in All saved items');
      expect(projectManager.renderSidebar).toHaveBeenCalled();
      expect(projectManager.renderEditor).toHaveBeenCalled();
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

  describe('drawer view helpers', () => {
   function createDrawerViewHarness(overrides = {}) {
     const state = {
       hasInitialized: false,
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
       ...(overrides.state || {})
     };
     const savedPagesStore = {
       setPages: vi.fn().mockResolvedValue(undefined),
       getSnapshot: vi.fn(() => ({ allPages: [{ id: 'page-1' }], total: 1 })),
       ...(overrides.savedPagesStore || {})
     };
     const projectsStore = {
       setProjects: vi.fn().mockResolvedValue(undefined),
       ...(overrides.projectsStore || {})
     };
     const dataController = {
       loadDrawerBasePages: vi.fn().mockResolvedValue(undefined),
       loadDrawerProjectPages: vi.fn().mockResolvedValue(undefined),
       ...(overrides.dataController || {})
     };
     const setSuppressSavedPagesStoreSync = vi.fn();
     const renderDrawerLoadingState = vi.fn();
     const syncDrawerStateFromStore = vi.fn();
     const applyDrawerFilters = vi.fn();
     const renderDrawerResults = vi.fn();
     const renderProjectSidebar = vi.fn();
     const refreshDrawerCard = vi.fn();

     return {
       state,
       savedPagesStore,
       projectsStore,
       dataController,
       setSuppressSavedPagesStoreSync,
       renderDrawerLoadingState,
       syncDrawerStateFromStore,
       applyDrawerFilters,
       renderDrawerResults,
       renderProjectSidebar,
       refreshDrawerCard,
       savedPagesView: createSavedPagesView({
         state,
         savedPagesStore,
         projectsStore,
         getCurrentUser: vi.fn(() => null),
         getDataController: () => dataController,
         setSuppressSavedPagesStoreSync,
         renderDrawerLoadingState,
         syncDrawerStateFromStore,
         applyDrawerFilters,
         renderDrawerResults,
         renderProjectSidebar,
         refreshDrawerCard
       })
     };
   }

   it('persists all pages with normalized pagination metadata', async () => {
     const {
       state,
       savedPagesStore,
       setSuppressSavedPagesStoreSync,
       savedPagesView
     } = createDrawerViewHarness({
       state: {
         allPages: [{ id: 'page-1' }, { id: 'page-2' }],
         total: null,
         allItemsTotal: null
       }
     });

     await savedPagesView.persistAllPages();

     expect(setSuppressSavedPagesStoreSync).toHaveBeenNthCalledWith(1, true);
     expect(savedPagesStore.setPages).toHaveBeenCalledWith(state.allPages, {
       total: 2,
       hasNextPage: false,
       nextCursor: null
     });
     expect(setSuppressSavedPagesStoreSync).toHaveBeenNthCalledWith(2, false);
   });

   it('routes project loads through the current data controller', async () => {
     const {
       savedPagesView,
       dataController
     } = createDrawerViewHarness({
       state: {
         hasInitialized: true,
         query: 'alpha',
         selectedProjectId: 'project-1'
       }
     });

     await savedPagesView.loadPages();

     expect(dataController.loadDrawerProjectPages).toHaveBeenCalledWith('project-1', {
       query: 'alpha',
       syncUrl: false
     });
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

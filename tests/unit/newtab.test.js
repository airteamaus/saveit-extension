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
  createDrawerRenderer,
  getDrawerEmptyStateContent,
  renderDrawerCardMarkup
} from '../../src/newtab-drawer-renderer.js';
import { createDrawerDataController } from '../../src/newtab-drawer-data.js';
import { createSavedPagesView } from '../../src/newtab-drawer-view.js';
import { getInitialDrawerUrlState } from '../../src/newtab-drawer-events.js';
import { shouldSyncDrawerStoreUpdate } from '../../src/newtab-drawer-sync.js';
import {
  applyAuthUI,
  createNewtabAuthController,
  getUserFacingSignInErrorMessage
} from '../../src/newtab-auth.js';
import {
  createBookmarkIconElement,
  getFaviconUrl,
  renderPageTags,
  updateStatsDisplay
} from '../../src/newtab-shared.js';
import {
  createProjectSavedPagesStore,
  createProjectsStore,
  createSavedPagesStore
} from '../../src/newtab-drawer.js';
import { getCurrentUser } from '../../src/session-store.js';

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

    it('does not render footer stats even when a numeric total is present', () => {
      updateStatsDisplay(versionIndicator, { total: 42 });

      expect(versionIndicator.querySelector('.footer-stats')).toBeNull();
    });

    it('removes any existing footer stats markup', () => {
      versionIndicator.innerHTML = '<span class="footer-stats">(7 things saved)</span>';
      updateStatsDisplay(versionIndicator, { total: 7 });

      expect(versionIndicator.querySelector('.footer-stats')).toBeNull();
    });
  });

  describe('renderPageTags', () => {
    const classifications = (entries) =>
      entries.map(([type, label, confidence]) => ({ type, label, confidence }));

    it('shows the two highest-confidence topic tags, ignoring broad ones', () => {
      const html = renderPageTags({
        classifications: classifications([
          ['general', 'Computer Science', 0.95],
          ['domain', 'Artificial Intelligence', 0.92],
          ['topic', 'Chain-of-Thought Prompting', 0.88],
          ['topic', 'Large Language Models', 0.90],
          ['topic', 'Model Training', 0.74]
        ])
      });

      expect(html).toContain('Large Language Models');
      expect(html).toContain('Chain-of-Thought Prompting');
      expect(html).not.toContain('Computer Science');
      expect(html).not.toContain('Artificial Intelligence');
      expect(html).not.toContain('Model Training');
    });

    it('falls back to a domain tag when only one topic is available', () => {
      const html = renderPageTags({
        classifications: classifications([
          ['general', 'Cooking', 0.95],
          ['domain', 'Baking', 0.90],
          ['topic', 'Sourdough Starter', 0.85]
        ])
      });

      expect(html).toContain('Sourdough Starter');
      expect(html).toContain('Baking');
      expect(html).not.toContain('Cooking');
    });

    it('renders the primary classification label when no classifications exist', () => {
      const html = renderPageTags({ primary_classification_label: 'Philosophy' });

      expect(html).toContain('Philosophy');
    });

    it('still appends one manual tag after the ai tags', () => {
      const html = renderPageTags({
        classifications: classifications([
          ['general', 'Travel', 0.95],
          ['topic', 'Motorcycle Touring', 0.88]
        ]),
        manual_tags: ['himalayas']
      });

      expect(html).toContain('Motorcycle Touring');
      expect(html).toContain('himalayas');
    });
  });

  describe('newtab page helpers', () => {
    it('returns trimmed submitted search queries', () => {
      expect(getSubmittedSearchQuery({ value: '  alpha  ' })).toBe('alpha');
      expect(getSubmittedSearchQuery(null)).toBe('');
    });

    it('collects newtab DOM elements by their expected ids', () => {
      document.body.innerHTML = `
        <section id="saved-pages-page-shell"></section>
        <div id="saved-pages-page-header"></div>
        <aside id="project-sidebar"></aside>
        <button id="saved-pages-sidebar-toggle-btn"></button>
        <div id="saved-pages-sidebar-backdrop"></div>
        <form id="search-form"></form>
        <input id="search-input">
        <button id="hero-sign-in-btn"></button>
        <div id="hero-version-indicator"></div>
      `;

      const elements = getNewtabElements(document);

      expect(elements.searchForm?.id).toBe('search-form');
      expect(elements.searchInput?.id).toBe('search-input');
      expect(elements.signInBtn?.id).toBe('hero-sign-in-btn');
      expect(elements.savedPagesPageShell?.id).toBe('saved-pages-page-shell');
      expect(elements.savedPagesPageHeader?.id).toBe('saved-pages-page-header');
      expect(elements.versionIndicator?.id).toBe('hero-version-indicator');
      expect(elements.projectSidebar?.id).toBe('project-sidebar');
      expect(elements.sidebarToggleBtn?.id).toBe('saved-pages-sidebar-toggle-btn');
      expect(elements.sidebarBackdrop?.id).toBe('saved-pages-sidebar-backdrop');
    });

      it('binds auth event handlers', () => {
        document.body.innerHTML = `
          <form id="search-form"></form>
          <input id="search-input" value="  alpha  ">
          <button id="hero-sign-in-btn"></button>
          <button id="hero-user-avatar-btn"></button>
          <button id="hero-sign-out-btn"></button>
        `;
        const elements = getNewtabElements(document);
        const authController = {
          handleSignIn: vi.fn(),
          handleSignOut: vi.fn(),
          hideDropdownForOutsideClick: vi.fn(),
          toggleUserDropdown: vi.fn()
        };

        bindNewtabEventHandlers({
          elements,
          authController,
          documentObj: document
        });

        elements.signInBtn.click();
        elements.userAvatarBtn.click();
        elements.signOutBtn.click();
        document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        expect(authController.handleSignIn).toHaveBeenCalled();
        expect(authController.toggleUserDropdown).toHaveBeenCalled();
        expect(authController.handleSignOut).toHaveBeenCalled();
        expect(authController.hideDropdownForOutsideClick).toHaveBeenCalledWith(document.body);
      });

      it('waits for auth init to resolve before loading saved pages', async () => {
        const ThemeManager = { init: vi.fn() };
        const updateVersionIndicator = vi.fn();
        let resolveAuthInit;
        const drawerController = {
          init: vi.fn(),
          load: vi.fn(),
          loadSummary: vi.fn(),
          preloadProjects: vi.fn(),
          showLoadingState: vi.fn()
        };
        const authController = {
          init: vi.fn(() => new Promise(resolve => {
            resolveAuthInit = resolve;
          }))
        };

        const startPromise = startNewtabPage({
          ThemeManager,
          versionNumberEl: { id: 'version' },
          updateVersionIndicator,
          drawerController,
          authController
        });

        await Promise.resolve();

        // Theme/version/init run immediately, but the drawer must NOT load or
        // paint a loading state before auth resolves. An eager loading state
        // here flashes on screen before the warm cache can render real content,
        // so startup must defer all rendering until load() runs.
        expect(ThemeManager.init).toHaveBeenCalledWith('hero-theme-toggle-container');
        expect(updateVersionIndicator).toHaveBeenCalledWith({ id: 'version' });
        expect(drawerController.init).toHaveBeenCalled();
        expect(drawerController.showLoadingState).not.toHaveBeenCalled();
        expect(drawerController.load).not.toHaveBeenCalled();
        expect(drawerController.preloadProjects).not.toHaveBeenCalled();
        expect(authController.init).toHaveBeenCalled();

        resolveAuthInit({ handledInitialState: true, user: { uid: 'user-1' } });
        await startPromise;

        // After auth resolves, load() is the single trigger for the first
        // fetch. It routes through loadDrawerBasePages, which gates on auth
        // and starts the projects load in the same pass — so preloadProjects
        // must not be called separately (that used to race auth on cold starts).
        expect(drawerController.load).toHaveBeenCalled();
        expect(drawerController.preloadProjects).not.toHaveBeenCalled();
      });

      it('still waits for auth init to settle before resolving startup', async () => {
        const ThemeManager = { init: vi.fn() };
        const updateVersionIndicator = vi.fn();
        const drawerController = {
          init: vi.fn(),
          load: vi.fn(),
          loadSummary: vi.fn(),
          preloadProjects: vi.fn(),
          showLoadingState: vi.fn()
        };
        const authController = {
          init: vi.fn().mockResolvedValue({ handledInitialState: true, user: { uid: 'user-1' } })
        };

        await startNewtabPage({
          ThemeManager,
          versionNumberEl: { id: 'version' },
          updateVersionIndicator,
          drawerController,
          authController
        });

        expect(drawerController.init).toHaveBeenCalled();
        expect(drawerController.showLoadingState).not.toHaveBeenCalled();
        expect(drawerController.preloadProjects).not.toHaveBeenCalled();
        expect(drawerController.load).toHaveBeenCalled();
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
        pinnedFirst: true,
        limit: 'all'
      });
      expect(store.buildInitialFetchOptions()).toEqual({
        limit: 50,
        sort: 'newest',
        pinnedFirst: true
      });
    });

    it('creates a projects store with the projects warm cache scope', () => {
      const store = createProjectsStore({});

      expect(store.options.warmCacheScope).toEqual({
        surface: 'projects'
      });
    });

    it('creates a project-scoped saved pages store with a matching warm cache scope', () => {
      const store = createProjectSavedPagesStore({}, 'project-1');

      expect(store.options.warmCacheScope).toEqual({
        surface: 'saved-pages-drawer',
        sort: 'newest',
        pinnedFirst: false,
        projectId: 'project-1',
        limit: 'all'
      });
      expect(store.buildInitialFetchOptions()).toEqual({
        limit: 100,
        sort: 'newest',
        pinnedFirst: false,
        projectId: 'project-1'
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

    it('treats the all-pages scope as unpinned pages only', () => {
      const state = {
        query: '',
        currentFilter: {
          search: '',
          projectId: null,
          cursor: null
        },
        selectedProjectId: null,
        allItemsTotal: 3,
        allPages: [
          { id: 'page-1', title: 'Pinned alpha', pinned: true },
          { id: 'page-2', title: 'Alpha note', pinned: false },
          { id: 'page-3', title: 'Beta note', pinned: false }
        ],
        pages: [],
        total: null
      };
      const projectManager = {
        getScopedPages: vi.fn((_dashboard, pages) => pages.filter(page => page.pinned !== true))
      };

      applySavedPagesDrawerFilters({
        state,
        projectManager,
        savedPagesView: {},
        query: ''
      });

      expect(state.total).toBe(2);
      expect(state.pages.map(page => page.id)).toEqual(['page-2', 'page-3']);
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
      ).toBe('https://example.com/newtab.html?foo=bar&search=alpha');
    });

    it('detects new-tab navigation gestures for drawer cards', () => {
      expect(shouldOpenDrawerCardInNewTab({ metaKey: true })).toBe(true);
      expect(shouldOpenDrawerCardInNewTab({ ctrlKey: true })).toBe(true);
      expect(shouldOpenDrawerCardInNewTab({ button: 1 })).toBe(true);
      expect(shouldOpenDrawerCardInNewTab({})).toBe(false);
    });

    it('opens the drawer and triggers the initial base-page load', async () => {
      document.body.innerHTML = `
        <div id="drawer"></div>
        <input id="search">
        <button id="clear" class="hidden"></button>
      `;
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

      expect(savedPagesDrawer.getAttribute('aria-hidden')).toBe('false');
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

      expect(resultsContainer.textContent).toContain('No pages in All pages');
      expect(projectManager.renderSidebar).toHaveBeenCalled();
      expect(projectManager.renderEditor).toHaveBeenCalled();
    });

    it('shows the digging dog instead of the empty state while a project is loading', () => {
      document.body.innerHTML = '<div id="results"></div>';
      const resultsContainer = document.getElementById('results');
      // Empty pages but still loading: a project always has at least one page,
      // so this means the API fetch is in flight, not a genuinely empty project.
      const state = {
        query: '',
        pages: [],
        selectedProjectId: 'project-1',
        isLoading: true
      };
      const savedPagesView = { projectsAvailable: true };
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

      // The loading dog owns the pane; the "no pages" empty state must not.
      const svg = resultsContainer.querySelector('svg.saved-pages-semantic-loading-image');
      expect(svg).not.toBeNull();
      expect(resultsContainer.textContent).not.toContain('No pages in');
    });

    it('renders the semantic loading video while a search is in flight', () => {
      document.body.innerHTML = '<div id="results"></div>';
      const resultsContainer = document.getElementById('results');
      const state = {
        query: 'JavaScript',
        pages: [{ id: 'page-1', title: 'Saved match', url: 'https://example.com' }],
        selectedProjectId: null,
        semanticResults: [],
        semanticQuery: 'JavaScript',
        semanticLoading: true
      };
      const savedPagesView = { projectsAvailable: true };
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

      // While semantic search loads, the dog takes over the full pane: no
      // saved-page cards and no pages/semantic sections, just the illustration.
      const pagesSection = resultsContainer.querySelector('[data-section="pages"]');
      expect(pagesSection).toBeNull();
      const cards = resultsContainer.querySelectorAll('.saved-pages-drawer-card');
      expect(cards.length).toBe(0);

      const svg = resultsContainer.querySelector('svg.saved-pages-semantic-loading-image');
      expect(svg).not.toBeNull();
      // Inlined SVG uses currentColor strokes, inheriting the theme color.
      expect(svg.querySelector('path')?.getAttribute('stroke')).toBe('currentColor');
      // Rendered in the full-pane variant.
      expect(svg.closest('.saved-pages-semantic-loading-pane')).not.toBeNull();
    });

    it('renders the semantic loading image even when no saved pages match the query', () => {
      document.body.innerHTML = '<div id="results"></div>';
      const resultsContainer = document.getElementById('results');
      const state = {
        query: 'zznomatch',
        pages: [],
        selectedProjectId: null,
        semanticResults: [],
        semanticQuery: 'zznomatch',
        semanticLoading: true
      };
      const savedPagesView = { projectsAvailable: true };
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

      // The loading dog owns the full pane even though state.pages is empty —
      // no empty-state branch replaces it.
      const svg = resultsContainer.querySelector('svg.saved-pages-semantic-loading-image');
      expect(svg).not.toBeNull();
      const cards = resultsContainer.querySelectorAll('.saved-pages-drawer-card');
      expect(cards.length).toBe(0);
    });
  });

  describe('drawer renderer helpers', () => {
    it('builds an empty-state message for project-scoped views', () => {
      expect(getDrawerEmptyStateContent({
        scopeLabel: 'Project Alpha',
        hasSelectedProject: true
      })).toEqual({
        title: 'No pages in Project Alpha',
        description: 'Pages you add to this project will appear here.'
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
          isOpen: true,
          searchQuery: 'alpha'
        });
      });
    });

    it('renders drawer card markup with project pills and actions', () => {
      const markup = renderDrawerCardMarkup({
        id: 'page-1',
        title: 'SaveIt',
        url: 'https://example.com/article',
        description: 'A useful page',
        pinned: true,
        manual_tags: ['machine learning']
      }, {
        getProjectPills: () => [{ id: 'project-1', name: 'Important' }],
        projectsUnavailable: false
      });

      expect(markup).toContain('saved-pages-drawer-card');
      expect(markup).toContain('data-page-id="page-1"');
      expect(markup).toContain('Important');
      expect(markup).toContain('data-action="pin"');
      expect(markup).toContain('saved-pages-drawer-projects-btn');
      expect(markup).toContain('data-action="projects"');
      expect(markup).toContain('tag-search-link');
      expect(markup).toContain('data-semantic-search-tag="machine learning"');
      expect(markup).toContain('data-action="delete"');
      expect(markup).toContain('data-action="edit"');
    });

    it('renders an inline edit form for the active editing card', () => {
      const markup = renderDrawerCardMarkup({
        id: 'page-1',
        title: 'SaveIt',
        description: 'Editable',
        url: 'https://example.com/article'
      }, {
        editingPageId: 'page-1',
        getProjectPills: () => [],
        projectsUnavailable: false
      });

      expect(markup).toContain('saved-pages-drawer-edit-form');
      expect(markup).toContain('name="title"');
      expect(markup).toContain('name="ai_summary_brief"');
      expect(markup).toContain('data-action="cancel-edit"');
    });

    it('prefers ai_summary_brief and falls back to the page description', () => {
      const summaryClass = 'saved-pages-drawer-card-summary';

      // AI summary wins when both are present
      const bothMarkup = renderDrawerCardMarkup({
        id: 'page-1',
        title: 'SaveIt',
        description: 'Page description',
        ai_summary_brief: 'AI-generated summary',
        url: 'https://example.com/article'
      }, {
        getProjectPills: () => [],
        projectsUnavailable: false
      });
      expect(bothMarkup).toContain(summaryClass);
      expect(bothMarkup).toContain('AI-generated summary');
      expect(bothMarkup).not.toContain('Page description');

      // Cleared AI summary (optimistic state right after save) falls back to description
      const clearedMarkup = renderDrawerCardMarkup({
        id: 'page-1',
        title: 'SaveIt',
        description: 'Page description',
        ai_summary_brief: '',
        url: 'https://example.com/article'
      }, {
        getProjectPills: () => [],
        projectsUnavailable: false
      });
      expect(clearedMarkup).toContain(summaryClass);
      expect(clearedMarkup).toContain('Page description');

      // Same after a reload: backend serializes a cleared AI summary as null
      const reloadedMarkup = renderDrawerCardMarkup({
        id: 'page-1',
        title: 'SaveIt',
        description: 'Page description',
        ai_summary_brief: null,
        url: 'https://example.com/article'
      }, {
        getProjectPills: () => [],
        projectsUnavailable: false
      });
      expect(reloadedMarkup).toContain(summaryClass);
      expect(reloadedMarkup).toContain('Page description');

      // Nothing to show when both are empty
      const emptyMarkup = renderDrawerCardMarkup({
        id: 'page-1',
        title: 'SaveIt',
        description: '',
        ai_summary_brief: null,
        url: 'https://example.com/article'
      }, {
        getProjectPills: () => [],
        projectsUnavailable: false
      });
      expect(emptyMarkup).not.toContain(summaryClass);
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
       loadedProjectPages: null,
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
      semanticResults: [],
      semanticQuery: '',
      semanticLoading: false,
      semanticRequestId: 0,
      warmUpInProgress: false,
      warmUpProgress: { percent: 0, indeterminate: true },
      warmUpLastPercent: 0,
      warmUpDeterminate: false,
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
       getLastKnownUserId: vi.fn().mockResolvedValue(null),
       updatePage: vi.fn(),
       ...(overrides.api || {})
     };
    const savedPagesStore = {
      getSnapshot: vi.fn(() => ({ allPages: [], total: 0 })),
      hydrate: vi.fn(),
      removePage: vi.fn(),
      reset: vi.fn(),
      options: { lazy: true },
      ...(overrides.savedPagesStore || {})
    };
     let projectStoreSnapshot = {
       allPages: [],
       total: 0
     };
     const projectSavedPagesStore = {
       getSnapshot: vi.fn(() => projectStoreSnapshot),
       hydrate: vi.fn(async () => projectStoreSnapshot),
       subscribe: vi.fn(() => () => {}),
       updatePage: vi.fn(async (id, updater) => {
         projectStoreSnapshot = {
           ...projectStoreSnapshot,
           allPages: projectStoreSnapshot.allPages.map(page => (
             page.id === id ? updater(page) : page
           ))
         };
       }),
       removePage: vi.fn(async id => {
         projectStoreSnapshot = {
           ...projectStoreSnapshot,
           allPages: projectStoreSnapshot.allPages.filter(page => page.id !== id)
         };
       }),
       reset: vi.fn(),
       ...(overrides.projectSavedPagesStore || {})
     };
     const createProjectSavedPagesStoreFn = overrides.createProjectSavedPagesStoreFn || vi.fn(() => projectSavedPagesStore);
     let domainStoreSnapshot = {
       allPages: [],
       total: 0
     };
     const domainSavedPagesStore = {
       getSnapshot: vi.fn(() => domainStoreSnapshot),
       hydrate: vi.fn(async () => domainStoreSnapshot),
       subscribe: vi.fn(() => () => {}),
       reset: vi.fn(),
       ...(overrides.domainSavedPagesStore || {})
     };
     const createDomainSavedPagesStoreFn = overrides.createDomainSavedPagesStoreFn || vi.fn(() => domainSavedPagesStore);
     const projectsStore = {
       hydrate: vi.fn().mockResolvedValue({ projects: [] }),
       ...(overrides.projectsStore || {})
     };
     const projectManager = {
       getScopedPages: vi.fn((dashboard, pages) => {
         if (!dashboard.selectedProjectId) {
           return [...pages];
         }

         if (dashboard.selectedProjectId === '__pinned__') {
           return pages.filter(page => page.pinned);
         }

         return pages.filter(page => page.project_ids?.includes(dashboard.selectedProjectId));
       }),
       refreshProjectCounts: vi.fn(),
       adjustProjectCount: vi.fn(),
       ...(overrides.projectManager || {})
     };
     const applyDrawerFilters = overrides.applyDrawerFilters || vi.fn((query = '') => {
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
       createProjectSavedPagesStoreFn,
      createDomainSavedPagesStoreFn,
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
       projectSavedPagesStore,
      domainSavedPagesStore,
       projectsStore,
       projectManager,
       savedPagesView,
       createProjectSavedPagesStoreFn,
      createDomainSavedPagesStoreFn,
       applyDrawerFilters,
       dependencies
     };
   }

   it('hydrates project pages from the scoped warm-cache store and applies the trimmed query', async () => {
     const projectSnapshot = {
       allPages: [
         { id: 'page-1', title: 'Alpha one', pinned: true, project_ids: ['project-1'] },
         { id: 'page-2', title: 'Alpha two', pinned: false, project_ids: ['project-1'] },
         { id: 'page-3', title: 'Alpha three', pinned: false, project_ids: ['project-1'] }
       ],
       total: 3
     };
     const {
       controller,
       state,
       api,
       projectSavedPagesStore,
       projectsStore,
       createProjectSavedPagesStoreFn,
       applyDrawerFilters,
       dependencies
     } =
       createDrawerDataHarness({
         state: {
           selectedProjectId: 'project-1',
           allPages: [
             { id: 'page-0', title: 'Pinned elsewhere', pinned: true, project_ids: [] }
           ],
           allItemsTotal: 4
         },
         projectSavedPagesStore: {
           getSnapshot: vi.fn(() => ({ allPages: [], total: 0 })),
           hydrate: vi.fn().mockResolvedValue(projectSnapshot),
           subscribe: vi.fn(() => () => {})
         },
         applyDrawerFilters: vi.fn(query => applySavedPagesDrawerFilters({
           state,
           projectManager: {
             getScopedPages: (dashboard, pages) => pages.filter(page => (
               page.project_ids?.includes(dashboard.selectedProjectId)
             ))
           },
           savedPagesView: {
             get selectedProjectId() {
               return state.selectedProjectId;
             }
           },
           query
         }))
       });

     await controller.loadDrawerProjectPages('project-1', { query: '  alpha  ' });
     await Promise.resolve();

     expect(projectsStore.hydrate).toHaveBeenCalledTimes(1);
     expect(createProjectSavedPagesStoreFn).toHaveBeenCalledWith(api, 'project-1', {
       initialFetchLimit: 100,
       prefetchBatchLimit: 100
     });
     expect(projectSavedPagesStore.hydrate).toHaveBeenCalledTimes(1);
     expect(api.getSavedPages).not.toHaveBeenCalled();
     expect(dependencies.renderDrawerLoadingState).toHaveBeenCalledWith('Searching project pages…');
     expect(applyDrawerFilters).toHaveBeenCalledWith('alpha');
     expect(state.allPages.map(page => page.id)).toEqual(['page-0', 'page-1', 'page-2', 'page-3']);
     expect(state.loadedProjectPages.map(page => page.id)).toEqual(['page-1', 'page-2', 'page-3']);
     expect(state.pages.map(page => page.id)).toEqual(['page-1', 'page-2', 'page-3']);
     expect(state.total).toBe(3);
     expect(state.allItemsTotal).toBe(4);
     expect(state.hasInitialized).toBe(true);
     expect(dependencies.syncProjectsStateFromStore).toHaveBeenCalled();
   });

   it('subscribes to project store refreshes and re-renders the selected project scope', async () => {
     let projectSnapshot = {
       allPages: [{ id: 'page-1', title: 'Cached alpha', project_ids: ['project-1'] }],
       total: 1
     };
     let onProjectStoreChange = null;
     const {
       controller,
       state,
       dependencies
     } = createDrawerDataHarness({
       state: {
         hasInitialized: true,
         selectedProjectId: 'project-1'
       },
       projectSavedPagesStore: {
         getSnapshot: vi.fn(() => projectSnapshot),
         hydrate: vi.fn(async () => projectSnapshot),
         subscribe: vi.fn(listener => {
           onProjectStoreChange = listener;
           return () => {};
         })
       },
       applyDrawerFilters: vi.fn(query => applySavedPagesDrawerFilters({
         state,
         projectManager: {
           getScopedPages: (dashboard, pages) => pages.filter(page => (
             page.project_ids?.includes(dashboard.selectedProjectId)
           ))
         },
         savedPagesView: {
           get selectedProjectId() {
             return state.selectedProjectId;
           }
         },
         query
       }))
     });

     await controller.loadDrawerProjectPages('project-1');
     projectSnapshot = {
       allPages: [
         { id: 'page-1', title: 'Cached alpha', project_ids: ['project-1'] },
         { id: 'page-2', title: 'Fresh beta', project_ids: ['project-1'] }
       ],
       total: 2
     };
     onProjectStoreChange();

     expect(state.loadedProjectPages.map(page => page.id)).toEqual(['page-1', 'page-2']);
     expect(state.pages.map(page => page.id)).toEqual(['page-1', 'page-2']);
     expect(dependencies.renderDrawerResults).toHaveBeenCalled();
   });

   it('hydrates domain pages through the merged loadDrawerScope path (parity with project)', async () => {
     const domainSnapshot = {
       allPages: [
         { id: 'd-1', title: 'Example one', domain: 'example.com' },
         { id: 'd-2', title: 'Example two', domain: 'example.com' }
       ],
       total: 2
     };
     const {
       controller,
       state,
       api,
       domainSavedPagesStore,
       createDomainSavedPagesStoreFn,
       dependencies
     } = createDrawerDataHarness({
       // Production stores the id WITH the "domain:" prefix; the loader
       // receives the bare domain. Mirror both halves of that contract.
       state: { selectedDomainId: 'domain:example.com' },
       domainSavedPagesStore: {
         getSnapshot: vi.fn(() => ({ allPages: [], total: 0 })),
         hydrate: vi.fn().mockResolvedValue(domainSnapshot),
         subscribe: vi.fn(() => () => {})
       },
       applyDrawerFilters: vi.fn(query => applySavedPagesDrawerFilters({
         state,
         projectManager: { getScopedPages: (dashboard, pages) => pages },
         savedPagesView: {},
         query
       }))
     });

     await controller.loadDrawerDomainPages('example.com', { query: '  ex  ' });
     await Promise.resolve();

     expect(createDomainSavedPagesStoreFn).toHaveBeenCalledWith(api, 'example.com', expect.objectContaining({
       initialFetchLimit: expect.any(Number),
       prefetchBatchLimit: expect.any(Number)
     }));
     expect(domainSavedPagesStore.hydrate).toHaveBeenCalledTimes(1);
     // Domain view does NOT side-load projects (loadProjectsAlongside: false).
     expect(state.projects).toEqual([]);
     expect(dependencies.renderDrawerLoadingState).toHaveBeenCalledWith('Searching pages from this domain…');
     expect(state.allPages.map(page => page.id)).toEqual(['d-1', 'd-2']);
     expect(state.loadedProjectPages.map(page => page.id)).toEqual(['d-1', 'd-2']);
     expect(state.hasInitialized).toBe(true);
   });

   it('loadDrawerScopeForCurrentSelection routes a domain selection to the domain store, not all-pages', async () => {
     // Regression: forceReload used to branch on project-vs-base only, so a
     // domain selection silently fell through to loadDrawerBasePages. The
     // merged scope picker must recognise selectedDomainId and hydrate the
     // domain store instead.
     const {
       controller,
       savedPagesStore,
       domainSavedPagesStore
     } = createDrawerDataHarness({
       // Stored WITH the "domain:" prefix (nav-row convention).
       state: { selectedDomainId: 'domain:example.com' },
       domainSavedPagesStore: {
         getSnapshot: vi.fn(() => ({ allPages: [], total: 0 })),
         hydrate: vi.fn().mockResolvedValue({ allPages: [{ id: 'd-1', domain: 'example.com' }], total: 1 }),
         subscribe: vi.fn(() => () => {})
       }
     });

     await controller.loadDrawerScopeForCurrentSelection({ syncUrl: false });
     await Promise.resolve();

     expect(domainSavedPagesStore.hydrate).toHaveBeenCalledTimes(1);
     // The all-pages store must NOT have been the one hydrated for this scope.
     expect(savedPagesStore.hydrate).not.toHaveBeenCalled();
   });

   it('loadDrawerScopeForCurrentSelection routes an all-pages selection to the base store', async () => {
     const {
       controller,
       savedPagesStore,
       domainSavedPagesStore
     } = createDrawerDataHarness({
       state: { selectedProjectId: null, selectedDomainId: null },
       savedPagesStore: {
         getSnapshot: vi.fn(() => ({ allPages: [], total: 0 })),
         hydrate: vi.fn().mockResolvedValue({ allPages: [{ id: 'a-1' }], total: 1 }),
         reset: vi.fn(),
         options: { lazy: true }
       }
     });

     await controller.loadDrawerScopeForCurrentSelection({ syncUrl: false });
     await Promise.resolve();

     expect(savedPagesStore.hydrate).toHaveBeenCalledTimes(1);
     expect(domainSavedPagesStore.hydrate).not.toHaveBeenCalled();
   });

   it('keeps pinned and all-pages sidebar counts tied to the canonical page collection when a project is selected', async () => {
     const { controller, state } = createDrawerDataHarness({
       state: {
         selectedProjectId: 'project-1',
         allPages: [
           { id: 'page-0', title: 'Pinned elsewhere', pinned: true, project_ids: [] }
         ],
         allItemsTotal: 4
       },
       projectSavedPagesStore: {
         getSnapshot: vi.fn(() => ({ allPages: [], total: 0 })),
         hydrate: vi.fn().mockResolvedValue({
           allPages: [
             { id: 'page-1', title: 'Alpha one', pinned: true, project_ids: ['project-1'] },
             { id: 'page-2', title: 'Alpha two', pinned: false, project_ids: ['project-1'] },
             { id: 'page-3', title: 'Alpha three', pinned: false, project_ids: ['project-1'] }
           ],
           total: 3
         }),
         subscribe: vi.fn(() => () => {})
       },
       applyDrawerFilters: vi.fn(query => applySavedPagesDrawerFilters({
         state,
         projectManager: {
           getScopedPages: (dashboard, pages) => {
             if (dashboard.selectedProjectId === '__pinned__') {
               return pages.filter(page => page.pinned);
             }

             if (!dashboard.selectedProjectId) {
               return [...pages];
             }

             return pages.filter(page => page.project_ids?.includes(dashboard.selectedProjectId));
           }
         },
         savedPagesView: {
           get selectedProjectId() {
             return state.selectedProjectId;
           }
         },
         query
       }))
     });

     await controller.loadDrawerProjectPages('project-1');

     expect(state.allPages.filter(page => page.pinned)).toHaveLength(2);
     expect(state.allItemsTotal).toBe(4);
     expect(state.total).toBe(3);
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

   it('hydrates saved pages from warm cache bootstrap before auth restoration completes', async () => {
     const snapshot = {
       allPages: [{ id: 'page-1', title: 'Cached page' }],
       total: 1
     };
     const { controller, savedPagesStore, dependencies } = createDrawerDataHarness({
       api: {
         isExtension: true,
         getLastKnownUserId: vi.fn().mockResolvedValue('user-1')
       },
       savedPagesStore: {
         getSnapshot: vi.fn(() => ({ allPages: [], total: 0 })),
         hydrate: vi.fn().mockResolvedValue(snapshot)
       }
     });

     await controller.loadDrawerBasePages();

     expect(savedPagesStore.hydrate).toHaveBeenCalled();
     expect(dependencies.renderDrawerSignInState).not.toHaveBeenCalled();
     expect(dependencies.syncDrawerStateFromStore).toHaveBeenCalledWith(snapshot, {
       query: '',
       render: false
     });
   });

   it('arms the warm-up phase (not the loading dog) when the store is in non-lazy prefetch mode', async () => {
     // Cold start: empty allPages, no renderable warm cache, and the store
     // flipped to non-lazy (post-login prefetch). The data controller sets
     // state.warmUpInProgress and routes through the dispatcher, which renders
     // the warming pane (never cards/empty/dog while a warm-up is in progress).
     const snapshot = {
       allPages: [{ id: 'page-1', title: 'Cached page' }],
       total: 1
     };
     const { controller, dependencies, state } = createDrawerDataHarness({
       api: {
         isExtension: true,
         getLastKnownUserId: vi.fn().mockResolvedValue('user-1')
       },
       savedPagesStore: {
         getSnapshot: vi.fn(() => ({ allPages: [], total: 0 })),
         hydrate: vi.fn().mockResolvedValue(snapshot),
         options: { lazy: false }
       }
     });

     await controller.loadDrawerBasePages();

     expect(state.warmUpInProgress).toBe(true);
     expect(state.warmUpProgress).toEqual({ percent: 0, indeterminate: true });
     expect(dependencies.renderDrawerResults).toHaveBeenCalled();
     expect(dependencies.renderDrawerLoadingState).not.toHaveBeenCalled();
   });

   it('still renders the loading dog on a cold start when the store is lazy', async () => {
     // Regression guard: the default (lazy) cold start keeps the original
     // renderDrawerLoadingState path. Only the non-lazy branch arms the
     // warm-up phase.
     const snapshot = {
       allPages: [{ id: 'page-1', title: 'Cached page' }],
       total: 1
     };
     const { controller, dependencies, state } = createDrawerDataHarness({
       api: {
         isExtension: true,
         getLastKnownUserId: vi.fn().mockResolvedValue('user-1')
       },
       savedPagesStore: {
         getSnapshot: vi.fn(() => ({ allPages: [], total: 0 })),
         hydrate: vi.fn().mockResolvedValue(snapshot),
         options: { lazy: true }
       }
     });

     await controller.loadDrawerBasePages();

     expect(dependencies.renderDrawerLoadingState).toHaveBeenCalledWith('Gathering your saved pages…');
     expect(state.warmUpInProgress).toBe(false);
   });

   it('updates page title and summary inline and re-applies filters', async () => {
     const { controller, state, api, savedPagesView, applyDrawerFilters, dependencies } = createDrawerDataHarness({
       state: {
         query: 'alpha',
         editingPageId: 'page-1',
         pages: [{ id: 'page-1', title: 'Alpha', ai_summary_brief: 'Before', pinned: false }],
         allPages: [{ id: 'page-1', title: 'Alpha', ai_summary_brief: 'Before', pinned: false }]
       },
       api: {
         updatePage: vi.fn().mockResolvedValue({ updated_at: '2026-05-26T00:00:00.000Z' })
       }
     });

     await controller.handleDrawerUpdate('page-1', {
       title: 'Alpha edited',
       ai_summary_brief: 'After'
     });

     expect(api.updatePage).toHaveBeenCalledWith('page-1', {
       title: 'Alpha edited',
       ai_summary_brief: 'After'
     });
     expect(savedPagesView.persistAllPages).toHaveBeenCalled();
     expect(applyDrawerFilters).toHaveBeenCalledWith('alpha');
     expect(dependencies.renderDrawerResults).toHaveBeenCalledTimes(2);
     expect(state.editingPageId).toBeNull();
     expect(state.savingEditPageId).toBeNull();
    expect(state.allPages[0]).toMatchObject({
      title: 'Alpha edited',
      ai_summary_brief: 'After'
    });
  });

  it('surfaces a toast (not a blocking alert) when notify is wired and a save fails validation', async () => {
    const notify = vi.fn();
    const { controller, dependencies } = createDrawerDataHarness({
      state: {
        editingPageId: 'page-1',
        pages: [{ id: 'page-1', title: 'Alpha', pinned: false }],
        allPages: [{ id: 'page-1', title: 'Alpha', pinned: false }]
      },
      dependencies: { notify }
    });

    // Empty title fails validation -> reportFailure -> notify (toast).
    await controller.handleDrawerUpdate('page-1', { title: '   ', ai_summary_brief: '' });

    expect(notify).toHaveBeenCalledWith('Title is required.', { type: 'error' });
    // The blocking alert must not fire when notify is provided.
    expect(dependencies.windowObj.alert).not.toHaveBeenCalled();
  });

  describe('render windowing', () => {
    function makePages(count) {
      return Array.from({ length: count }, (_, i) => ({
        id: `page-${i + 1}`,
        title: `Page ${i + 1}`,
        url: `https://example.com/${i + 1}`
      }));
    }

    function makeRenderer({ renderLimit }) {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const renderer = createDrawerRenderer({
        documentObj: document,
        resultsContainer: container,
        getRenderLimit: () => renderLimit,
        renderChrome: () => {},
        getProjectPills: () => [],
        isProjectsUnavailable: () => false,
        getProjectScopeLabel: () => 'All pages'
      });
      return { container, renderer, setRenderLimit: v => { renderLimit = v; } };
    }

    it('renders only the first renderLimit cards', () => {
      const { container, renderer } = makeRenderer({ renderLimit: 10 });
      renderer.renderResults(makePages(150));

      expect(container.querySelectorAll('.saved-pages-drawer-card')).toHaveLength(10);
    });

    it('grows the rendered window when renderLimit increases, reusing existing nodes', () => {
      let renderLimit = 10;
      const { container, renderer, setRenderLimit } = makeRenderer({ renderLimit });
      renderer.renderResults(makePages(150));
      const firstCardBefore = container.querySelector('.saved-pages-drawer-card');

      setRenderLimit(110);
      renderer.renderResults(makePages(150));

      expect(container.querySelectorAll('.saved-pages-drawer-card')).toHaveLength(110);
      // Keyed reconciliation reuses the first node rather than rebuilding it.
      expect(container.querySelector('.saved-pages-drawer-card')).toBe(firstCardBefore);
    });

    it('renders all pages when renderLimit is at or beyond the count', () => {
      const { container, renderer } = makeRenderer({ renderLimit: 1000 });
      renderer.renderResults(makePages(25));

      expect(container.querySelectorAll('.saved-pages-drawer-card')).toHaveLength(25);
    });
  });

  describe('handleDrawerScrollNearEnd', () => {
    function pages(count) {
      return Array.from({ length: count }, (_, i) => ({
        id: `page-${i + 1}`,
        title: `Page ${i + 1}`,
        url: `https://example.com/${i + 1}`
      }));
    }

    it('grows the render window and does not fetch when there is in-memory coverage', async () => {
      const loadMore = vi.fn(async () => ({ status: 'updated' }));
      const { controller, state, savedPagesStore, dependencies } = createDrawerDataHarness({
        state: {
          hasInitialized: true,
          renderLimit: 10,
          allPages: pages(150),
          pages: pages(150)
        },
        savedPagesStore: {
          getSnapshot: vi.fn(() => ({
            allPages: pages(150),
            total: 150,
            hasNextPage: true,
            isLoadingMore: false
          })),
          loadMore
        }
      });

      await controller.handleDrawerScrollNearEnd();

      expect(state.renderLimit).toBe(110);
      // We still have in-memory pages beyond the window, so no fetch yet.
      expect(loadMore).not.toHaveBeenCalled();
      expect(dependencies.renderDrawerResults).toHaveBeenCalled();
    });

    it('calls loadMore once the render window passes in-memory coverage', async () => {
      const loadMore = vi.fn(async () => ({ status: 'updated' }));
      const { controller, state, savedPagesStore } = createDrawerDataHarness({
        state: {
          hasInitialized: true,
          // Window already covers the 50 in-memory pages -> next scroll fetches.
          renderLimit: 110,
          allPages: pages(50),
          pages: pages(50)
        },
        savedPagesStore: {
          getSnapshot: vi.fn(() => ({
            allPages: pages(50),
            total: 200,
            hasNextPage: true,
            isLoadingMore: false
          })),
          loadMore
        }
      });

      await controller.handleDrawerScrollNearEnd();

      expect(loadMore).toHaveBeenCalledTimes(1);
      expect(state.renderLimit).toBe(110);
    });

    it('is a no-op for project/domain scopes', async () => {
      const loadMore = vi.fn(async () => ({ status: 'updated' }));
      const { controller, state } = createDrawerDataHarness({
        state: {
          hasInitialized: true,
          renderLimit: 10,
          selectedProjectId: 'project-1',
          allPages: pages(150),
          pages: pages(150)
        },
        savedPagesStore: { loadMore }
      });

      await controller.handleDrawerScrollNearEnd();

      // Scope guard returns before touching renderLimit or the store.
      expect(state.renderLimit).toBe(10);
      expect(loadMore).not.toHaveBeenCalled();
    });
  });

  describe('resetRenderLimit', () => {
    it('resets renderLimit to the initial value on a new query', async () => {
      const allPages = Array.from({ length: 150 }, (_, i) => ({
        id: `page-${i + 1}`,
        title: `Page ${i + 1}`,
        url: `https://example.com/${i + 1}`
      }));
      const { controller, state } = createDrawerDataHarness({
        state: {
          hasInitialized: true,
          renderLimit: 210,
          allPages,
          pages: [...allPages]
        }
      });

      await controller.loadDrawerResults('new query');

      expect(state.renderLimit).toBe(10);
    });
  });

  describe('loadSemanticResults', () => {
    it('clears semantic results for an empty query', async () => {
      const { controller, state, dependencies, api } = createDrawerDataHarness({
        state: { hasInitialized: true, semanticResults: [{ id: 'old' }], semanticLoading: true },
        api: { searchContent: vi.fn() }
      });

      await controller.loadSemanticResults('   ');

      expect(state.semanticResults).toEqual([]);
      expect(state.semanticQuery).toBe('');
      expect(state.semanticLoading).toBe(false);
      expect(api.searchContent).not.toHaveBeenCalled();
      expect(dependencies.renderDrawerResults).toHaveBeenCalled();
    });

    it('commits thing_data from the search response', async () => {
      const searchContent = vi.fn().mockResolvedValue({
        results: [
          { thing_id: 't1', similarity: 0.9, thing_data: { id: 't1', title: 'Alpha semantic' } },
          { thing_id: 't2', similarity: 0.8, thing_data: { id: 't2', title: 'Bravo semantic' } }
        ],
        pagination: { total: 2 }
      });
      const { controller, state, dependencies, api } = createDrawerDataHarness({
        state: { hasInitialized: true },
        api: { searchContent }
      });

      await controller.loadSemanticResults('machine learning');

      expect(api.searchContent).toHaveBeenCalledWith('machine learning', {
        limit: 20,
        offset: 0,
        threshold: 0.58
      });
      expect(state.semanticResults.map(page => page.id)).toEqual(['t1', 't2']);
      expect(state.semanticQuery).toBe('machine learning');
      expect(state.semanticLoading).toBe(false);
      // Loading state renders immediately, then again after completion.
      expect(dependencies.renderDrawerResults).toHaveBeenCalledTimes(2);
    });

    it('clears prior results when starting a new search so the loading state shows', async () => {
      // First search returns results.
      const searchContent = vi.fn()
        .mockResolvedValueOnce({
          results: [{ thing_data: { id: 'old', title: 'Old' } }],
          pagination: { total: 1 }
        })
        .mockImplementationOnce(() => new Promise(() => {})); // second never resolves
      const { controller, state } = createDrawerDataHarness({
        state: { hasInitialized: true },
        api: { searchContent }
      });

      await controller.loadSemanticResults('first');
      expect(state.semanticResults.map(page => page.id)).toEqual(['old']);

      // Second search starts; prior results must be cleared so the loading
      // state is visible (e.g. when clicking a tag from a results page).
      // The second search is left pending to assert the in-flight state.
      controller.loadSemanticResults('second');
      expect(state.semanticResults).toEqual([]);
      expect(state.semanticLoading).toBe(true);
    });

    it('drops a stale response when a newer query supersedes it', async () => {
      // First call never resolves; the second call should commit and the first
      // should be ignored on settle.
      let resolveFirst;
      const searchContent = vi.fn()
        .mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }))
        .mockResolvedValueOnce({
          results: [{ thing_data: { id: 'second', title: 'Second' } }],
          pagination: { total: 1 }
        });
      const { controller, state, api } = createDrawerDataHarness({
        state: { hasInitialized: true },
        api: { searchContent }
      });

      const first = controller.loadSemanticResults('first');
      const second = controller.loadSemanticResults('second');
      await second;
      resolveFirst({ results: [{ thing_data: { id: 'first', title: 'First' } }] });
      await first;

      expect(state.semanticResults.map(page => page.id)).toEqual(['second']);
      expect(api.searchContent).toHaveBeenCalledTimes(2);
    });

    it('clears results and does not throw when the API lacks searchContent', async () => {
      const { controller, state } = createDrawerDataHarness({
        state: { hasInitialized: true },
        api: {}
      });

      await controller.loadSemanticResults('anything');

      expect(state.semanticResults).toEqual([]);
      expect(state.semanticLoading).toBe(false);
    });

    it('recovers gracefully when the search call rejects', async () => {
      const searchContent = vi.fn().mockRejectedValue(new Error('boom'));
      const { controller, state } = createDrawerDataHarness({
        state: { hasInitialized: true },
        api: { searchContent }
      });

      await controller.loadSemanticResults('explode');

      expect(state.semanticResults).toEqual([]);
      expect(state.semanticLoading).toBe(false);
    });

    // Integration test wiring the real renderer to a real DOM container, so
    // interactions that the mock-renderer harness can't catch (section
    // lifecycle, orphan pruning, card scoping) are exercised end-to-end.
    it('renders and deletes a page through the real renderer without orphaning sections', async () => {
      document.body.innerHTML = '<div id="results"></div>';
      const resultsContainer = document.getElementById('results');

      const pages = [
        { id: 'page-1', title: 'Alpha', url: 'https://alpha.example', project_ids: [] },
        { id: 'page-2', title: 'Bravo', url: 'https://bravo.example', project_ids: [] }
      ];

      const savedPagesStore = {
        getSnapshot: vi.fn(() => ({ allPages: pages, total: pages.length })),
        removePage: vi.fn(async id => {
          const idx = pages.findIndex(p => p.id === id);
          if (idx >= 0) pages.splice(idx, 1);
          // Simulate the warm-cache store notifying its subscriber, which in
          // the real extension re-enters renderDrawerResults mid-delete.
          syncFromSnapshot();
        }),
        hydrate: vi.fn(),
        reset: vi.fn()
      };

      const projectManager = {
        getScopedPages: vi.fn((_, list) => list),
        refreshProjectCounts: vi.fn(),
        getProjectPills: vi.fn(() => []),
        renderSidebar: vi.fn(),
        renderEditor: vi.fn()
      };

      const state = {
        hasInitialized: true,
        query: '',
        currentFilter: { search: '', projectId: null, cursor: null },
        pages: [...pages],
        allPages: [...pages],
        loadedProjectPages: null,
        projects: [],
        selectedProjectId: null,
        total: pages.length,
        allItemsTotal: pages.length,
        requestId: 0,
        semanticResults: [],
        semanticQuery: '',
        semanticLoading: false,
        semanticRequestId: 0
      };
      const savedPagesView = { projectsAvailable: true, selectedProjectId: null, persistAllPages: vi.fn() };

      const uiController = createDrawerUiController({
        state,
        projectManager,
        resultsContainer,
        getSavedPagesView: () => savedPagesView,
        documentObj: document
      });

      const applyDrawerFilters = (query = state.query) => applySavedPagesDrawerFilters({
        state,
        projectManager,
        savedPagesView,
        query
      });

      const syncFromSnapshot = () => {
        state.allPages = [...pages];
        applyDrawerFilters(state.query);
        uiController.renderResults();
      };

      const controller = createDrawerDataController({
        api: { deletePage: vi.fn().mockResolvedValue({ ok: true }) },
        state,
        savedPagesStore,
        projectsStore: { hydrate: vi.fn().mockResolvedValue({ projects: [] }) },
        projectManager,
        savedPagesView,
        getCurrentUser: vi.fn(() => null),
        isDrawerOpen: vi.fn(() => false),
        setDrawerSearchValue: vi.fn(),
        updateDrawerUrl: vi.fn(),
        renderDrawerLoadingState: vi.fn(),
        renderDrawerErrorState: vi.fn(),
        renderDrawerSignInState: vi.fn(),
        renderDrawerResults: uiController.renderResults,
        syncDrawerStateFromStore: (snapshot, opts) => syncSavedPagesDrawerStateFromStore({
          snapshot, state, savedPagesView, projectManager, applyDrawerFilters, renderDrawerResults: uiController.renderResults, ...opts
        }),
        syncProjectsStateFromStore: vi.fn(),
        applyDrawerFilters,
        windowObj: { confirm: () => true, alert: vi.fn() }
      });

      // Initial render
      uiController.renderResults();
      expect(resultsContainer.querySelectorAll('.saved-pages-drawer-card')).toHaveLength(2);

      // Delete one page
      await controller.handleDrawerDelete('page-1');

      const cards = resultsContainer.querySelectorAll('.saved-pages-drawer-card');
      expect(cards).toHaveLength(1);
      expect(cards[0].dataset.pageId).toBe('page-2');
      // No orphaned state divs; only the pages section should remain.
      expect(Array.from(resultsContainer.children).map(c => c.getAttribute('data-section'))).toEqual(['pages']);
    });
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

  describe('createNewtabAuthController', () => {
    it('resolves init with the restored session from the session store', async () => {
      const user = { uid: 'user-1', email: 'test@example.com' };
      getCurrentUser.mockResolvedValue(user);
      const onSignedIn = vi.fn().mockResolvedValue(undefined);
      const onSignedOut = vi.fn().mockResolvedValue(undefined);
      const signInBtn = {
        classList: {
          add: vi.fn(),
          remove: vi.fn()
        }
      };
      const controller = createNewtabAuthController({
        API: {
          setLastKnownUser: vi.fn().mockResolvedValue(undefined),
          clearLastKnownUser: vi.fn().mockResolvedValue(undefined)
        },
        AuthMenu: {
          updateCompactMenu: vi.fn(),
          toggleDropdown: vi.fn(),
          hideDropdown: vi.fn(),
          signOut: vi.fn(),
          signIn: vi.fn()
        },
        elements: {
          signInBtn,
          userMenu: {},
          userAvatar: {},
          userDropdown: {},
          userEmailEl: {}
        },
        onSignedIn,
        onSignedOut,
        windowObj: {
          browser: { runtime: { id: 'x' } }
        }
      });

      await expect(controller.init()).resolves.toEqual({
        handledInitialState: true,
        user
      });
      expect(onSignedIn).toHaveBeenCalledWith(user);
      expect(onSignedOut).not.toHaveBeenCalled();
      expect(signInBtn.classList.add).toHaveBeenCalledWith('hidden');
    });
  });
});

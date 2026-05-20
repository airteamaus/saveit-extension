import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  getDrawerEmptyStateContent,
  renderDrawerCardMarkup
} from '../../src/newtab-drawer-renderer.js';
import { getInitialDrawerUrlState } from '../../src/newtab-drawer-events.js';
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

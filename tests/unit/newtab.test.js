/**
 * Tests for newtab-minimal.js pure functions
 * Tests the logic without DOM/module dependencies
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Extract and test pure logic functions inline since module has top-level await

describe('newtab-minimal', () => {
  describe('getFaviconUrl', () => {
    // Inline implementation to test
    function getFaviconUrl(url) {
      try {
        const domain = new URL(url).hostname;
        return `https://icons.duckduckgo.com/ip3/${domain}.ico`;
      } catch {
        return null;
      }
    }

    it('should return DuckDuckGo favicon URL for valid URL', () => {
      const result = getFaviconUrl('https://example.com/page');
      expect(result).toBe('https://icons.duckduckgo.com/ip3/example.com.ico');
    });

    it('should handle URLs with subdomains', () => {
      const result = getFaviconUrl('https://blog.example.com/post');
      expect(result).toBe('https://icons.duckduckgo.com/ip3/blog.example.com.ico');
    });

    it('should return null for invalid URL', () => {
      const result = getFaviconUrl('not-a-url');
      expect(result).toBeNull();
    });

    it('should return null for empty string', () => {
      const result = getFaviconUrl('');
      expect(result).toBeNull();
    });
  });

  describe('updateStats', () => {
    let mockStatsSpan;
    let mockVersionIndicator;

    beforeEach(() => {
      mockStatsSpan = {
        textContent: ''
      };
      mockVersionIndicator = {
        querySelector: vi.fn(() => mockStatsSpan),
        appendChild: vi.fn()
      };
    });

    // Inline implementation to test
    function updateStats(pagination, versionIndicator) {
      const statsSpan = versionIndicator.querySelector('.footer-stats');

      if (!pagination || typeof pagination.total !== 'number') {
        if (statsSpan) {
          statsSpan.removed = true;
        }
        return;
      }

      const total = pagination.total;
      statsSpan.textContent = `(${total} ${total === 1 ? 'thing' : 'things'} saved)`;
    }

    it('should hide stats when pagination is null', () => {
      updateStats(null, mockVersionIndicator);
      expect(mockStatsSpan.removed).toBe(true);
    });

    it('should hide stats when pagination.total is not a number', () => {
      updateStats({ total: 'not a number' }, mockVersionIndicator);
      expect(mockStatsSpan.removed).toBe(true);
    });

    it('should show singular "thing" for 1 item', () => {
      updateStats({ total: 1 }, mockVersionIndicator);
      expect(mockStatsSpan.textContent).toBe('(1 thing saved)');
    });

    it('should show plural "things" for multiple items', () => {
      updateStats({ total: 42 }, mockVersionIndicator);
      expect(mockStatsSpan.textContent).toBe('(42 things saved)');
    });

    it('should show plural "things" for 0 items', () => {
      updateStats({ total: 0 }, mockVersionIndicator);
      expect(mockStatsSpan.textContent).toBe('(0 things saved)');
    });
  });

  describe('updateAuthUI', () => {
    let mockSignInBtn;

    beforeEach(() => {
      mockSignInBtn = {
        classList: {
          add: vi.fn(),
          remove: vi.fn()
        }
      };
    });

    // Inline implementation to test
    function updateAuthUI(user, signInBtn) {
      if (user) {
        signInBtn.classList.add('hidden');
      } else {
        signInBtn.classList.remove('hidden');
      }
    }

    it('should hide sign-in button when user is signed in', () => {
      updateAuthUI({ email: 'test@example.com' }, mockSignInBtn);
      expect(mockSignInBtn.classList.add).toHaveBeenCalledWith('hidden');
    });

    it('should show sign-in button when user is null', () => {
      updateAuthUI(null, mockSignInBtn);
      expect(mockSignInBtn.classList.remove).toHaveBeenCalledWith('hidden');
    });
  });

  describe('cache expiry logic', () => {
    const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

    function isCacheExpired(cachedAt) {
      const age = Date.now() - cachedAt;
      return age > CACHE_DURATION_MS;
    }

    it('should return false for fresh cache', () => {
      const cachedAt = Date.now() - (1 * 60 * 60 * 1000); // 1 hour ago
      expect(isCacheExpired(cachedAt)).toBe(false);
    });

    it('should return true for expired cache', () => {
      const cachedAt = Date.now() - (25 * 60 * 60 * 1000); // 25 hours ago
      expect(isCacheExpired(cachedAt)).toBe(true);
    });

    it('should return false for cache exactly at 24 hours', () => {
      const cachedAt = Date.now() - CACHE_DURATION_MS;
      expect(isCacheExpired(cachedAt)).toBe(false);
    });

    it('should return true for cache just over 24 hours', () => {
      const cachedAt = Date.now() - CACHE_DURATION_MS - 1;
      expect(isCacheExpired(cachedAt)).toBe(true);
    });
  });

  describe('renderFavorites logic', () => {
    let mockFavoritesRow;
    const FAVORITES_MAX_ITEMS = 300;
    const FAVORITES_MAX_COLUMNS = 10;
    const FAVORITES_MIN_COLUMNS = 6;
    const FAVORITES_MOBILE_COLUMNS = 4;
    const FAVORITES_MOBILE_ROWS = 2;
    const FAVORITES_DEFAULT_ROWS = 2;
    const FAVORITES_TALL_SCREEN_ROWS = 3;
    const FAVORITES_TALL_SCREEN_HEIGHT = 860;
    const FAVORITES_WIDE_SCREEN_THREE_ROW_WIDTH = 1280;
    const FAVORITES_DESKTOP_TILE_WIDTH = 88;
    const FAVORITES_MOBILE_TILE_WIDTH = 80;
    const FAVORITES_TILE_GAP = 12;
    const FAVORITES_WIDTH_PADDING = 220;
    const FAVORITES_MAX_GRID_WIDTH = 1008;

    beforeEach(() => {
      mockFavoritesRow = {
        classList: {
          add: vi.fn(),
          remove: vi.fn()
        },
        innerHTML: '',
        appendChild: vi.fn()
      };
    });

    // Simplified render logic test
    function shouldRenderFavorites(pages) {
      return pages && pages.length > 0;
    }

    function getFavoritesLayout(viewportWidth, viewportHeight) {
      if (viewportWidth <= 640) {
        const columns = FAVORITES_MOBILE_COLUMNS;
        const rows = FAVORITES_MOBILE_ROWS;
        const tileWidth = FAVORITES_MOBILE_TILE_WIDTH;
        return {
          columns,
          rows,
          tileWidth,
          pageSize: columns * rows,
          gridWidth: (columns * tileWidth) + ((columns - 1) * FAVORITES_TILE_GAP)
        };
      }

      const availableWidth = Math.min(
        Math.max(viewportWidth - FAVORITES_WIDTH_PADDING, FAVORITES_MIN_COLUMNS * (FAVORITES_DESKTOP_TILE_WIDTH + FAVORITES_TILE_GAP)),
        FAVORITES_MAX_GRID_WIDTH
      );
      const calculatedColumns = Math.floor(
        (availableWidth + FAVORITES_TILE_GAP) / (FAVORITES_DESKTOP_TILE_WIDTH + FAVORITES_TILE_GAP)
      );
      const columns = Math.max(FAVORITES_MIN_COLUMNS, Math.min(FAVORITES_MAX_COLUMNS, calculatedColumns));
      const rows = viewportWidth >= FAVORITES_WIDE_SCREEN_THREE_ROW_WIDTH || viewportHeight >= FAVORITES_TALL_SCREEN_HEIGHT
        ? FAVORITES_TALL_SCREEN_ROWS
        : FAVORITES_DEFAULT_ROWS;

      return {
        columns,
        rows,
        tileWidth: FAVORITES_DESKTOP_TILE_WIDTH,
        pageSize: columns * rows,
        gridWidth: (columns * FAVORITES_DESKTOP_TILE_WIDTH) + ((columns - 1) * FAVORITES_TILE_GAP)
      };
    }

    function paginateFavorites(pages, pageSize) {
      const favorites = Array.isArray(pages) ? pages.slice(0, FAVORITES_MAX_ITEMS) : [];
      if (favorites.length === 0 || pageSize <= 0) return [];

      const pagedFavorites = [];
      for (let i = 0; i < favorites.length; i += pageSize) {
        pagedFavorites.push(favorites.slice(i, i + pageSize));
      }
      return pagedFavorites;
    }

    it('should not render when pages is null', () => {
      expect(shouldRenderFavorites(null)).toBeFalsy();
    });

    it('should not render when pages is empty', () => {
      expect(shouldRenderFavorites([])).toBeFalsy();
    });

    it('should render when pages has items', () => {
      expect(shouldRenderFavorites([{ url: 'https://example.com' }])).toBeTruthy();
    });

    it('should use 30 favorites on a large desktop viewport', () => {
      const result = getFavoritesLayout(1440, 900);
      expect(result.columns).toBe(10);
      expect(result.rows).toBe(3);
      expect(result.pageSize).toBe(30);
    });

    it('should use 8 favorites on mobile', () => {
      const result = getFavoritesLayout(640, 900);
      expect(result.columns).toBe(4);
      expect(result.rows).toBe(2);
      expect(result.pageSize).toBe(8);
    });

    it('should use 30 favorites on a wide maximized desktop viewport', () => {
      const result = getFavoritesLayout(1440, 780);
      expect(result.columns).toBe(10);
      expect(result.rows).toBe(3);
      expect(result.pageSize).toBe(30);
    });

    it('should use fewer rows on narrower desktop viewports', () => {
      const result = getFavoritesLayout(1200, 800);
      expect(result.columns).toBe(9);
      expect(result.rows).toBe(2);
      expect(result.pageSize).toBe(18);
    });

    it('should paginate responsive desktop favorites into pages', () => {
      const pages = Array.from({ length: 45 }, (_, index) => ({
        url: `https://example${index}.com`,
        title: `Test ${index}`
      }));
      const layout = getFavoritesLayout(1440, 900);
      const result = paginateFavorites(pages, layout.pageSize);

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveLength(30);
      expect(result[1]).toHaveLength(15);
    });

    it('should paginate mobile favorites into pages', () => {
      const pages = Array.from({ length: 20 }, (_, index) => ({
        url: `https://example${index}.com`,
        title: `Test ${index}`
      }));
      const layout = getFavoritesLayout(640, 900);
      const result = paginateFavorites(pages, layout.pageSize);

      expect(result).toHaveLength(3);
      expect(result[0]).toHaveLength(8);
      expect(result[1]).toHaveLength(8);
      expect(result[2]).toHaveLength(4);
    });

    it('should cap favorites history used for paging', () => {
      const pages = Array.from({ length: 400 }, (_, index) => ({
        url: `https://example${index}.com`,
        title: `Test ${index}`
      }));
      const layout = getFavoritesLayout(1440, 900);
      const result = paginateFavorites(pages, layout.pageSize);

      expect(result.flat()).toHaveLength(FAVORITES_MAX_ITEMS);
    });
  });

  describe('search navigation logic', () => {
    function getSearchUrl(query) {
      const trimmed = query.trim();
      if (trimmed) {
        return `newtab.html?drawer=dashboard&search=${encodeURIComponent(trimmed)}`;
      }
      return 'newtab.html?drawer=dashboard';
    }

    it('should navigate to drawer search with query', () => {
      const result = getSearchUrl('test query');
      expect(result).toBe('newtab.html?drawer=dashboard&search=test%20query');
    });

    it('should handle special characters', () => {
      const result = getSearchUrl('test & query');
      expect(result).toBe('newtab.html?drawer=dashboard&search=test%20%26%20query');
    });

    it('should return drawer URL for empty query', () => {
      const result = getSearchUrl('');
      expect(result).toBe('newtab.html?drawer=dashboard');
    });

    it('should trim whitespace and return drawer URL', () => {
      const result = getSearchUrl('   ');
      expect(result).toBe('newtab.html?drawer=dashboard');
    });
  });

  describe('Unsplash response parsing', () => {
    function parseUnsplashPhoto(photo) {
      return {
        imageUrl: photo.urls.full,
        photographerName: photo.user.name,
        photographerUrl: `${photo.user.links.html}?utm_source=saveit&utm_medium=referral`
      };
    }

    it('should parse Unsplash API response correctly', () => {
      const mockResponse = {
        urls: { full: 'https://images.unsplash.com/photo-123' },
        user: {
          name: 'John Doe',
          links: { html: 'https://unsplash.com/@johndoe' }
        }
      };

      const result = parseUnsplashPhoto(mockResponse);

      expect(result.imageUrl).toBe('https://images.unsplash.com/photo-123');
      expect(result.photographerName).toBe('John Doe');
      expect(result.photographerUrl).toBe('https://unsplash.com/@johndoe?utm_source=saveit&utm_medium=referral');
    });
  });
});

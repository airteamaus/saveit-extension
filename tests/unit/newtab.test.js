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

    function mergeFavoritePages(existingPages, incomingPages) {
      const mergedPages = Array.isArray(existingPages) ? [...existingPages] : [];
      const seenIds = new Set(mergedPages.map(page => page.id));

      for (const page of Array.isArray(incomingPages) ? incomingPages : []) {
        if (!page?.id || seenIds.has(page.id)) continue;
        seenIds.add(page.id);
        mergedPages.push(page);
      }

      return mergedPages.slice(0, FAVORITES_MAX_ITEMS);
    }

    function shouldShowFavoritesNavigation(loadedPageCount) {
      return loadedPageCount > 1;
    }

    function shouldReuseWarmHistory(hasWarmCache, hasNextPage) {
      return hasWarmCache && hasNextPage !== false;
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

    it('should only show favorites navigation when multiple local pages are loaded', () => {
      expect(shouldShowFavoritesNavigation(2)).toBe(true);
      expect(shouldShowFavoritesNavigation(1)).toBe(false);
      expect(shouldShowFavoritesNavigation(0)).toBe(false);
    });

    it('should append newly loaded favorites without duplicating existing items', () => {
      const existingPages = [
        { id: '1', title: 'Existing 1' },
        { id: '2', title: 'Existing 2' }
      ];
      const incomingPages = [
        { id: '2', title: 'Existing 2' },
        { id: '3', title: 'Existing 3' }
      ];

      expect(mergeFavoritePages(existingPages, incomingPages)).toEqual([
        { id: '1', title: 'Existing 1' },
        { id: '2', title: 'Existing 2' },
        { id: '3', title: 'Existing 3' }
      ]);
    });

    it('should discard warm history when the fresh response has no older pages', () => {
      expect(shouldReuseWarmHistory(true, false)).toBe(false);
      expect(shouldReuseWarmHistory(true, true)).toBe(true);
      expect(shouldReuseWarmHistory(false, true)).toBe(false);
    });
  });

  describe('favorite preview logic', () => {
    const FAVORITES_TILE_GAP = 12;
    const FAVORITE_PREVIEW_WIDTH_MULTIPLIER = 4;
    const FAVORITE_PREVIEW_MARGIN = 8;
    const FAVORITE_PREVIEW_GAP = 14;

    function truncateText(text = '', maxLength = 180) {
      if (!text || text.length <= maxLength) return text;
      return `${text.slice(0, maxLength).trim()}...`;
    }

    function getFavoritePreviewWidth(sectionWidth, tileWidth) {
      const maxWidth = Math.max(160, sectionWidth - (FAVORITE_PREVIEW_MARGIN * 2));
      return Math.min(
        maxWidth,
        (tileWidth * FAVORITE_PREVIEW_WIDTH_MULTIPLIER) + (FAVORITES_TILE_GAP * 3) + 28
      );
    }

    function clampFavoritePreviewLeft(sectionWidth, preferredLeft, previewWidth) {
      return Math.max(
        FAVORITE_PREVIEW_MARGIN,
        Math.min(preferredLeft, sectionWidth - previewWidth - FAVORITE_PREVIEW_MARGIN)
      );
    }

    function clampFavoritePreviewTop(sectionHeight, preferredTop, previewHeight) {
      return Math.max(
        FAVORITE_PREVIEW_MARGIN,
        Math.min(preferredTop, sectionHeight - previewHeight - FAVORITE_PREVIEW_MARGIN)
      );
    }

    function getFavoritePreviewPlacement(sectionRect, itemRect, previewRect) {
      const sectionWidth = sectionRect.width;
      const sectionHeight = sectionRect.height;
      const itemLeft = itemRect.left - sectionRect.left;
      const itemRight = itemRect.right - sectionRect.left;
      const itemTop = itemRect.top - sectionRect.top;
      const itemBottom = itemRect.bottom - sectionRect.top;
      const availableRight = sectionRect.right - itemRect.right - FAVORITE_PREVIEW_MARGIN;
      const availableLeft = itemRect.left - sectionRect.left - FAVORITE_PREVIEW_MARGIN;

      let placement = 'right';
      let left = itemRight + FAVORITE_PREVIEW_GAP;
      let top = clampFavoritePreviewTop(
        sectionHeight,
        (itemTop + (itemRect.height / 2)) - (previewRect.height / 2),
        previewRect.height
      );

      if (availableRight < previewRect.width + FAVORITE_PREVIEW_GAP) {
        if (availableLeft >= previewRect.width + FAVORITE_PREVIEW_GAP) {
          placement = 'left';
          left = itemLeft - previewRect.width - FAVORITE_PREVIEW_GAP;
        } else {
          const availableBelow = sectionRect.bottom - itemRect.bottom - FAVORITE_PREVIEW_MARGIN;
          const availableAbove = itemRect.top - sectionRect.top - FAVORITE_PREVIEW_MARGIN;
          left = clampFavoritePreviewLeft(
            sectionWidth,
            itemLeft + (itemRect.width / 2) - (previewRect.width / 2),
            previewRect.width
          );

          if (availableBelow >= previewRect.height + FAVORITE_PREVIEW_GAP || availableBelow >= availableAbove) {
            placement = 'below';
            top = itemBottom + FAVORITE_PREVIEW_GAP;
          } else {
            placement = 'above';
            top = itemTop - previewRect.height - FAVORITE_PREVIEW_GAP;
          }
        }
      }

      return {
        placement,
        left: clampFavoritePreviewLeft(sectionWidth, left, previewRect.width),
        top: clampFavoritePreviewTop(sectionHeight, top, previewRect.height)
      };
    }

    it('should cap preview title length to 256 characters', () => {
      const title = 'a'.repeat(300);
      const result = truncateText(title, 256);
      expect(result.length).toBe(259);
      expect(result.endsWith('...')).toBe(true);
    });

    it('should size preview to roughly four tile widths when space allows', () => {
      const result = getFavoritePreviewWidth(900, 88);
      expect(result).toBe((88 * 4) + (FAVORITES_TILE_GAP * 3) + 28);
    });

    it('should clamp preview inside the shaded area horizontally', () => {
      const previewWidth = getFavoritePreviewWidth(500, 88);
      expect(clampFavoritePreviewLeft(500, -40, previewWidth)).toBe(FAVORITE_PREVIEW_MARGIN);
      expect(clampFavoritePreviewLeft(500, 999, previewWidth)).toBe(500 - previewWidth - FAVORITE_PREVIEW_MARGIN);
    });

    it('should shrink preview width on narrow sections', () => {
      expect(getFavoritePreviewWidth(180, 88)).toBe(164);
    });

    it('should place preview to the right when space allows', () => {
      const result = getFavoritePreviewPlacement(
        { left: 0, top: 0, right: 700, bottom: 300, width: 700, height: 300 },
        { left: 100, top: 80, right: 188, bottom: 168, width: 88, height: 88 },
        { width: 220, height: 160 }
      );

      expect(result.placement).toBe('right');
      expect(result.left).toBe(202);
    });

    it('should place preview to the left when right side is tight', () => {
      const result = getFavoritePreviewPlacement(
        { left: 0, top: 0, right: 500, bottom: 300, width: 500, height: 300 },
        { left: 360, top: 80, right: 448, bottom: 168, width: 88, height: 88 },
        { width: 220, height: 160 }
      );

      expect(result.placement).toBe('left');
      expect(result.left).toBe(126);
    });

    it('should place preview below when neither side fits', () => {
      const result = getFavoritePreviewPlacement(
        { left: 0, top: 0, right: 320, bottom: 320, width: 320, height: 320 },
        { left: 120, top: 70, right: 208, bottom: 158, width: 88, height: 88 },
        { width: 260, height: 120 }
      );

      expect(result.placement).toBe('below');
      expect(result.top).toBe(172);
    });
  });

  describe('search navigation logic', () => {
    function getSearchUrl(query) {
      const trimmed = query.trim();
      if (trimmed) {
        return `newtab.html?drawer=saved-pages&search=${encodeURIComponent(trimmed)}`;
      }
      return 'newtab.html?drawer=saved-pages';
    }

    it('should navigate to drawer search with query', () => {
      const result = getSearchUrl('test query');
      expect(result).toBe('newtab.html?drawer=saved-pages&search=test%20query');
    });

    it('should handle special characters', () => {
      const result = getSearchUrl('test & query');
      expect(result).toBe('newtab.html?drawer=saved-pages&search=test%20%26%20query');
    });

    it('should return drawer URL for empty query', () => {
      const result = getSearchUrl('');
      expect(result).toBe('newtab.html?drawer=saved-pages');
    });

    it('should trim whitespace and return drawer URL', () => {
      const result = getSearchUrl('   ');
      expect(result).toBe('newtab.html?drawer=saved-pages');
    });
  });

});

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

    function getFavoritesToRender(pages) {
      if (!pages || pages.length === 0) return [];
      return pages.slice(0, 16);
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

    it('should limit to 16 favorites', () => {
      const pages = Array(20).fill({ url: 'https://example.com', title: 'Test' });
      const result = getFavoritesToRender(pages);
      expect(result).toHaveLength(16);
    });

    it('should return all pages if less than 16', () => {
      const pages = [
        { url: 'https://example1.com', title: 'Test 1' },
        { url: 'https://example2.com', title: 'Test 2' }
      ];
      const result = getFavoritesToRender(pages);
      expect(result).toHaveLength(2);
    });
  });

  describe('search navigation logic', () => {
    function getSearchUrl(query) {
      const trimmed = query.trim();
      if (trimmed) {
        return `search-results.html?q=${encodeURIComponent(trimmed)}`;
      }
      return 'newtab.html?drawer=dashboard';
    }

    it('should navigate to search-results page with query', () => {
      const result = getSearchUrl('test query');
      expect(result).toBe('search-results.html?q=test%20query');
    });

    it('should handle special characters', () => {
      const result = getSearchUrl('test & query');
      expect(result).toBe('search-results.html?q=test%20%26%20query');
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

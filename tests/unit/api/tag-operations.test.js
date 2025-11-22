import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('API - Tag Operations', () => {
  let API;
  let originalWindow;

  beforeEach(async () => {
    // Save original window state
    originalWindow = { ...global.window };

    // Set up minimal global environment
    global.window = {
      firebaseAuth: null,
      firebaseReady: null,
      firebaseGetIdToken: null,
      SentryHelpers: null
    };

    // Mock CONFIG
    global.CONFIG = {
      cloudFunctionUrl: 'https://test-function.run.app'
    };

    // Mock global functions from config-loader
    global.getBrowserRuntime = vi.fn(() => null);
    global.getStorageAPI = vi.fn(() => null);

    // Load API module
    const apiModule = await import('../../../src/api.js');
    API = apiModule.API;
  });

  afterEach(() => {
    // Restore original window
    global.window = originalWindow;
    vi.clearAllMocks();
  });

  describe('_getPageTags', () => {
    it('should extract tags from classifications', () => {
      const page = {
        classifications: [
          { type: 'general', label: 'Computer Science' },
          { type: 'domain', label: 'Web Development' }
        ]
      };

      const tags = API._getPageTags(page);
      expect(tags).toEqual(['Computer Science', 'Web Development']);
    });

    it('should extract primary classification label', () => {
      const page = {
        primary_classification_label: 'Technology'
      };

      const tags = API._getPageTags(page);
      expect(tags).toEqual(['Technology']);
    });

    it('should extract manual tags', () => {
      const page = {
        manual_tags: ['javascript', 'webdev', 'tutorial']
      };

      const tags = API._getPageTags(page);
      expect(tags).toEqual(['javascript', 'webdev', 'tutorial']);
    });

    it('should extract all tag types together', () => {
      const page = {
        classifications: [
          { type: 'general', label: 'Computer Science' }
        ],
        primary_classification_label: 'Technology',
        manual_tags: ['javascript']
      };

      const tags = API._getPageTags(page);
      expect(tags).toEqual(['Computer Science', 'Technology', 'javascript']);
    });

    it('should convert tags to lowercase when requested', () => {
      const page = {
        classifications: [
          { type: 'general', label: 'Computer Science' }
        ],
        manual_tags: ['JavaScript']
      };

      const tags = API._getPageTags(page, true);
      expect(tags).toEqual(['computer science', 'javascript']);
    });

    it('should return empty array when no tags exist', () => {
      const page = {};
      const tags = API._getPageTags(page);
      expect(tags).toEqual([]);
    });
  });

  describe('_calculateTagSimilarity', () => {
    it('should find exact match', () => {
      const pageTags = ['JavaScript', 'Web Development', 'Tutorial'];
      const result = API._calculateTagSimilarity(pageTags, 'javascript');

      expect(result.type).toBe('exact');
      expect(result.score).toBe(1.0);
      expect(result.matchedTag).toBe('JavaScript');
    });

    it('should find similar match with substring', () => {
      const pageTags = ['Web Development', 'Tutorial'];
      const result = API._calculateTagSimilarity(pageTags, 'web');

      expect(result.type).toBe('similar');
      expect(result.score).toBe(0.85);
      expect(result.matchedTag).toBe('Web Development');
    });

    it('should find similar match when query contains tag', () => {
      const pageTags = ['Script', 'CSS'];
      const result = API._calculateTagSimilarity(pageTags, 'JavaScript');

      expect(result.type).toBe('similar');
      expect(result.score).toBe(0.85);
      expect(result.matchedTag).toBe('Script');
    });

    it('should return null when no match found', () => {
      const pageTags = ['JavaScript', 'Web'];
      const result = API._calculateTagSimilarity(pageTags, 'Python');

      expect(result.type).toBeNull();
      expect(result.score).toBe(0);
      expect(result.matchedTag).toBeNull();
    });
  });
});

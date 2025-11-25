import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock debug function
globalThis.debug = vi.fn();

// Mock global MOCK_DATA
globalThis.MOCK_DATA = [
  {
    id: '1',
    title: 'JavaScript Tutorial',
    url: 'https://example.com/js',
    description: 'Learn JavaScript basics',
    ai_summary_brief: 'A comprehensive JS guide',
    ai_summary_extended: 'This tutorial covers all aspects of JavaScript programming',
    primary_classification_label: 'Web Development',
    classifications: [
      { type: 'general', label: 'Programming', confidence: 0.9 },
      { type: 'domain', label: 'Web Development', confidence: 0.85 },
      { type: 'topic', label: 'JavaScript', confidence: 0.8 }
    ],
    manual_tags: ['javascript', 'webdev'],
    deleted: false
  },
  {
    id: '2',
    title: 'Python Guide',
    url: 'https://python.org/guide',
    description: 'Master Python programming',
    ai_summary_brief: 'Python programming tutorial',
    ai_summary_extended: 'Learn Python from scratch with examples',
    primary_classification_label: 'Programming',
    classifications: [
      { type: 'general', label: 'Programming', confidence: 0.95 },
      { type: 'domain', label: 'Backend', confidence: 0.8 },
      { type: 'topic', label: 'Python', confidence: 0.9 }
    ],
    manual_tags: ['python', 'data-science'],
    deleted: false
  },
  {
    id: '3',
    title: 'Machine Learning Basics',
    url: 'https://ml.example.com',
    description: 'Introduction to ML concepts',
    ai_summary_brief: 'ML fundamentals explained',
    ai_summary_extended: 'A deep dive into machine learning algorithms',
    primary_classification_label: 'AI/ML',
    classifications: [
      { type: 'general', label: 'AI/ML', confidence: 0.92 },
      { type: 'domain', label: 'Machine Learning', confidence: 0.88 },
      { type: 'topic', label: 'Neural Networks', confidence: 0.82 }
    ],
    manual_tags: ['ml', 'ai'],
    deleted: false
  },
  {
    id: '4',
    title: 'Deleted Page',
    url: 'https://deleted.com',
    deleted: true,
    classifications: []
  }
];

// Mock global functions
globalThis.getBrowserRuntime = vi.fn(() => null); // Standalone mode
globalThis.getStorageAPI = vi.fn(() => null);
globalThis.filterMockData = vi.fn((data, options) => data.filter(p => !p.deleted));
globalThis.CONFIG = { cloudFunctionUrl: 'https://test.run.app' };

describe('API - Standalone Mode Methods', () => {
  let API;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Ensure standalone mode
    getBrowserRuntime.mockReturnValue(null);
    getStorageAPI.mockReturnValue(null);

    const apiModule = await import('../../../src/api.js');
    API = apiModule.API;
  });

  describe('_getPageTags', () => {
    it('should extract all tags from a page', () => {
      const page = MOCK_DATA[0];
      const tags = API._getPageTags(page);

      expect(tags).toContain('Programming');
      expect(tags).toContain('Web Development');
      expect(tags).toContain('JavaScript');
      expect(tags).toContain('javascript');
      expect(tags).toContain('webdev');
    });

    it('should return lowercase tags when specified', () => {
      const page = MOCK_DATA[0];
      const tags = API._getPageTags(page, true);

      expect(tags).toContain('programming');
      expect(tags).toContain('web development');
      expect(tags).toContain('javascript');
    });

    it('should handle page without classifications', () => {
      const page = { id: 'test', manual_tags: ['tag1'] };
      const tags = API._getPageTags(page);

      expect(tags).toEqual(['tag1']);
    });

    it('should handle page without any tags', () => {
      const page = { id: 'test' };
      const tags = API._getPageTags(page);

      expect(tags).toEqual([]);
    });

    it('should include primary_classification_label', () => {
      const page = {
        id: 'test',
        primary_classification_label: 'Primary Label'
      };
      const tags = API._getPageTags(page);

      expect(tags).toContain('Primary Label');
    });
  });

  describe('_calculateTagSimilarity', () => {
    it('should return exact match with score 1.0', () => {
      const pageTags = ['JavaScript', 'Python', 'ML'];
      const result = API._calculateTagSimilarity(pageTags, 'javascript');

      expect(result.type).toBe('exact');
      expect(result.score).toBe(1.0);
      expect(result.matchedTag).toBe('JavaScript');
    });

    it('should return similar match for substring', () => {
      const pageTags = ['Machine Learning', 'Data Science'];
      const result = API._calculateTagSimilarity(pageTags, 'machine');

      expect(result.type).toBe('similar');
      expect(result.score).toBe(0.85);
      expect(result.matchedTag).toBe('Machine Learning');
    });

    it('should return similar match when query contains tag', () => {
      const pageTags = ['ML', 'AI'];
      const result = API._calculateTagSimilarity(pageTags, 'machine learning with ml');

      expect(result.type).toBe('similar');
      expect(result.score).toBe(0.85);
      expect(result.matchedTag).toBe('ML');
    });

    it('should return null match when no similarity', () => {
      const pageTags = ['JavaScript', 'Python'];
      const result = API._calculateTagSimilarity(pageTags, 'totally unrelated');

      expect(result.type).toBeNull();
      expect(result.score).toBe(0);
      expect(result.matchedTag).toBeNull();
    });
  });

  describe('_mockSemanticTagSearch', () => {
    it('should find exact tag matches', () => {
      const results = API._mockSemanticTagSearch('JavaScript');

      expect(results.query_label).toBe('JavaScript');
      expect(results.exact_matches.length).toBeGreaterThan(0);
      expect(results.exact_matches[0].thing_data.id).toBe('1');
      expect(results.exact_matches[0].similarity).toBe(1.0);
    });

    it('should find similar tag matches', () => {
      const results = API._mockSemanticTagSearch('Program');

      // "Program" is substring of "Programming"
      expect(results.similar_matches.length).toBeGreaterThan(0);
    });

    it('should return empty results for no matches', () => {
      const results = API._mockSemanticTagSearch('NonExistentTag');

      expect(results.exact_matches).toHaveLength(0);
      expect(results.similar_matches).toHaveLength(0);
      expect(results.related_matches).toHaveLength(0);
    });

    it('should call debug with search query', () => {
      API._mockSemanticTagSearch('test');

      expect(debug).toHaveBeenCalledWith('Mock semantic search for:', 'test');
    });
  });

  describe('_mockGetSimilarByThingId', () => {
    it('should find similar things based on tag overlap', () => {
      const results = API._mockGetSimilarByThingId('1', 10, 0);

      expect(results.source.thing_id).toBe('1');
      expect(results.results.length).toBeGreaterThan(0);
      // Page 2 shares "Programming" tag
      expect(results.results.some(r => r.thing_id === '2')).toBe(true);
    });

    it('should return empty results for non-existent thing', () => {
      const results = API._mockGetSimilarByThingId('nonexistent', 10, 0);

      expect(results.results).toHaveLength(0);
      expect(results.source.thing_id).toBe('nonexistent');
      expect(results.source.label).toBeNull();
    });

    it('should respect limit parameter', () => {
      const results = API._mockGetSimilarByThingId('1', 1, 0);

      expect(results.results.length).toBeLessThanOrEqual(1);
      expect(results.pagination.limit).toBe(1);
    });

    it('should respect offset parameter', () => {
      const fullResults = API._mockGetSimilarByThingId('1', 10, 0);
      const offsetResults = API._mockGetSimilarByThingId('1', 10, 1);

      if (fullResults.results.length > 1) {
        expect(offsetResults.results[0].thing_id).toBe(fullResults.results[1].thing_id);
      }
    });

    it('should include pagination metadata', () => {
      const results = API._mockGetSimilarByThingId('1', 10, 0);

      expect(results.pagination).toHaveProperty('limit');
      expect(results.pagination).toHaveProperty('offset');
      expect(results.pagination).toHaveProperty('total');
      expect(results.pagination).toHaveProperty('has_more');
    });

    it('should exclude source thing from results', () => {
      const results = API._mockGetSimilarByThingId('1', 50, 0);

      const sourceInResults = results.results.find(r => r.thing_id === '1');
      expect(sourceInResults).toBeUndefined();
    });
  });

  describe('_mockSearchContent', () => {
    it('should find pages matching title', () => {
      const results = API._mockSearchContent('JavaScript', 50, 0, 0.1);

      expect(results.results.length).toBeGreaterThan(0);
      expect(results.results[0].thing_data.id).toBe('1');
    });

    it('should find pages matching AI summary', () => {
      const results = API._mockSearchContent('comprehensive', 50, 0, 0.1);

      expect(results.results.length).toBeGreaterThan(0);
      // Page 1 has "comprehensive" in ai_summary_brief
      expect(results.results[0].thing_data.id).toBe('1');
    });

    it('should find pages matching description', () => {
      const results = API._mockSearchContent('Master', 50, 0, 0.1);

      expect(results.results.length).toBeGreaterThan(0);
    });

    it('should find pages matching classifications', () => {
      const results = API._mockSearchContent('Neural', 50, 0, 0.1);

      expect(results.results.length).toBeGreaterThan(0);
      expect(results.results[0].thing_data.id).toBe('3');
    });

    it('should respect threshold parameter', () => {
      const lowThreshold = API._mockSearchContent('Python', 50, 0, 0.1);
      const highThreshold = API._mockSearchContent('Python', 50, 0, 0.9);

      expect(lowThreshold.results.length).toBeGreaterThanOrEqual(highThreshold.results.length);
    });

    it('should exclude deleted pages', () => {
      const results = API._mockSearchContent('Deleted', 50, 0, 0);

      const deletedInResults = results.results.find(r => r.thing_data.deleted === true);
      expect(deletedInResults).toBeUndefined();
    });

    it('should return pagination metadata', () => {
      const results = API._mockSearchContent('test', 10, 0, 0);

      expect(results.pagination).toHaveProperty('limit');
      expect(results.pagination).toHaveProperty('offset');
      expect(results.pagination).toHaveProperty('total');
      expect(results.pagination).toHaveProperty('has_more');
      expect(results.query).toBe('test');
      expect(results.threshold).toBe(0);
    });

    it('should respect limit and offset', () => {
      const fullResults = API._mockSearchContent('programming', 50, 0, 0);
      const limitedResults = API._mockSearchContent('programming', 1, 0, 0);
      const offsetResults = API._mockSearchContent('programming', 1, 1, 0);

      expect(limitedResults.results.length).toBeLessThanOrEqual(1);
      if (fullResults.results.length > 1) {
        expect(offsetResults.results[0]?.thing_id).toBe(fullResults.results[1]?.thing_id);
      }
    });

    it('should cap similarity at 1.0', () => {
      // Create a page that matches everything
      const results = API._mockSearchContent('Programming', 50, 0, 0);

      results.results.forEach(r => {
        expect(r.similarity).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('searchByTag (standalone)', () => {
    it('should use mock semantic search in standalone mode', async () => {
      const results = await API.searchByTag('JavaScript');

      expect(results.query_label).toBe('JavaScript');
      expect(results.exact_matches).toBeDefined();
      expect(results.similar_matches).toBeDefined();
    });
  });

  describe('getSimilarByThingId (standalone)', () => {
    it('should use mock similar search in standalone mode', async () => {
      const results = await API.getSimilarByThingId('1', 10, 0);

      expect(results.source.thing_id).toBe('1');
      expect(results.results).toBeDefined();
      expect(results.pagination).toBeDefined();
    });
  });

  describe('searchContent (standalone)', () => {
    it('should use mock content search in standalone mode', async () => {
      const results = await API.searchContent('test', { limit: 10, offset: 0, threshold: 0.1 });

      expect(results.query).toBe('test');
      expect(results.results).toBeDefined();
      expect(results.pagination).toBeDefined();
    });
  });

  describe('getGraphData (standalone)', () => {
    it('should throw error suggesting mock method in standalone mode', async () => {
      await expect(API.getGraphData()).rejects.toThrow('Use getMockGraphData() in standalone mode');
    });
  });
});

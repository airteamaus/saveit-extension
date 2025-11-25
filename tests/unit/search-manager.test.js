import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the debug function that applySearchFilter uses
globalThis.debug = vi.fn();

describe('SearchManager', () => {
  let SearchManager;
  let searchManager;
  let mockPages;

  beforeEach(async () => {
    const searchModule = await import('../../src/search-manager.js');
    SearchManager = searchModule.SearchManager;
    searchManager = new SearchManager();
    vi.clearAllMocks();

    mockPages = [
      {
        id: '1',
        title: 'JavaScript Tutorial',
        url: 'https://example.com/js',
        description: 'Learn JavaScript basics',
        user_notes: 'Great for beginners',
        ai_summary_brief: 'A comprehensive JS guide',
        ai_summary_extended: 'This tutorial covers all aspects of JavaScript programming',
        primary_classification_label: 'Web Development',
        manual_tags: ['javascript', 'webdev'],
        domain: 'example.com',
        author: 'John Doe'
      },
      {
        id: '2',
        title: 'Python Guide',
        url: 'https://python.org/guide',
        description: 'Master Python programming',
        user_notes: 'Useful for data science',
        ai_summary_brief: 'Python programming tutorial',
        ai_summary_extended: 'Learn Python from scratch',
        primary_classification_label: 'Programming',
        manual_tags: ['python', 'data-science'],
        domain: 'python.org',
        author: 'Jane Smith'
      },
      {
        id: '3',
        title: 'Machine Learning Basics',
        url: 'https://ml.example.com',
        description: 'Introduction to ML concepts',
        user_notes: null,
        ai_summary_brief: 'ML fundamentals explained',
        ai_summary_extended: 'A deep dive into machine learning algorithms',
        primary_classification_label: 'AI/ML',
        manual_tags: ['ml', 'ai'],
        domain: 'ml.example.com',
        author: 'AI Expert'
      }
    ];
  });

  describe('applySearchFilter', () => {
    it('should filter by title', () => {
      const filtered = searchManager.applySearchFilter(mockPages, 'JavaScript');
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('1');
    });

    it('should filter by url', () => {
      const filtered = searchManager.applySearchFilter(mockPages, 'python.org');
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('2');
    });

    it('should filter by description', () => {
      const filtered = searchManager.applySearchFilter(mockPages, 'ML concepts');
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('3');
    });

    it('should filter by user_notes', () => {
      const filtered = searchManager.applySearchFilter(mockPages, 'beginners');
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('1');
    });

    it('should filter by ai_summary_brief', () => {
      const filtered = searchManager.applySearchFilter(mockPages, 'comprehensive');
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('1');
    });

    it('should filter by ai_summary_extended', () => {
      const filtered = searchManager.applySearchFilter(mockPages, 'deep dive');
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('3');
    });

    it('should filter by primary_classification_label', () => {
      const filtered = searchManager.applySearchFilter(mockPages, 'Web Development');
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('1');
    });

    it('should filter by manual_tags', () => {
      const filtered = searchManager.applySearchFilter(mockPages, 'data-science');
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('2');
    });

    it('should filter by domain', () => {
      const filtered = searchManager.applySearchFilter(mockPages, 'ml.example');
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('3');
    });

    it('should filter by author', () => {
      const filtered = searchManager.applySearchFilter(mockPages, 'Jane Smith');
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('2');
    });

    it('should be case-insensitive', () => {
      const filtered = searchManager.applySearchFilter(mockPages, 'JAVASCRIPT');
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('1');
    });

    it('should return multiple matches', () => {
      const filtered = searchManager.applySearchFilter(mockPages, 'example');
      expect(filtered).toHaveLength(2); // Pages 1 and 3 have example in URL/domain
    });

    it('should return empty array for no matches', () => {
      const filtered = searchManager.applySearchFilter(mockPages, 'nonexistent');
      expect(filtered).toHaveLength(0);
    });

    it('should handle pages with missing fields', () => {
      const pagesWithMissingFields = [
        { id: '1', title: 'Test' },
        { id: '2', url: 'https://test.com' }
      ];
      const filtered = searchManager.applySearchFilter(pagesWithMissingFields, 'test');
      expect(filtered).toHaveLength(2);
    });

    it('should handle pages with null user_notes', () => {
      const filtered = searchManager.applySearchFilter(mockPages, 'Useful');
      // Only page 2 has 'Useful' in user_notes, page 3 has null user_notes
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('2');
    });

    it('should call debug with query and results', () => {
      searchManager.applySearchFilter(mockPages, 'JavaScript');
      expect(debug).toHaveBeenCalledWith('[applySearchFilter] Filtering with query:', 'JavaScript');
      expect(debug).toHaveBeenCalledWith('[applySearchFilter] Filtered to', 1, 'pages');
    });
  });

  describe('applyClientFilters', () => {
    it('should return copy of all pages for empty query', () => {
      const filtered = searchManager.applyClientFilters(mockPages, '');
      expect(filtered).toHaveLength(3);
      expect(filtered).not.toBe(mockPages); // Should be a copy
    });

    it('should return copy of all pages for whitespace-only query', () => {
      const filtered = searchManager.applyClientFilters(mockPages, '   ');
      expect(filtered).toHaveLength(3);
    });

    it('should return copy of all pages for null query', () => {
      const filtered = searchManager.applyClientFilters(mockPages, null);
      expect(filtered).toHaveLength(3);
    });

    it('should filter by title', () => {
      const filtered = searchManager.applyClientFilters(mockPages, 'Python');
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('2');
    });

    it('should filter by multiple fields', () => {
      // 'example' appears in URL and domain
      const filtered = searchManager.applyClientFilters(mockPages, 'example');
      expect(filtered.length).toBeGreaterThan(0);
    });

    it('should be case-insensitive', () => {
      const filtered = searchManager.applyClientFilters(mockPages, 'machine learning');
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('3');
    });
  });
});

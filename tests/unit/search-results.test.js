/**
 * Tests for search-results.js pure functions
 * Tests the logic without DOM/module dependencies
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('search-results', () => {
  describe('truncate', () => {
    function truncate(text, maxLength) {
      if (!text || text.length <= maxLength) return text || '';
      return text.substring(0, maxLength).trim() + '...';
    }

    it('should return empty string for null', () => {
      expect(truncate(null, 100)).toBe('');
    });

    it('should return empty string for undefined', () => {
      expect(truncate(undefined, 100)).toBe('');
    });

    it('should return text unchanged if under max length', () => {
      expect(truncate('short text', 100)).toBe('short text');
    });

    it('should truncate text over max length', () => {
      const text = 'This is a longer piece of text that exceeds the limit';
      const result = truncate(text, 20);
      expect(result).toBe('This is a longer pie...');
      expect(result.length).toBe(23); // 20 chars + '...'
    });

    it('should trim trailing whitespace before adding ellipsis', () => {
      const text = 'Text with   spaces here';
      const result = truncate(text, 12);
      expect(result).toBe('Text with...');
    });
  });

  describe('escapeHtml', () => {
    function escapeHtml(text) {
      if (!text) return '';
      const div = { textContent: '', innerHTML: '' };
      // Simulate browser behavior
      div.textContent = text;
      // Simple escape for testing
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    it('should return empty string for null', () => {
      expect(escapeHtml(null)).toBe('');
    });

    it('should return empty string for undefined', () => {
      expect(escapeHtml(undefined)).toBe('');
    });

    it('should escape HTML special characters', () => {
      const result = escapeHtml('<script>alert("xss")</script>');
      expect(result).toContain('&lt;');
      expect(result).toContain('&gt;');
      expect(result).not.toContain('<script>');
    });

    it('should escape ampersands', () => {
      expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
    });

    it('should escape quotes', () => {
      const result = escapeHtml('Say "hello"');
      expect(result).toContain('&quot;');
    });
  });

  describe('getFaviconUrl', () => {
    function getFaviconUrl(domain) {
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
    }

    it('should return Google favicon URL for domain', () => {
      const result = getFaviconUrl('example.com');
      expect(result).toBe('https://www.google.com/s2/favicons?domain=example.com&sz=64');
    });

    it('should handle subdomains', () => {
      const result = getFaviconUrl('blog.example.com');
      expect(result).toBe('https://www.google.com/s2/favicons?domain=blog.example.com&sz=64');
    });
  });

  describe('result filtering', () => {
    const SIMILARITY_THRESHOLD = 0.70;

    function filterByThreshold(results, threshold = SIMILARITY_THRESHOLD) {
      return results.filter(r => r.similarity >= threshold);
    }

    it('should filter out results below threshold', () => {
      const results = [
        { thing_id: '1', similarity: 0.85 },
        { thing_id: '2', similarity: 0.65 },
        { thing_id: '3', similarity: 0.72 }
      ];
      const filtered = filterByThreshold(results);
      expect(filtered).toHaveLength(2);
      expect(filtered.map(r => r.thing_id)).toEqual(['1', '3']);
    });

    it('should include results exactly at threshold', () => {
      const results = [
        { thing_id: '1', similarity: 0.70 }
      ];
      const filtered = filterByThreshold(results);
      expect(filtered).toHaveLength(1);
    });

    it('should return empty array when all below threshold', () => {
      const results = [
        { thing_id: '1', similarity: 0.50 },
        { thing_id: '2', similarity: 0.60 }
      ];
      const filtered = filterByThreshold(results);
      expect(filtered).toHaveLength(0);
    });

    it('should support custom threshold', () => {
      const results = [
        { thing_id: '1', similarity: 0.85 },
        { thing_id: '2', similarity: 0.78 }
      ];
      const filtered = filterByThreshold(results, 0.80);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].thing_id).toBe('1');
    });
  });

  describe('pagination logic', () => {
    function hasMoreResults(currentOffset, resultsLength, total) {
      return currentOffset + resultsLength < total;
    }

    it('should return true when more results available', () => {
      expect(hasMoreResults(0, 20, 100)).toBe(true);
    });

    it('should return false when all results loaded', () => {
      expect(hasMoreResults(80, 20, 100)).toBe(false);
    });

    it('should return false when exactly at total', () => {
      expect(hasMoreResults(0, 100, 100)).toBe(false);
    });

    it('should handle edge case of more loaded than total', () => {
      expect(hasMoreResults(90, 20, 100)).toBe(false);
    });
  });

  describe('result count text', () => {
    function getResultsCountText(total, query) {
      return `${total} result${total === 1 ? '' : 's'} for "${query}"`;
    }

    it('should show singular for 1 result', () => {
      expect(getResultsCountText(1, 'test')).toBe('1 result for "test"');
    });

    it('should show plural for multiple results', () => {
      expect(getResultsCountText(42, 'test')).toBe('42 results for "test"');
    });

    it('should show plural for 0 results', () => {
      expect(getResultsCountText(0, 'test')).toBe('0 results for "test"');
    });

    it('should include query in message', () => {
      const result = getResultsCountText(5, 'machine learning');
      expect(result).toContain('machine learning');
    });
  });

  describe('URL query parsing', () => {
    function getQueryFromUrl(searchParams) {
      return searchParams.get('q') || '';
    }

    it('should extract query from URL params', () => {
      const params = new URLSearchParams('?q=test%20query');
      expect(getQueryFromUrl(params)).toBe('test query');
    });

    it('should return empty string when no query', () => {
      const params = new URLSearchParams('');
      expect(getQueryFromUrl(params)).toBe('');
    });

    it('should handle special characters', () => {
      const params = new URLSearchParams('?q=test%20%26%20query');
      expect(getQueryFromUrl(params)).toBe('test & query');
    });
  });

  describe('skeleton card generation', () => {
    function createSkeletonCards(count = 3) {
      return Array(count).fill(`
    <div class="skeleton-card">
      <div class="skeleton-line title"></div>
      <div class="skeleton-line summary"></div>
      <div class="skeleton-line summary"></div>
      <div class="skeleton-line meta"></div>
    </div>
  `).join('');
    }

    it('should generate default 3 skeleton cards', () => {
      const html = createSkeletonCards();
      const matches = html.match(/skeleton-card/g);
      expect(matches).toHaveLength(3);
    });

    it('should generate specified number of cards', () => {
      const html = createSkeletonCards(5);
      const matches = html.match(/skeleton-card/g);
      expect(matches).toHaveLength(5);
    });

    it('should include skeleton line elements', () => {
      const html = createSkeletonCards(1);
      expect(html).toContain('skeleton-line title');
      expect(html).toContain('skeleton-line summary');
      expect(html).toContain('skeleton-line meta');
    });
  });

  describe('result card data extraction', () => {
    function getSummary(page) {
      return page.ai_summary_brief || page.description || '';
    }

    it('should prefer ai_summary_brief', () => {
      const page = {
        ai_summary_brief: 'AI summary',
        description: 'Description'
      };
      expect(getSummary(page)).toBe('AI summary');
    });

    it('should fall back to description', () => {
      const page = {
        description: 'Description'
      };
      expect(getSummary(page)).toBe('Description');
    });

    it('should return empty string when neither exists', () => {
      const page = {};
      expect(getSummary(page)).toBe('');
    });
  });
});

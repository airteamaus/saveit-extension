import { describe, it, expect } from 'vitest';

// Import the Components module
// Note: This is a browser-targeted file that uses CommonJS export for testing
import componentModule from '../../src/components.js';
const Components = componentModule.Components;

describe('Components', () => {
  describe('escapeHtml', () => {
    it('should escape HTML special characters', () => {
      const input = '<script>alert("XSS")</script>';
      const output = Components.escapeHtml(input);

      expect(output).not.toContain('<script>');
      expect(output).toContain('&lt;script&gt;');
    });

    it('should return empty string for null/undefined', () => {
      expect(Components.escapeHtml(null)).toBe('');
      expect(Components.escapeHtml(undefined)).toBe('');
      expect(Components.escapeHtml('')).toBe('');
    });

    it('should handle ampersands', () => {
      const input = 'Rock & Roll';
      const output = Components.escapeHtml(input);

      expect(output).toContain('&amp;');
    });
  });

  describe('truncate', () => {
    it('should truncate long text', () => {
      const longText = 'This is a very long piece of text that should be truncated';
      const result = Components.truncate(longText, 20);

      expect(result.length).toBeLessThanOrEqual(24); // 20 + '...'
      expect(result).toContain('...');
    });

    it('should not truncate short text', () => {
      const shortText = 'Short';
      const result = Components.truncate(shortText, 20);

      expect(result).toBe('Short');
      expect(result).not.toContain('...');
    });

    it('should handle exact length match', () => {
      const text = '12345678901234567890';
      const result = Components.truncate(text, 20);

      expect(result).toBe(text);
      expect(result).not.toContain('...');
    });

    it('should handle null/undefined', () => {
      expect(Components.truncate(null, 20)).toBeFalsy();
      expect(Components.truncate(undefined, 20)).toBeFalsy();
    });
  });

  describe('savedPageCard', () => {
    it('should render card with basic data', () => {
      const page = {
        id: 'test-123',
        title: 'Test Page',
        url: 'https://example.com'
      };

      const html = Components.savedPageCard(page);

      expect(html).toContain('saved-page-card');
      expect(html).toContain('test-123');
      expect(html).toContain('Test Page');
    });

    it('should render card with AI summary', () => {
      const page = {
        id: 'test-456',
        title: 'AI Article',
        url: 'https://example.com/ai',
        ai_summary_brief: 'This is an AI-generated summary'
      };

      const html = Components.savedPageCard(page);

      expect(html).toContain('This is an AI-generated summary');
      expect(html).toContain('row-summary');
    });

    it('should render card with description fallback', () => {
      const page = {
        id: 'test-789',
        title: 'Article',
        url: 'https://example.com/article',
        description: 'This is a regular description'
      };

      const html = Components.savedPageCard(page);

      expect(html).toContain('This is a regular description');
      expect(html).toContain('row-summary');
    });

    it('should render favicon when domain provided', () => {
      const page = {
        id: 'test-favicon',
        title: 'Test',
        url: 'https://example.com',
        domain: 'example.com'
      };

      const html = Components.savedPageCard(page);

      expect(html).toContain('favicon');
      expect(html).toContain('icons.duckduckgo.com/ip3/example.com.ico');
    });

    it('should render user notes', () => {
      const page = {
        id: 'test-notes',
        title: 'Test',
        url: 'https://example.com',
        user_notes: 'My personal notes here'
      };

      const html = Components.savedPageCard(page);

      expect(html).toContain('row-notes');
      expect(html).toContain('My personal notes here');
    });

    it('should render metadata items', () => {
      const page = {
        id: 'test-meta',
        title: 'Test',
        url: 'https://example.com',
        domain: 'example.com',
        reading_time_minutes: 5,
        author: 'John Doe'
      };

      const html = Components.savedPageCard(page);

      expect(html).toContain('row-meta-inline');
      expect(html).toContain('5 min read');
      expect(html).toContain('example.com');
      expect(html).toContain('meta-separator');
    });

    it('should escape XSS in title', () => {
      const page = {
        id: 'test-xss',
        title: '<script>alert("XSS")</script>',
        url: 'https://example.com'
      };

      const html = Components.savedPageCard(page);

      expect(html).not.toContain('<script>alert');
      expect(html).toContain('&lt;script&gt;');
    });
  });

  describe('emptyState', () => {
    it('should render empty state message', () => {
      const html = Components.emptyState();

      expect(html).toContain('empty-state');
      expect(html).toContain('No saved pages yet');
    });
  });

  describe('loadingState', () => {
    it('should render loading message', () => {
      const html = Components.loadingState();

      expect(html).toContain('loading-state');
      expect(html).toContain('Loading your saved pages');
    });
  });

  describe('welcomeState', () => {
    it('should render welcome message', () => {
      const html = Components.welcomeState();

      expect(html).toContain('welcome-state');
      expect(html).toContain('Welcome to SaveIt');
      expect(html).toContain('Sign in with Google');
    });
  });

  describe('errorState', () => {
    it('should render error message', () => {
      const error = new Error('Test error message');
      const html = Components.errorState(error);

      expect(html).toContain('error-state');
      expect(html).toContain('Test error message');
      expect(html).toContain('Failed to load pages');
    });

    it('should handle error without message', () => {
      const error = {};
      const html = Components.errorState(error);

      expect(html).toContain('Unknown error occurred');
    });
  });

  describe('renderClassifications', () => {
    it('should render new-style classifications with types', () => {
      const page = {
        classifications: [
          { type: 'general', label: 'Computer Science', confidence: 0.95 },
          { type: 'domain', label: 'Web Development', confidence: 0.90 }
        ]
      };

      const html = Components.renderClassifications(page);

      expect(html).toContain('Computer Science');
      expect(html).toContain('Web Development');
      expect(html).toContain('ai-tag');
      expect(html).toContain('tag-general');
      expect(html).toContain('tag-domain');
      expect(html).toContain('confidence: 95%');
      expect(html).toContain('confidence: 90%');
    });

    it('should fallback to primary_classification_label', () => {
      const page = {
        primary_classification_label: 'Technology'
      };

      const html = Components.renderClassifications(page);

      expect(html).toContain('Technology');
      expect(html).toContain('ai-tag');
    });

    it('should return empty string when no classifications', () => {
      const page = {};
      const html = Components.renderClassifications(page);

      expect(html).toBe('');
    });

    it('should escape HTML in labels', () => {
      const page = {
        classifications: [
          { type: 'general', label: '<script>alert("XSS")</script>', confidence: 1.0 }
        ]
      };

      const html = Components.renderClassifications(page);

      expect(html).not.toContain('<script>alert');
      expect(html).toContain('&lt;script&gt;');
    });
  });

  describe('discoveryResults', () => {
    it('should render exact matches', () => {
      const results = {
        exact_matches: [
          { thing_data: { id: '1', title: 'Match 1', url: 'https://example.com/1' } }
        ]
      };

      const html = Components.discoveryResults(results);

      expect(html).toContain('Match 1');
    });

    it('should render similar and related matches', () => {
      const results = {
        similar_matches: [
          { thing_data: { id: '2', title: 'Similar', url: 'https://example.com/2' } }
        ],
        related_matches: [
          { thing_data: { id: '3', title: 'Related', url: 'https://example.com/3' } }
        ]
      };

      const html = Components.discoveryResults(results);

      expect(html).toContain('Similar');
      expect(html).toContain('Related');
    });

    it('should show empty state when no results', () => {
      const results = {};
      const html = Components.discoveryResults(results);

      expect(html).toContain('No related pages');
      expect(html).toContain('empty-state');
    });
  });
});

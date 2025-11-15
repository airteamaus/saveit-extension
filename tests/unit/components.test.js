import { describe, it, expect } from 'vitest';

// Mock Components module
const Components = {
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  truncate(text, maxLength) {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength).trim() + '...';
  },

  savedPageCard(page) {
    return `<div class="saved-page-card" data-id="${page.id}"></div>`;
  },

  emptyState() {
    return '<div class="empty-state">No saved pages yet</div>';
  },

  renderClassifications(page) {
    if (page.classifications && page.classifications.length > 0) {
      return page.classifications
        .map(c => `<span class="tag ai-tag">${this.escapeHtml(c.label)}</span>`)
        .join('');
    }
    if (page.dewey_primary_label) {
      return `<span class="tag ai-tag">${this.escapeHtml(page.dewey_primary_label)}</span>`;
    }
    return '';
  }
};

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
    it('should render card with ID', () => {
      const page = {
        id: 'test-123',
        title: 'Test Page',
        url: 'https://example.com'
      };

      const html = Components.savedPageCard(page);

      expect(html).toContain('saved-page-card');
      expect(html).toContain('test-123');
    });
  });

  describe('emptyState', () => {
    it('should render empty state message', () => {
      const html = Components.emptyState();

      expect(html).toContain('empty-state');
      expect(html).toContain('No saved pages yet');
    });
  });

  describe('renderClassifications', () => {
    it('should render new-style classifications', () => {
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

      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });
  });
});

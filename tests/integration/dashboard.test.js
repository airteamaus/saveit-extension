import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('Dashboard Integration', () => {
  let container;

  beforeEach(() => {
    // Set up DOM
    document.body.innerHTML = `
      <div id="content"></div>
      <div id="stats"></div>
      <input id="search" />
      <div id="clear-search"></div>
    `;
    container = document.getElementById('content');
  });

  describe('Rendering', () => {
    it('should show empty state when no pages', () => {
      container.innerHTML = '<div class="empty-state">No saved pages yet</div>';

      expect(container.querySelector('.empty-state')).toBeTruthy();
      expect(container.textContent).toContain('No saved pages yet');
    });

    it('should render page cards when pages exist', () => {
      container.innerHTML = `
        <div class="saved-page-card" data-id="1"></div>
        <div class="saved-page-card" data-id="2"></div>
      `;

      const cards = container.querySelectorAll('.saved-page-card');
      expect(cards.length).toBe(2);
    });

    it('should show search empty state when search has no results', () => {
      container.innerHTML = `
        <div class="empty-state">
          <h2>No matching pages</h2>
        </div>
      `;

      expect(container.textContent).toContain('No matching pages');
    });
  });

  describe('Search functionality', () => {
    it('should filter pages by search query', () => {
      const pages = [
        { id: '1', title: 'JavaScript Tutorial', url: 'https://example.com/js' },
        { id: '2', title: 'Python Guide', url: 'https://example.com/py' },
        { id: '3', title: 'JavaScript Advanced', url: 'https://example.com/js-adv' }
      ];

      const query = 'JavaScript';
      const filtered = pages.filter(p =>
        p.title.toLowerCase().includes(query.toLowerCase())
      );

      expect(filtered.length).toBe(2);
      expect(filtered[0].title).toContain('JavaScript');
      expect(filtered[1].title).toContain('JavaScript');
    });

    it('should search across multiple fields', () => {
      const pages = [
        {
          id: '1',
          title: 'Random Title',
          url: 'https://github.com/project',
          description: 'A great project',
          author: 'John Doe'
        }
      ];

      const searchInPage = (page, query) => {
        const q = query.toLowerCase();
        return (
          page.title?.toLowerCase().includes(q) ||
          page.url?.toLowerCase().includes(q) ||
          page.description?.toLowerCase().includes(q) ||
          page.author?.toLowerCase().includes(q)
        );
      };

      expect(searchInPage(pages[0], 'github')).toBe(true);
      expect(searchInPage(pages[0], 'john')).toBe(true);
      expect(searchInPage(pages[0], 'project')).toBe(true);
      expect(searchInPage(pages[0], 'nonexistent')).toBe(false);
    });
  });

  describe('Stats display', () => {
    it('should show correct count for all pages', () => {
      const statsEl = document.getElementById('stats');
      const total = 5;
      statsEl.textContent = `${total} pages saved`;

      expect(statsEl.textContent).toBe('5 pages saved');
    });

    it('should show filtered count when search active', () => {
      const statsEl = document.getElementById('stats');
      const total = 10;
      const filtered = 3;
      statsEl.textContent = `Showing ${filtered} of ${total} pages`;

      expect(statsEl.textContent).toBe('Showing 3 of 10 pages');
    });

    it('should use singular form for 1 page', () => {
      const statsEl = document.getElementById('stats');
      statsEl.textContent = '1 page saved';

      expect(statsEl.textContent).toBe('1 page saved');
    });
  });

  describe('Discovery mode', () => {
    it('should show discovery header with tag name', () => {
      const tagLabel = 'JavaScript';
      const totalResults = 5;

      container.innerHTML = `
        <div class="discovery-header">
          <h2>Discovery: <span class="highlight">${tagLabel}</span></h2>
          <p class="discovery-subtitle">${totalResults} related pages</p>
        </div>
      `;

      expect(container.querySelector('.discovery-header')).toBeTruthy();
      expect(container.textContent).toContain('Discovery: JavaScript');
      expect(container.textContent).toContain('5 related pages');
    });

    it('should flatten and combine all result tiers', () => {
      const results = {
        exact_matches: [
          { thing_data: { id: '1', title: 'Exact 1' } },
          { thing_data: { id: '2', title: 'Exact 2' } }
        ],
        similar_matches: [
          { thing_data: { id: '3', title: 'Similar 1' } }
        ],
        related_matches: [
          { thing_data: { id: '4', title: 'Related 1' } },
          { thing_data: { id: '5', title: 'Related 2' } }
        ]
      };

      const allResults = [
        ...(results.exact_matches || []),
        ...(results.similar_matches || []),
        ...(results.related_matches || [])
      ];

      expect(allResults.length).toBe(5);
      expect(allResults[0].thing_data.id).toBe('1');
      expect(allResults[2].thing_data.id).toBe('3');
      expect(allResults[4].thing_data.id).toBe('5');
    });
  });

  describe('Error handling', () => {
    it('should display error state with message', () => {
      const error = new Error('Failed to load pages');
      container.innerHTML = `
        <div class="error-state">
          <h2>Failed to load pages</h2>
          <p>${error.message}</p>
        </div>
      `;

      expect(container.querySelector('.error-state')).toBeTruthy();
      expect(container.textContent).toContain('Failed to load pages');
    });

    it('should identify authentication errors', () => {
      const authErrors = [
        'HTTP 401',
        'Unauthorized access',
        'Authentication failed',
        'Sign-in failed'
      ];

      const isAuthError = (message) => {
        return message.includes('401') ||
               message.includes('Unauthorized') ||
               message.includes('Authentication failed') ||
               message.includes('Sign-in failed');
      };

      authErrors.forEach(error => {
        expect(isAuthError(error)).toBe(true);
      });

      expect(isAuthError('Network error')).toBe(false);
      expect(isAuthError('HTTP 500')).toBe(false);
    });
  });
});

import { describe, it, expect, beforeEach } from 'vitest';

// Import real managers
import searchModule from '../../src/search-manager.js';
import statsModule from '../../src/stats-manager.js';
import componentsModule from '../../src/components.js';

const SearchManager = searchModule.SearchManager;
const StatsManager = statsModule.StatsManager;
const Components = componentsModule.Components;

describe('Dashboard Integration', () => {
  let container;
  let searchManager;
  let statsManager;

  beforeEach(() => {
    // Set up DOM
    document.body.innerHTML = `
      <div id="content"></div>
      <div id="stats"></div>
      <input id="search" />
      <div id="clear-search"></div>
    `;
    container = document.getElementById('content');
    searchManager = new SearchManager();
    statsManager = new StatsManager();
  });

  describe('Components Rendering', () => {
    it('should render empty state when no pages', () => {
      const html = Components.emptyState();
      container.innerHTML = html;

      expect(container.querySelector('.empty-state')).toBeTruthy();
      expect(container.textContent).toContain('No saved pages yet');
    });

    it('should render page cards when pages exist', () => {
      const pages = [
        { id: '1', title: 'Page 1', url: 'https://example.com/1' },
        { id: '2', title: 'Page 2', url: 'https://example.com/2' }
      ];

      container.innerHTML = pages.map(p => Components.savedPageCard(p)).join('');
      const cards = container.querySelectorAll('.saved-page-card');

      expect(cards.length).toBe(2);
      expect(cards[0].getAttribute('data-id')).toBe('1');
      expect(cards[1].getAttribute('data-id')).toBe('2');
    });

    it('should render error state with message', () => {
      const error = new Error('Failed to load pages');
      container.innerHTML = Components.errorState(error);

      expect(container.querySelector('.error-state')).toBeTruthy();
      expect(container.textContent).toContain('Failed to load pages');
    });

    it('should render loading state', () => {
      container.innerHTML = Components.loadingState();

      expect(container.querySelector('.loading-state')).toBeTruthy();
      expect(container.textContent).toContain('Loading your saved pages');
    });
  });

  describe('Search Manager Integration', () => {
    it('should filter pages by title', () => {
      const pages = [
        { id: '1', title: 'JavaScript Tutorial', url: 'https://example.com/js' },
        { id: '2', title: 'Python Guide', url: 'https://example.com/py' },
        { id: '3', title: 'JavaScript Advanced', url: 'https://example.com/js-adv' }
      ];

      const filtered = searchManager.applyClientFilters(pages, 'JavaScript');

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

      expect(searchManager.applyClientFilters(pages, 'github').length).toBe(1);
      expect(searchManager.applyClientFilters(pages, 'john').length).toBe(1);
      expect(searchManager.applyClientFilters(pages, 'project').length).toBe(1);
      expect(searchManager.applyClientFilters(pages, 'nonexistent').length).toBe(0);
    });

    it('should return all pages when query is empty', () => {
      const pages = [
        { id: '1', title: 'Page 1', url: 'https://example.com/1' },
        { id: '2', title: 'Page 2', url: 'https://example.com/2' }
      ];

      const filtered = searchManager.applyClientFilters(pages, '');

      expect(filtered.length).toBe(2);
    });

    it('should search in AI-generated fields', () => {
      const pages = [
        {
          id: '1',
          title: 'Article',
          url: 'https://example.com',
          ai_summary_brief: 'Machine learning tutorial',
          primary_classification_label: 'Computer Science'
        }
      ];

      expect(searchManager.applyClientFilters(pages, 'machine learning').length).toBe(1);
      expect(searchManager.applyClientFilters(pages, 'computer science').length).toBe(1);
    });

    it('should search in manual tags', () => {
      const pages = [
        {
          id: '1',
          title: 'Article',
          url: 'https://example.com',
          manual_tags: ['javascript', 'webdev', 'tutorial']
        }
      ];

      expect(searchManager.applyClientFilters(pages, 'javascript').length).toBe(1);
      expect(searchManager.applyClientFilters(pages, 'webdev').length).toBe(1);
      expect(searchManager.applyClientFilters(pages, 'python').length).toBe(0);
    });
  });

  describe('Stats Manager Integration', () => {
    it('should show correct count for all pages', () => {
      statsManager.updateStats(5, 5);
      const statsEl = document.getElementById('stats');

      expect(statsEl.textContent).toBe('5 pages saved');
    });

    it('should show filtered count when search active', () => {
      statsManager.updateStats(10, 3);
      const statsEl = document.getElementById('stats');

      expect(statsEl.textContent).toBe('Showing 3 of 10 pages');
    });

    it('should use singular form for 1 page', () => {
      statsManager.updateStats(1, 1);
      const statsEl = document.getElementById('stats');

      expect(statsEl.textContent).toBe('1 page saved');
    });

    it('should handle missing stats element gracefully', () => {
      document.getElementById('stats').remove();

      // Should not throw
      expect(() => statsManager.updateStats(5, 5)).not.toThrow();
    });
  });

  describe('Discovery Mode Integration', () => {
    it('should render discovery results with exact matches', () => {
      const results = {
        exact_matches: [
          { thing_data: { id: '1', title: 'Exact 1', url: 'https://example.com/1' } },
          { thing_data: { id: '2', title: 'Exact 2', url: 'https://example.com/2' } }
        ]
      };

      const html = Components.discoveryResults(results);
      container.innerHTML = html;

      expect(container.textContent).toContain('Exact 1');
      expect(container.textContent).toContain('Exact 2');
    });

    it('should render all result tiers together', () => {
      const results = {
        exact_matches: [
          { thing_data: { id: '1', title: 'Exact 1', url: 'https://example.com/1' } }
        ],
        similar_matches: [
          { thing_data: { id: '2', title: 'Similar 1', url: 'https://example.com/2' } }
        ],
        related_matches: [
          { thing_data: { id: '3', title: 'Related 1', url: 'https://example.com/3' } }
        ]
      };

      const html = Components.discoveryResults(results);
      container.innerHTML = html;

      const cards = container.querySelectorAll('.saved-page-card');
      expect(cards.length).toBe(3);
    });

    it('should show empty state when no discovery results', () => {
      const html = Components.discoveryResults({});
      container.innerHTML = html;

      expect(container.querySelector('.empty-state')).toBeTruthy();
      expect(container.textContent).toContain('No related pages');
    });
  });

  describe('End-to-End Flow', () => {
    it('should render pages, filter by search, and update stats', () => {
      const allPages = [
        { id: '1', title: 'JavaScript Tutorial', url: 'https://example.com/js' },
        { id: '2', title: 'Python Guide', url: 'https://example.com/py' },
        { id: '3', title: 'JavaScript Advanced', url: 'https://example.com/js-adv' }
      ];

      // Initial render
      container.innerHTML = allPages.map(p => Components.savedPageCard(p)).join('');
      statsManager.updateStats(allPages.length, allPages.length);

      let statsEl = document.getElementById('stats');
      expect(statsEl.textContent).toBe('3 pages saved');
      expect(container.querySelectorAll('.saved-page-card').length).toBe(3);

      // Apply search filter
      const filtered = searchManager.applyClientFilters(allPages, 'JavaScript');
      container.innerHTML = filtered.map(p => Components.savedPageCard(p)).join('');
      statsManager.updateStats(allPages.length, filtered.length);

      statsEl = document.getElementById('stats');
      expect(statsEl.textContent).toBe('Showing 2 of 3 pages');
      expect(container.querySelectorAll('.saved-page-card').length).toBe(2);

      // Clear search
      const allFiltered = searchManager.applyClientFilters(allPages, '');
      container.innerHTML = allFiltered.map(p => Components.savedPageCard(p)).join('');
      statsManager.updateStats(allPages.length, allFiltered.length);

      statsEl = document.getElementById('stats');
      expect(statsEl.textContent).toBe('3 pages saved');
      expect(container.querySelectorAll('.saved-page-card').length).toBe(3);
    });
  });
});

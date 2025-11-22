import { vi } from 'vitest';

/**
 * Test fixture factory for creating mock dashboard objects
 * Reduces duplication and complexity in PageLoaderManager tests
 */
export function createMockDashboard(overrides = {}) {
  const defaults = {
    allPages: [],
    pages: [],
    totalPages: 0,
    hasMorePages: false,
    nextCursor: null,
    isLoadingMore: false,
    currentFilter: {
      limit: 50,
      offset: 0
    },
    showError: vi.fn(),
    render: vi.fn(),
    updateStats: vi.fn(),
    getCurrentUser: vi.fn(() => ({ email: 'test@example.com' })),
    handleTagClick: vi.fn(),
    tagInteractionManager: {
      getActiveLabel: vi.fn(() => null),
      getActiveType: vi.fn(() => null)
    },
    scrollManager: {
      showLoadingIndicator: vi.fn(),
      hideLoadingIndicator: vi.fn()
    }
  };

  // Deep merge overrides with defaults
  return {
    ...defaults,
    ...overrides,
    currentFilter: {
      ...defaults.currentFilter,
      ...(overrides.currentFilter || {})
    },
    tagInteractionManager: {
      ...defaults.tagInteractionManager,
      ...(overrides.tagInteractionManager || {})
    },
    scrollManager: {
      ...defaults.scrollManager,
      ...(overrides.scrollManager || {})
    }
  };
}

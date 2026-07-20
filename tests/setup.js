// Global test setup
import { vi } from 'vitest';

// Mock session-store centrally so api/background tests can control auth state.
// Individual tests override these via the imported mock functions.
vi.mock('../src/session-store.js', () => ({
  getSessionToken: vi.fn(async () => 'token'),
  getCurrentUserId: vi.fn(async () => 'user123'),
  getCurrentUser: vi.fn(async () => ({ uid: 'user123', email: 'test@example.com' })),
  setSession: vi.fn(async () => {}),
  clearSession: vi.fn(async () => {})
}));

import '../src/cache-manager.js';
import '../src/api-core.js';
import '../src/api-pages.js';
import '../src/api-search.js';

// Mock browser API
global.browser = {
  runtime: {
    getManifest: vi.fn(() => ({
      version: '0.13.4',
      name: "Newtab Bookmarks"
    })),
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn()
    }
  },
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
      clear: vi.fn()
    }
  },
  identity: {
    getRedirectURL: vi.fn(() => 'https://extension-id.extensions.allizom.org/'),
    launchWebAuthFlow: vi.fn()
  },
  action: {
    onClicked: {
      addListener: vi.fn()
    }
  },
  notifications: {
    create: vi.fn()
  }
};

// Mock CONFIG
global.CONFIG = {
  cloudFunctionUrl: 'https://test-function.run.app',
  oauthClientId: 'test-client-id'
};

// Mock fetch
global.fetch = vi.fn();

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
});

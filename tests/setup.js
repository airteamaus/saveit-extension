// Global test setup
import { vi } from 'vitest';

// Mock browser API
global.browser = {
  runtime: {
    getManifest: vi.fn(() => ({
      version: '0.13.4',
      name: 'SaveIt'
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

// Mock Firebase
global.window = global.window || {};
global.window.firebaseReady = Promise.resolve();
global.window.firebaseAuth = null;
global.window.firebaseOnAuthStateChanged = vi.fn();
global.window.firebaseGetIdToken = vi.fn();
global.window.firebaseSignOut = vi.fn();

// Mock CONFIG
global.CONFIG = {
  cloudFunctionUrl: 'https://test-function.run.app',
  oauthClientId: 'test-client-id',
  firebase: {
    apiKey: 'test-api-key',
    authDomain: 'test.firebaseapp.com',
    projectId: 'test-project'
  }
};

// Mock fetch
global.fetch = vi.fn();

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
});

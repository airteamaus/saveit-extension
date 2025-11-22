import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('API - Mode Detection', () => {
  let API;
  let originalWindow;

  beforeEach(async () => {
    // Save original window state
    originalWindow = { ...global.window };

    // Set up minimal global environment
    global.window = {
      firebaseAuth: null,
      firebaseReady: null,
      firebaseGetIdToken: null,
      SentryHelpers: null
    };

    // Mock CONFIG
    global.CONFIG = {
      cloudFunctionUrl: 'https://test-function.run.app'
    };

    // Mock global functions from config-loader
    global.getBrowserRuntime = vi.fn(() => null);
    global.getStorageAPI = vi.fn(() => null);

    // Load API module
    const apiModule = await import('../../../src/api.js');
    API = apiModule.API;
  });

  afterEach(() => {
    // Restore original window
    global.window = originalWindow;
    vi.clearAllMocks();
  });

  it('should detect standalone mode when browser runtime is null', () => {
    global.getBrowserRuntime = vi.fn(() => null);
    global.getStorageAPI = vi.fn(() => null);

    expect(API.isExtension).toBe(false);
  });

  it('should detect extension mode when browser runtime exists', () => {
    global.getBrowserRuntime = vi.fn(() => ({ id: 'test-extension' }));
    global.getStorageAPI = vi.fn(() => ({ local: {} }));

    expect(API.isExtension).toBe(true);
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApiTestHarness } from './test-api-harness.js';

describe('API - Mode Detection', () => {
  let API;
  let harness;
  let originalWindow;

  beforeEach(() => {
    // Save original window state
    originalWindow = { ...global.window };

    // Set up minimal global environment
    global.window = {
      firebaseAuth: null,
      firebaseReady: null,
      firebaseGetIdToken: null,
      SentryHelpers: null
    };

    harness = createApiTestHarness({ cloudFunctionUrl: 'https://test-function.run.app' });
    harness.setStandaloneMode();
    API = harness.API;
  });

  afterEach(() => {
    // Restore original window
    global.window = originalWindow;
    vi.clearAllMocks();
  });

  it('should detect standalone mode when browser runtime is null', () => {
    harness.setStandaloneMode();

    expect(API.isExtension).toBe(false);
  });

  it('should detect extension mode when browser runtime exists', () => {
    harness.setExtensionMode({ local: {} }, { id: 'test-extension' });

    expect(API.isExtension).toBe(true);
  });
});

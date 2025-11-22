import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('API', () => {
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
    const apiModule = await import('../../src/api.js');
    API = apiModule.API;
  });

  afterEach(() => {
    // Restore original window
    global.window = originalWindow;
    vi.clearAllMocks();
  });

  describe('Mode Detection', () => {
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

  describe('Error Parsing', () => {
    it('should parse JSON error response', async () => {
      const mockResponse = {
        status: 400,
        json: vi.fn(async () => ({ error: 'Invalid request' }))
      };

      const error = await API.parseErrorResponse(mockResponse);
      expect(error).toBe('Invalid request');
    });

    it('should parse JSON message field', async () => {
      const mockResponse = {
        status: 500,
        json: vi.fn(async () => ({ message: 'Internal server error' }))
      };

      const error = await API.parseErrorResponse(mockResponse);
      expect(error).toBe('Internal server error');
    });

    it('should fall back to status text when JSON parsing fails', async () => {
      const mockResponse = {
        status: 404,
        statusText: 'Not Found',
        json: vi.fn(async () => { throw new Error('Invalid JSON'); })
      };

      const error = await API.parseErrorResponse(mockResponse);
      expect(error).toBe('Not Found');
    });

    it('should use HTTP status code when statusText is empty', async () => {
      const mockResponse = {
        status: 503,
        statusText: '',
        json: vi.fn(async () => { throw new Error('Invalid JSON'); })
      };

      const error = await API.parseErrorResponse(mockResponse);
      expect(error).toBe('HTTP 503');
    });
  });

  describe('Tag Extraction', () => {
    it('should extract tags from classifications', () => {
      const page = {
        classifications: [
          { type: 'general', label: 'Computer Science' },
          { type: 'domain', label: 'Web Development' }
        ]
      };

      const tags = API._getPageTags(page);
      expect(tags).toEqual(['Computer Science', 'Web Development']);
    });

    it('should extract primary classification label', () => {
      const page = {
        primary_classification_label: 'Technology'
      };

      const tags = API._getPageTags(page);
      expect(tags).toEqual(['Technology']);
    });

    it('should extract manual tags', () => {
      const page = {
        manual_tags: ['javascript', 'webdev', 'tutorial']
      };

      const tags = API._getPageTags(page);
      expect(tags).toEqual(['javascript', 'webdev', 'tutorial']);
    });

    it('should extract all tag types together', () => {
      const page = {
        classifications: [
          { type: 'general', label: 'Computer Science' }
        ],
        primary_classification_label: 'Technology',
        manual_tags: ['javascript']
      };

      const tags = API._getPageTags(page);
      expect(tags).toEqual(['Computer Science', 'Technology', 'javascript']);
    });

    it('should convert tags to lowercase when requested', () => {
      const page = {
        classifications: [
          { type: 'general', label: 'Computer Science' }
        ],
        manual_tags: ['JavaScript']
      };

      const tags = API._getPageTags(page, true);
      expect(tags).toEqual(['computer science', 'javascript']);
    });

    it('should return empty array when no tags exist', () => {
      const page = {};
      const tags = API._getPageTags(page);
      expect(tags).toEqual([]);
    });
  });

  describe('Firebase ID Token', () => {
    it('should return null in standalone mode', async () => {
      global.getBrowserRuntime = vi.fn(() => null);

      const token = await API.getIdToken();
      expect(token).toBeNull();
    });

    it('should throw error when Firebase not initialized', async () => {
      global.getBrowserRuntime = vi.fn(() => ({ id: 'test' }));
      global.getStorageAPI = vi.fn(() => ({ local: {} }));
      global.window.firebaseAuth = null;

      await expect(API.getIdToken()).rejects.toThrow('Firebase not initialized');
    });

    it('should throw error when no user signed in', async () => {
      global.getBrowserRuntime = vi.fn(() => ({ id: 'test' }));
      global.getStorageAPI = vi.fn(() => ({ local: {} }));
      global.window.firebaseAuth = { currentUser: null };

      await expect(API.getIdToken()).rejects.toThrow('No user signed in');
    });

    it('should throw error when getIdToken not available', async () => {
      global.getBrowserRuntime = vi.fn(() => ({ id: 'test' }));
      global.getStorageAPI = vi.fn(() => ({ local: {} }));
      global.window.firebaseAuth = { currentUser: { uid: 'user123' } };
      global.window.firebaseGetIdToken = null;

      await expect(API.getIdToken()).rejects.toThrow('getIdToken not available');
    });

    it('should return token when user is signed in', async () => {
      global.getBrowserRuntime = vi.fn(() => ({ id: 'test' }));
      global.getStorageAPI = vi.fn(() => ({ local: {} }));
      const mockUser = { uid: 'user123' };
      global.window.firebaseAuth = { currentUser: mockUser };
      global.window.firebaseGetIdToken = vi.fn(async () => 'mock-id-token');

      const token = await API.getIdToken();
      expect(token).toBe('mock-id-token');
      expect(global.window.firebaseGetIdToken).toHaveBeenCalledWith(mockUser);
    });

    it('should wait for Firebase ready promise', async () => {
      global.getBrowserRuntime = vi.fn(() => ({ id: 'test' }));
      global.getStorageAPI = vi.fn(() => ({ local: {} }));

      let resolveReady;
      global.window.firebaseReady = new Promise(resolve => {
        resolveReady = resolve;
      });

      const mockUser = { uid: 'user123' };
      global.window.firebaseAuth = { currentUser: mockUser };
      global.window.firebaseGetIdToken = vi.fn(async () => 'mock-token');

      // Start getIdToken (will wait for firebaseReady)
      const tokenPromise = API.getIdToken();

      // Resolve Firebase ready
      setTimeout(() => resolveReady(), 10);

      const token = await tokenPromise;
      expect(token).toBe('mock-token');
    });
  });

  describe('Current User ID', () => {
    it('should return null in standalone mode', () => {
      global.getBrowserRuntime = vi.fn(() => null);

      const userId = API.getCurrentUserId();
      expect(userId).toBeNull();
    });

    it('should return null when firebaseAuth not initialized', () => {
      global.getBrowserRuntime = vi.fn(() => ({ id: 'test' }));
      global.getStorageAPI = vi.fn(() => ({ local: {} }));
      global.window.firebaseAuth = null;

      const userId = API.getCurrentUserId();
      expect(userId).toBeNull();
    });

    it('should return null when no user signed in', () => {
      global.getBrowserRuntime = vi.fn(() => ({ id: 'test' }));
      global.getStorageAPI = vi.fn(() => ({ local: {} }));
      global.window.firebaseAuth = { currentUser: null };

      const userId = API.getCurrentUserId();
      expect(userId).toBeNull();
    });

    it('should return user ID when user is signed in', () => {
      global.getBrowserRuntime = vi.fn(() => ({ id: 'test' }));
      global.getStorageAPI = vi.fn(() => ({ local: {} }));
      global.window.firebaseAuth = {
        currentUser: { uid: 'user-123-abc' }
      };

      const userId = API.getCurrentUserId();
      expect(userId).toBe('user-123-abc');
    });
  });

  describe('Storage API', () => {
    it('should return storage API from config-loader', () => {
      const mockStorage = { local: {}, sync: {} };
      global.getStorageAPI = vi.fn(() => mockStorage);

      const storage = API.getStorage();
      expect(storage).toBe(mockStorage);
      expect(global.getStorageAPI).toHaveBeenCalled();
    });

    it('should return null when storage not available', () => {
      global.getStorageAPI = vi.fn(() => null);

      const storage = API.getStorage();
      expect(storage).toBeNull();
    });
  });

  describe('Cache Operations', () => {
    it('should return null for getCachedPages in standalone mode', async () => {
      global.getBrowserRuntime = vi.fn(() => null);

      const cached = await API.getCachedPages();
      expect(cached).toBeNull();
    });

    it('should do nothing for setCachedPages in standalone mode', async () => {
      global.getBrowserRuntime = vi.fn(() => null);

      // Should not throw
      await expect(API.setCachedPages({ pages: [] })).resolves.toBeUndefined();
    });

    it('should do nothing for invalidateCache in standalone mode', async () => {
      global.getBrowserRuntime = vi.fn(() => null);

      // Should not throw
      await expect(API.invalidateCache()).resolves.toBeUndefined();
    });
  });

  describe('Error Handling Wrapper', () => {
    it('should execute operation successfully', async () => {
      const mockOperation = vi.fn(async () => 'success');

      const result = await API._executeWithErrorHandling(
        mockOperation,
        'testContext'
      );

      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalled();
    });

    it('should catch and re-throw errors', async () => {
      const mockError = new Error('Test error');
      const mockOperation = vi.fn(async () => { throw mockError; });

      await expect(
        API._executeWithErrorHandling(mockOperation, 'testContext')
      ).rejects.toThrow('Test error');
    });

    it('should log errors to console', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const mockError = new Error('Test error');
      const mockOperation = vi.fn(async () => { throw mockError; });

      try {
        await API._executeWithErrorHandling(mockOperation, 'testContext');
      } catch {
        // Expected
      }

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[testContext] Error:',
        mockError
      );

      consoleErrorSpy.mockRestore();
    });

    it('should capture errors with Sentry when available', async () => {
      const mockCaptureError = vi.fn();
      global.window.SentryHelpers = { captureError: mockCaptureError };

      const mockError = new Error('Test error');
      const mockOperation = vi.fn(async () => { throw mockError; });

      try {
        await API._executeWithErrorHandling(
          mockOperation,
          'testContext',
          { extra: 'metadata' }
        );
      } catch {
        // Expected
      }

      expect(mockCaptureError).toHaveBeenCalledWith(mockError, {
        context: 'testContext',
        extra: 'metadata'
      });
    });
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('API - Firebase Authentication', () => {
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

  describe('getIdToken', () => {
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

  describe('getCurrentUserId', () => {
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

  describe('getStorage', () => {
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
});

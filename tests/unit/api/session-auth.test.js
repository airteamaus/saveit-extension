import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApiTestHarness } from './test-api-harness.js';
import {
  getSessionToken,
  getCurrentUserId
} from '../../../src/session-store.js';

describe('API - Session Authentication', () => {
  let API;
  let harness;

  beforeEach(() => {
    harness = createApiTestHarness({ cloudFunctionUrl: 'https://test-function.run.app' });
    harness.setStandaloneMode();
    API = harness.API;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getIdToken', () => {
    it('should return null in standalone mode', async () => {
      harness.setStandaloneMode();

      const token = await API.getIdToken();
      expect(token).toBeNull();
    });

    it('should throw when no session token is stored', async () => {
      harness.setExtensionMode({ local: {} }, { id: 'test' });
      getSessionToken.mockResolvedValue(null);

      await expect(API.getIdToken()).rejects.toThrow('No session token. Please sign in.');
    });

    it('should return the session token when one is stored', async () => {
      harness.setExtensionMode({ local: {} }, { id: 'test' });
      getSessionToken.mockResolvedValue('opaque-session-token');

      const token = await API.getIdToken();
      expect(token).toBe('opaque-session-token');
    });
  });

  describe('getCurrentUserId', () => {
    it('should return null in standalone mode', async () => {
      harness.setStandaloneMode();

      const userId = await API.getCurrentUserId();
      expect(userId).toBeNull();
    });

    it('should return null when no session uid is stored', async () => {
      harness.setExtensionMode({ local: {} }, { id: 'test' });
      getCurrentUserId.mockResolvedValue(null);

      const userId = await API.getCurrentUserId();
      expect(userId).toBeNull();
    });

    it('should return the session uid when a user is signed in', async () => {
      harness.setExtensionMode({ local: {} }, { id: 'test' });
      getCurrentUserId.mockResolvedValue('user-123-abc');

      const userId = await API.getCurrentUserId();
      expect(userId).toBe('user-123-abc');
    });
  });

  describe('getStorage', () => {
    it('should return storage API from config-loader', () => {
      const mockStorage = { local: {}, sync: {} };
      harness.setStorageApi(mockStorage);

      const storage = API.getStorage();
      expect(storage).toBe(mockStorage);
      expect(harness.getStorageAPI).toHaveBeenCalled();
    });

    it('should return null when storage not available', () => {
      harness.setStorageApi(null);

      const storage = API.getStorage();
      expect(storage).toBeNull();
    });
  });
});

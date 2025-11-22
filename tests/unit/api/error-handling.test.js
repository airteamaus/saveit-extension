import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('API - Error Handling', () => {
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

  describe('parseErrorResponse', () => {
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

  describe('_executeWithErrorHandling', () => {
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

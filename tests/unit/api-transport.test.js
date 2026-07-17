import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { requestWithAuth, buildRequestUrl } from '../../src/api-transport.js';

// Tests for the single authenticated-fetch implementation shared by the API
// facade (api-core.js) and the background service worker (background.js).
// Previously these two paths each inlined their own URL/header/fetch/error/
// rotation logic; this module is the consolidation.
describe('api-transport', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('buildRequestUrl', () => {
    it('resolves a relative path against baseUrl', () => {
      expect(buildRequestUrl({ url: '/projects', baseUrl: 'https://api.test' }))
        .toBe('https://api.test/projects');
    });

    it('uses an absolute url verbatim', () => {
      expect(buildRequestUrl({ url: 'https://other.test/x', baseUrl: 'https://api.test' }))
        .toBe('https://other.test/x');
    });

    it('appends plain-object params as a query string', () => {
      expect(buildRequestUrl({ url: '/p', baseUrl: 'https://api.test', params: { a: 1, b: 'two' } }))
        .toBe('https://api.test/p?a=1&b=two');
    });

    it('drops null and undefined params', () => {
      // new URLSearchParams({k:null}) would throw — the filter exists for this.
      expect(buildRequestUrl({ url: '/p', baseUrl: 'https://api.test', params: { a: null, b: undefined, c: 1 } }))
        .toBe('https://api.test/p?c=1');
    });

    it('accepts a URLSearchParams instance unchanged', () => {
      const sp = new URLSearchParams({ key: 'value' });
      expect(buildRequestUrl({ url: '/p', baseUrl: 'https://api.test', params: sp }))
        .toBe('https://api.test/p?key=value');
    });

    it('omits the ? when params produce an empty string', () => {
      expect(buildRequestUrl({ url: '/p', baseUrl: 'https://api.test', params: {} }))
        .toBe('https://api.test/p');
    });
  });

  describe('requestWithAuth', () => {
    function makeResponse({ ok = true, status = 200, json = async () => ({}) } = {}) {
      return { ok, status, headers: new Map(), json };
    }

    it('sets the Authorization header from getIdToken', async () => {
      const fetchMock = vi.fn(async () => makeResponse());
      global.fetch = fetchMock;

      await requestWithAuth({
        url: '/x', baseUrl: 'https://api.test',
        getIdToken: async () => 'abc123'
      });

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.test/x',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer abc123' })
        })
      );
    });

    it('omits Authorization when getIdToken returns null (anonymous caller)', async () => {
      const fetchMock = vi.fn(async () => makeResponse());
      global.fetch = fetchMock;

      await requestWithAuth({
        url: '/x', baseUrl: 'https://api.test',
        getIdToken: async () => null
      });

      const [, init] = fetchMock.mock.calls[0];
      expect(init.headers).not.toHaveProperty('Authorization');
    });

    it('sets Content-Type and passes body through verbatim when body is present', async () => {
      const fetchMock = vi.fn(async () => makeResponse());
      global.fetch = fetchMock;
      const body = JSON.stringify({ a: 1 });

      await requestWithAuth({
        url: '/x', baseUrl: 'https://api.test',
        method: 'POST', body,
        getIdToken: async () => 'tok'
      });

      const [, init] = fetchMock.mock.calls[0];
      expect(init.body).toBe(body); // not re-serialized
      expect(init.headers['Content-Type']).toBe('application/json');
    });

    it('does not set a body when body is undefined', async () => {
      const fetchMock = vi.fn(async () => makeResponse());
      global.fetch = fetchMock;

      await requestWithAuth({
        url: '/x', baseUrl: 'https://api.test',
        getIdToken: async () => 'tok'
      });

      const [, init] = fetchMock.mock.calls[0];
      expect(init).not.toHaveProperty('body');
      expect(init.headers).not.toHaveProperty('Content-Type');
    });

    it('lets caller headers override Content-Type', async () => {
      const fetchMock = vi.fn(async () => makeResponse());
      global.fetch = fetchMock;

      await requestWithAuth({
        url: '/x', baseUrl: 'https://api.test',
        method: 'POST', body: '{}',
        headers: { 'Content-Type': 'text/plain' },
        getIdToken: async () => 'tok'
      });

      const [, init] = fetchMock.mock.calls[0];
      expect(init.headers['Content-Type']).toBe('text/plain');
    });

    it('throws with .status attached on a non-ok response, using parseError', async () => {
      global.fetch = vi.fn(async () => makeResponse({ ok: false, status: 404 }));

      await expect(requestWithAuth({
        url: '/x', baseUrl: 'https://api.test',
        getIdToken: async () => 'tok',
        parseError: async () => 'Not found'
      })).rejects.toMatchObject({ message: 'Not found', status: 404 });
    });

    it('falls back to an HTTP-status message when no parseError is given', async () => {
      global.fetch = vi.fn(async () => makeResponse({ ok: false, status: 500 }));

      await expect(requestWithAuth({
        url: '/x', baseUrl: 'https://api.test',
        getIdToken: async () => 'tok'
      })).rejects.toThrow('HTTP 500');
    });

    it('invokes onRotation with the successful response', async () => {
      const response = makeResponse();
      global.fetch = vi.fn(async () => response);
      const onRotation = vi.fn(async () => {});

      await requestWithAuth({
        url: '/x', baseUrl: 'https://api.test',
        getIdToken: async () => 'tok',
        onRotation
      });

      expect(onRotation).toHaveBeenCalledWith(response);
    });

    it('does not invoke onRotation on a failed request (it throws first)', async () => {
      global.fetch = vi.fn(async () => makeResponse({ ok: false, status: 500 }));
      const onRotation = vi.fn();

      await expect(requestWithAuth({
        url: '/x', baseUrl: 'https://api.test',
        getIdToken: async () => 'tok',
        onRotation
      })).rejects.toThrow();

      expect(onRotation).not.toHaveBeenCalled();
    });

    it('returns the raw Response for the caller to decode', async () => {
      const response = makeResponse({ json: async () => ({ ok: true }) });
      global.fetch = vi.fn(async () => response);

      const result = await requestWithAuth({
        url: '/x', baseUrl: 'https://api.test',
        getIdToken: async () => 'tok'
      });

      expect(result).toBe(response);
      expect(await result.json()).toEqual({ ok: true });
    });
  });
});

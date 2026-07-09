import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// capturePageContent is the only place that touches chrome.scripting. It uses
// a two-call executeScript sequence: (1) files:['src/bundles/capture-bundle.js']
// to define globalThis.__saveitCapture (real Readability via buildClientObject)
// in the page's ISOLATED world, then (2) func to invoke it on `document`. It
// must never throw — on any failure it returns a failure-shape object so
// savePageFromTab always proceeds in basic mode. The mock below replaces
// executeScript with canned results per call.
describe('capturePageContent', () => {
  let originalBrowser;

  beforeEach(() => {
    originalBrowser = globalThis.browser;
  });

  afterEach(() => {
    if (originalBrowser === undefined) {
      delete globalThis.browser;
    } else {
      globalThis.browser = originalBrowser;
    }
  });

  it('injects the bundle file then invokes the global, returning the client object', async () => {
    const capturedClient = {
      title: 'Real Title', content: 'body', capture_method: 'readability'
    };
    const executeScript = vi.fn();
    // First call: files injection just defines the global (no result).
    executeScript.mockResolvedValueOnce([{ result: undefined }]);
    // Second call: func invocation returns the client object.
    executeScript.mockResolvedValueOnce([{ result: capturedClient }]);
    globalThis.browser = { scripting: { executeScript } };

    const { capturePageContent } = await import('../../src/page-capture-injector.js');
    const result = await capturePageContent(42);

    // Exactly two calls — bundle file injection, then the func invocation.
    expect(executeScript).toHaveBeenCalledTimes(2);

    // First call: bundle file in the ISOLATED world.
    expect(executeScript).toHaveBeenNthCalledWith(1, expect.objectContaining({
      target: { tabId: 42 },
      world: 'ISOLATED',
      files: ['src/bundles/capture-bundle.js']
    }));
    // Second call: serialization-safe func in the ISOLATED world.
    expect(executeScript).toHaveBeenNthCalledWith(2, expect.objectContaining({
      target: { tabId: 42 },
      world: 'ISOLATED',
      func: expect.any(Function)
    }));

    // The final return is the client object from the second call.
    expect(result).toEqual(capturedClient);
  });

  it('returns a failure-shape when the bundle-file injection throws (chrome:// page)', async () => {
    // The throw can come from either call — here the first (files) call throws,
    // which is the common case (chrome://, about:, crashed tab, CSP).
    const executeScript = vi.fn(async () => {
      throw new Error('Cannot access contents of the page');
    });
    globalThis.browser = { scripting: { executeScript } };

    const { capturePageContent } = await import('../../src/page-capture-injector.js');
    const result = await capturePageContent(99);

    // Only the first call ran before failing.
    expect(executeScript).toHaveBeenCalledTimes(1);
    // The failure shape must keep every field the server expects from the
    // client object so savePageFromTab can merge it without shape checks.
    expect(result.capture_method).toBe('none');
    expect(result.content).toBeNull();
    expect(result).toEqual(expect.objectContaining({
      title: '',
      description: '',
      content: null,
      excerpt: null,
      byline: null,
      site_name: null,
      image: null,
      published_time: null,
      lang: null,
      captured_at: expect.any(String),
      capture_method: 'none',
      capture_error: expect.any(String)
    }));
  });

  it('returns a failure-shape when the second (func) call throws', async () => {
    // Bundle file injection succeeds (defines the global), but the invocation
    // call throws — e.g. CSP revoked between calls, or the global is missing.
    const executeScript = vi.fn();
    executeScript.mockResolvedValueOnce([{ result: undefined }]);
    executeScript.mockRejectedValueOnce(new Error('global not defined'));
    globalThis.browser = { scripting: { executeScript } };

    const { capturePageContent } = await import('../../src/page-capture-injector.js');
    const result = await capturePageContent(8);

    expect(executeScript).toHaveBeenCalledTimes(2);
    expect(result.capture_method).toBe('none');
    expect(result.content).toBeNull();
    expect(result.capture_error).toBe('global not defined');
  });

  it('returns failure-shape when the scripting API is unavailable', async () => {
    // e.g. an environment where chrome.scripting is missing — must not throw.
    globalThis.browser = {};

    const { capturePageContent } = await import('../../src/page-capture-injector.js');
    const result = await capturePageContent(7);

    expect(result.capture_method).toBe('none');
    expect(result.content).toBeNull();
  });

  it('returns failure-shape when the second call yields no result', async () => {
    // Edge case: the func invocation resolves but with an empty/missing result
    // (e.g. __saveitCapture returned undefined). Must not throw and must
    // surface as a 'none' capture, not a crash.
    const executeScript = vi.fn();
    executeScript.mockResolvedValueOnce([{ result: undefined }]); // files injection
    executeScript.mockResolvedValueOnce([]); // func invocation yields nothing
    globalThis.browser = { scripting: { executeScript } };

    const { capturePageContent } = await import('../../src/page-capture-injector.js');
    const result = await capturePageContent(5);

    expect(executeScript).toHaveBeenCalledTimes(2);
    expect(result.capture_method).toBe('none');
    expect(result.content).toBeNull();
    expect(result.capture_error).toBe('no result from injection');
  });
});

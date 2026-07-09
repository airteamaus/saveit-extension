import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// capturePageContent is the only place that touches chrome.scripting. It must
// never throw — on any failure it returns a failure-shape object so savePageFromTab
// always proceeds in basic mode. The mock below replaces chrome.scripting.executeScript
// with a canned result, so these tests are agnostic to whether injection is done
// via `func` or `files` — they only verify the contract.
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

  it('returns the client object when executeScript succeeds', async () => {
    const capturedClient = {
      title: 'Real Title', content: 'body', capture_method: 'readability'
    };
    globalThis.browser = {
      scripting: {
        executeScript: vi.fn(async () => [{ result: capturedClient }])
      }
    };

    const { capturePageContent } = await import('../../src/page-capture-injector.js');
    const result = await capturePageContent(42);

    expect(globalThis.browser.scripting.executeScript).toHaveBeenCalledWith(expect.objectContaining({
      target: { tabId: 42 },
      world: 'ISOLATED'
    }));
    expect(result).toEqual(capturedClient);
  });

  it('returns a failure-shape object when executeScript throws (chrome:// page)', async () => {
    globalThis.browser = {
      scripting: {
        executeScript: vi.fn(async () => {
          throw new Error('Cannot access contents of the page');
        })
      }
    };

    const { capturePageContent } = await import('../../src/page-capture-injector.js');
    const result = await capturePageContent(99);

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

  it('returns failure-shape when the scripting API is unavailable', async () => {
    // e.g. an environment where chrome.scripting is missing — must not throw.
    globalThis.browser = {};

    const { capturePageContent } = await import('../../src/page-capture-injector.js');
    const result = await capturePageContent(7);

    expect(result.capture_method).toBe('none');
    expect(result.content).toBeNull();
  });

  it('returns failure-shape when executeScript yields no result', async () => {
    // Edge case: executeScript resolves but with an empty/missing result
    // (e.g. the injected function returned undefined). Must not throw and
    // must surface as a 'none' capture, not a crash.
    globalThis.browser = {
      scripting: {
        executeScript: vi.fn(async () => [])
      }
    };

    const { capturePageContent } = await import('../../src/page-capture-injector.js');
    const result = await capturePageContent(5);

    expect(result.capture_method).toBe('none');
    expect(result.content).toBeNull();
  });
});

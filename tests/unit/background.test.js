import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('background startup', () => {
  let originalBrowser;
  let originalChrome;

  beforeEach(() => {
    originalBrowser = globalThis.browser;
    originalChrome = globalThis.chrome;
  });

  afterEach(() => {
    if (originalBrowser === undefined) {
      delete globalThis.browser;
    } else {
      globalThis.browser = originalBrowser;
    }

    if (originalChrome === undefined) {
      delete globalThis.chrome;
    } else {
      globalThis.chrome = originalChrome;
    }
  });

  it('registers background listeners when only the chrome runtime global is available', async () => {
    delete globalThis.browser;

    const onMessageAddListener = vi.fn();
    const onClickedAddListener = vi.fn();

    globalThis.chrome = {
      runtime: {
        id: 'test-extension',
        getManifest: vi.fn(() => ({
          version: '1.9.3',
          name: 'SaveIt'
        })),
        onMessage: {
          addListener: onMessageAddListener
        }
      },
      action: {
        onClicked: {
          addListener: onClickedAddListener
        },
        setBadgeText: vi.fn(),
        setBadgeBackgroundColor: vi.fn()
      },
      identity: {
        getRedirectURL: vi.fn(() => 'https://extension-id.extensions.allizom.org/'),
        launchWebAuthFlow: vi.fn()
      },
      notifications: {
        create: vi.fn()
      },
      storage: {
        local: {
          get: vi.fn(),
          remove: vi.fn()
        }
      }
    };

    await import('../../src/background.js?chrome-only');

    expect(onMessageAddListener).toHaveBeenCalledTimes(1);
    expect(onClickedAddListener).toHaveBeenCalledTimes(1);
  });

  it('captures dashboard sign-in failures in Sentry', async () => {
    const onMessageAddListener = vi.fn();
    const onClickedAddListener = vi.fn();
    const sendResponse = vi.fn();
    const captureError = vi.fn();

    vi.resetModules();
    vi.doMock('../../src/background-auth.js', () => ({
      createBackgroundAuth: () => ({
        signIn: vi.fn().mockRejectedValue(Object.assign(new Error('OAuth popup closed'), {
          telemetryContext: {
            redirectUri: 'https://extension-id.extensions.allizom.org/',
            redirectOrigin: 'https://extension-id.extensions.allizom.org',
            redirectPath: '/',
            redirectScheme: 'https',
            hasRedirectUri: true
          }
        })),
        signOut: vi.fn()
      })
    }));
    vi.doMock('../../src/sentry.js', () => ({
      initSentry: vi.fn(),
      setUser: vi.fn(),
      setRequestId: vi.fn(),
      captureError,
      clearUser: vi.fn()
    }));

    globalThis.browser = {
      runtime: {
        id: 'test-extension',
        getManifest: vi.fn(() => ({
          version: '1.9.3',
          name: 'SaveIt'
        })),
        onMessage: {
          addListener: onMessageAddListener
        }
      },
      action: {
        onClicked: {
          addListener: onClickedAddListener
        },
        setBadgeText: vi.fn(),
        setBadgeBackgroundColor: vi.fn()
      },
      identity: {
        getRedirectURL: vi.fn(() => 'https://extension-id.extensions.allizom.org/'),
        launchWebAuthFlow: vi.fn()
      },
      notifications: {
        create: vi.fn()
      },
      storage: {
        local: {
          get: vi.fn(),
          remove: vi.fn()
        }
      }
    };

    await import('../../src/background.js?sign-in-error');

    const listener = onMessageAddListener.mock.calls[0][0];
    expect(listener({ action: 'signIn' }, {}, sendResponse)).toBe(true);

    await vi.waitFor(() => {
      expect(captureError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'OAuth popup closed' }),
        expect.objectContaining({
          context: 'sign-in',
          surface: 'dashboard',
          redirectUri: 'https://extension-id.extensions.allizom.org/'
        })
      );
      expect(sendResponse).toHaveBeenCalledWith({
        success: false,
        error: 'OAuth popup closed'
      });
    });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('background startup', () => {
  let originalBrowser;
  let originalChrome;
  let originalFetch;

  beforeEach(() => {
    originalBrowser = globalThis.browser;
    originalChrome = globalThis.chrome;
    originalFetch = globalThis.fetch;
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

    if (originalFetch === undefined) {
      delete globalThis.fetch;
    } else {
      globalThis.fetch = originalFetch;
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
          name: "Newtab Bookmarks"
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
          name: "Newtab Bookmarks"
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

  it('captures OAuth launch context before the auth callback returns', async () => {
    const onMessageAddListener = vi.fn();
    const captureMessage = vi.fn();
    const flush = vi.fn(async () => true);

    vi.resetModules();
    vi.doMock('../../src/background-auth.js', () => ({
      createBackgroundAuth: ({ telemetry }) => {
        void telemetry.captureMessage(
          'OAuth flow launched',
          {
            context: 'sign-in-start',
            redirectUri: 'https://afmecefpfkhlkadcajbaligkibkpiojf.chromiumapp.org/',
            redirectOrigin: 'https://afmecefpfkhlkadcajbaligkibkpiojf.chromiumapp.org',
            redirectPath: '/',
            redirectScheme: 'https',
            hasRedirectUri: true
          },
          'warning'
        );

        return {
          signIn: vi.fn(() => new Promise(() => {})),
          signOut: vi.fn()
        };
      }
    }));
    vi.doMock('../../src/sentry.js', () => ({
      initSentry: vi.fn(),
      setUser: vi.fn(),
      setRequestId: vi.fn(),
      captureError: vi.fn(),
      captureMessage,
      flush,
      clearUser: vi.fn()
    }));

    globalThis.browser = {
      runtime: {
        id: 'test-extension',
        getManifest: vi.fn(() => ({
          version: '1.10.1',
          name: "Newtab Bookmarks"
        })),
        onMessage: {
          addListener: onMessageAddListener
        }
      },
      action: {
        onClicked: {
          addListener: vi.fn()
        },
        setBadgeText: vi.fn(),
        setBadgeBackgroundColor: vi.fn()
      },
      identity: {
        getRedirectURL: vi.fn(() => 'https://afmecefpfkhlkadcajbaligkibkpiojf.chromiumapp.org/'),
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

    await import('../../src/background.js?oauth-start-message');

    const listener = onMessageAddListener.mock.calls[0][0];
    expect(listener({ action: 'signIn' }, {}, vi.fn())).toBe(true);

    await vi.waitFor(() => {
      expect(captureMessage).toHaveBeenCalledWith(
        'OAuth flow launched',
        expect.objectContaining({
          redirectUri: 'https://afmecefpfkhlkadcajbaligkibkpiojf.chromiumapp.org/'
        }),
        'warning'
      );
      expect(flush).toHaveBeenCalledWith(2000);
    });
  });

  it('loads toolbar projects from local cache first and refreshes in the background', async () => {
    const onMessageAddListener = vi.fn();
    const cachedProjects = [
      { id: 'project-1', name: 'Cached project', archived: false },
      { id: 'project-2', name: 'Archived project', archived: true }
    ];
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn(async () => [{ id: 'project-1', name: 'Fresh project', archived: false }])
    });

    vi.resetModules();
    vi.doMock('../../src/background-auth.js', () => {
      const auth = {
        currentUser: { uid: 'user-123' }
      };

      return {
        createBackgroundAuth: () => ({
          signIn: vi.fn(async () => ({
            user: { uid: 'user-123' },
            idToken: 'token-123'
          })),
          getAuthContext: vi.fn(async () => ({
            auth,
            authReadyPromise: Promise.resolve()
          })),
          signOut: vi.fn()
        })
      };
    });
    vi.doMock('../../src/session-store.js', () => ({
      getSessionToken: vi.fn(async () => 'token-123'),
      getCurrentUserId: vi.fn(async () => 'user-123'),
      getCurrentUser: vi.fn(async () => ({ uid: 'user-123', email: 'test@example.com' })),
      setSession: vi.fn(async () => {}),
      clearSession: vi.fn(async () => {})
    }));
    vi.doMock('../../src/sentry.js', () => ({
      initSentry: vi.fn(),
      setUser: vi.fn(),
      setRequestId: vi.fn(),
      captureError: vi.fn(),
      captureMessage: vi.fn(),
      flush: vi.fn(async () => true),
      clearUser: vi.fn()
    }));
    vi.stubGlobal('fetch', fetchMock);

    globalThis.browser = {
      runtime: {
        id: 'test-extension',
        getManifest: vi.fn(() => ({
          version: '1.10.12',
          name: "Newtab Bookmarks"
        })),
        onMessage: {
          addListener: onMessageAddListener
        }
      },
      action: {
        onClicked: {
          addListener: vi.fn()
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
          get: vi.fn(async (key) => {
            if (key === 'projects_cache_user-123_surface=projects') {
              return {
                [key]: {
                  userId: 'user-123',
                  response: cachedProjects,
                  timestamp: Date.now()
                }
              };
            }

            return {};
          }),
          set: vi.fn(async () => {}),
          remove: vi.fn()
        }
      },
      tabs: {
        query: vi.fn()
      }
    };

    await import('../../src/background.js?toolbar-projects');

    const listener = onMessageAddListener.mock.calls[0][0];
    const sendResponse = vi.fn();
    expect(listener({ action: 'getToolbarProjects' }, {}, sendResponse)).toBe(true);

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalledWith({
        success: true,
        projects: [{ id: 'project-1', name: 'Cached project', archived: false }]
      });
      expect(fetchMock).toHaveBeenCalledWith(
        'https://saveit-5pu7ljvnuq-uc.a.run.app/projects',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer token-123'
          })
        })
      );
    });
  });

  it('saves the current tab with a selected project from the popup', async () => {
    const onMessageAddListener = vi.fn();
    const onClickedAddListener = vi.fn();
    const notificationsCreate = vi.fn();
    const tabsQuery = vi.fn(async () => [{
      url: 'https://example.edu/article',
      title: 'Example article'
    }]);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn(async () => ({ success: true, request_id: 'request-123' }))
    });

    vi.resetModules();
    vi.doMock('../../src/background-auth.js', () => ({
      createBackgroundAuth: () => ({
        signIn: vi.fn(async () => ({
          user: { uid: 'user-123' },
          idToken: 'token-123'
        })),
        signOut: vi.fn()
      })
    }));
    vi.doMock('../../src/sentry.js', () => ({
      initSentry: vi.fn(),
      setUser: vi.fn(),
      setRequestId: vi.fn(),
      captureError: vi.fn(),
      captureMessage: vi.fn(),
      flush: vi.fn(async () => true),
      clearUser: vi.fn()
    }));
    vi.stubGlobal('fetch', fetchMock);

    globalThis.browser = {
      runtime: {
        id: 'test-extension',
        getManifest: vi.fn(() => ({
          version: '1.10.12',
          name: "Newtab Bookmarks"
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
        create: notificationsCreate
      },
      storage: {
        local: {
          get: vi.fn(async () => ({})),
          remove: vi.fn()
        }
      },
      tabs: {
        query: tabsQuery
      }
    };

    await import('../../src/background.js?save-current-page');

    const listener = onMessageAddListener.mock.calls[0][0];
    const sendResponse = vi.fn();
    expect(listener({ action: 'saveCurrentPage', projectId: 'project-1' }, {}, sendResponse)).toBe(true);

    await vi.waitFor(() => {
      expect(tabsQuery).toHaveBeenCalledWith({
        active: true,
        currentWindow: true
      });
      expect(fetchMock).toHaveBeenCalledWith(
        'https://saveit-5pu7ljvnuq-uc.a.run.app',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer token-123',
            'Content-Type': 'application/json'
          }),
          body: expect.stringContaining('"projectId":"project-1"')
        })
      );
      expect(notificationsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Newtab",
          message: 'Page saved!'
        })
      );
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });
  });

  // Regression: fetchBackgroundApi returns null when the response body fails
  // to parse as JSON (truncated, gateway HTML, empty 200). savePageFromTab
  // previously treated null as success and toasted "Page saved!", leaving the
  // user to discover later that the save never landed. Now it throws so
  // handleSaveError surfaces a real error notification instead.
  it('treats an unparseable save response as a failure, not a silent success', async () => {
    const onMessageAddListener = vi.fn();
    const onClickedAddListener = vi.fn();
    const notificationsCreate = vi.fn();
    const tabsQuery = vi.fn(async () => [{
      url: 'https://example.edu/article',
      title: 'Example article'
    }]);
    // ok: true but body isn't valid JSON → fetchBackgroundApi resolves null.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn(async () => { throw new SyntaxError('Unexpected token < in JSON'); })
    });

    vi.resetModules();
    vi.doMock('../../src/background-auth.js', () => ({
      createBackgroundAuth: () => ({
        signIn: vi.fn(async () => ({
          user: { uid: 'user-123' },
          idToken: 'token-123'
        })),
        signOut: vi.fn()
      })
    }));
    vi.doMock('../../src/sentry.js', () => ({
      initSentry: vi.fn(),
      setUser: vi.fn(),
      setRequestId: vi.fn(),
      captureError: vi.fn(),
      captureMessage: vi.fn(),
      flush: vi.fn(async () => true),
      clearUser: vi.fn()
    }));
    vi.stubGlobal('fetch', fetchMock);

    globalThis.browser = {
      runtime: {
        id: 'test-extension',
        getManifest: vi.fn(() => ({ version: '1.10.12', name: 'Newtab Bookmarks' })),
        onMessage: { addListener: onMessageAddListener }
      },
      action: {
        onClicked: { addListener: onClickedAddListener },
        setBadgeText: vi.fn(),
        setBadgeBackgroundColor: vi.fn()
      },
      identity: {
        getRedirectURL: vi.fn(() => 'https://extension-id.extensions.allizom.org/'),
        launchWebAuthFlow: vi.fn()
      },
      notifications: { create: notificationsCreate },
      storage: { local: { get: vi.fn(async () => ({})), remove: vi.fn() } },
      tabs: { query: tabsQuery }
    };

    await import('../../src/background.js?save-null-response');

    const listener = onMessageAddListener.mock.calls[0][0];
    const sendResponse = vi.fn();
    expect(listener({ action: 'saveCurrentPage' }, {}, sendResponse)).toBe(true);

    await vi.waitFor(() => {
      // Error path ran: the Newtab - Error notification fired, NOT the
      // success "Page saved!" notification.
      expect(notificationsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining('Error')
        })
      );
      const messages = notificationsCreate.mock.calls.map(c => c[0]?.message);
      expect(messages).not.toContain('Page saved!');
      expect(sendResponse).toHaveBeenCalledWith(
        expect.objectContaining({ success: false })
      );
    });
  });
});

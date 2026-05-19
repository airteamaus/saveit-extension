import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('extension sentry gating', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('does not initialize or capture in development', async () => {
    const sentryMock = {
      init: vi.fn(),
      setUser: vi.fn(),
      setTag: vi.fn(),
      captureException: vi.fn(),
      captureMessage: vi.fn(),
      flush: vi.fn(async () => true)
    };

    vi.doMock('@sentry/browser', () => sentryMock);
    vi.doMock('../../src/config.js', () => ({
      CONFIG: {
        enableErrorReporting: false,
        environment: 'development'
      }
    }));
    vi.doMock('../../src/telemetry.js', () => ({
      sanitizeTelemetryContext: (context) => context
    }));

    const sentry = await import('../../src/sentry.js?dev-disabled');

    sentry.initSentry();
    sentry.setUser({ uid: 'user-123', email: 'rich@airteam.com.au' });
    sentry.setRequestId('request-123');
    sentry.captureError(new Error('ignore me'), { context: 'test' });
    sentry.captureMessage('ignore me');
    await expect(sentry.flush()).resolves.toBe(true);
    sentry.clearUser();

    expect(sentryMock.init).not.toHaveBeenCalled();
    expect(sentryMock.setUser).not.toHaveBeenCalled();
    expect(sentryMock.setTag).not.toHaveBeenCalled();
    expect(sentryMock.captureException).not.toHaveBeenCalled();
    expect(sentryMock.captureMessage).not.toHaveBeenCalled();
    expect(sentryMock.flush).not.toHaveBeenCalled();
  });
});

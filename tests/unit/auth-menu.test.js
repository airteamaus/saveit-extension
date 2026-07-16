import { beforeEach, describe, expect, it, vi } from 'vitest';

import '../../src/auth-menu.js';
import { sendRuntimeMessage } from '../../src/send-runtime-message.js';

// auth-menu.js is a classic script that reads window.sendRuntimeMessage
// (seeded by config-loader.js in production). Seed it here so the real helper
// is exercised — the tests previously mocked sendMessage as promise-returning,
// which hid the callback-form path the helper exists to handle.
beforeEach(() => {
  window.sendRuntimeMessage = sendRuntimeMessage;
});

describe('AuthMenu.signIn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws background sign-in errors returned in the response', async () => {
    const runtime = {
      sendMessage: vi.fn().mockResolvedValue({
        success: false,
        error: 'Background sign-in failed'
      })
    };

    await expect(window.AuthMenu.signIn(() => runtime))
      .rejects
      .toThrow('Background sign-in failed');
  });

  it('propagates runtime messaging failures instead of falling back', async () => {
    const runtime = {
      sendMessage: vi.fn().mockRejectedValue(
        new Error('Could not establish connection. Receiving end does not exist.')
      )
    };

    await expect(window.AuthMenu.signIn(() => runtime))
      .rejects
      .toThrow('Could not establish connection. Receiving end does not exist.');
  });
});

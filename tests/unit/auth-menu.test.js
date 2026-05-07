import { beforeEach, describe, expect, it, vi } from 'vitest';

import '../../src/auth-menu.js';

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

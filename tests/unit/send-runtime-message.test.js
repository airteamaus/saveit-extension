import { describe, expect, it } from 'vitest';
import { sendRuntimeMessage } from '../../src/send-runtime-message.js';

// The helper must work across three load contexts that present different
// runtime.sendMessage shapes: Chrome without a polyfill (callback form), and
// Firefox / polyfill-loaded (promise form). These tests pin both paths,
// including the lastError rejection and the no-runtime guard.

describe('sendRuntimeMessage', () => {
  it('resolves via the callback path when sendMessage is callback-based (Chrome, no polyfill)', async () => {
    let capturedMessage = null;
    let capturedCallback = null;
    const runtime = {
      // Chrome shape: returns undefined, delivers via the callback arg.
      sendMessage(message, callback) {
        capturedMessage = message;
        capturedCallback = callback;
        return undefined;
      },
      lastError: null
    };

    const pending = sendRuntimeMessage(runtime, { action: 'ping' });
    // The helper should have registered the callback but not yet resolved.
    expect(capturedMessage).toEqual({ action: 'ping' });
    expect(typeof capturedCallback).toBe('function');

    // Fire the callback the way chrome.runtime would.
    capturedCallback({ success: true, ok: true });

    await expect(pending).resolves.toEqual({ success: true, ok: true });
  });

  it('rejects via the callback path when lastError is set', async () => {
    const runtime = {
      sendMessage(_message, callback) {
        // Defer to mimic the async callback delivery.
        setTimeout(() => callback(undefined), 0);
        return undefined;
      },
      // lastError is read inside the callback, so set it before delivery.
      get lastError() { return { message: 'Receiving end does not exist' }; }
    };

    await expect(sendRuntimeMessage(runtime, { action: 'x' }))
      .rejects.toThrow('Receiving end does not exist');
  });

  it('resolves via the promise path when sendMessage returns a thenable (Firefox / polyfill)', async () => {
    const runtime = {
      // Firefox/polyfill shape: ignores the callback, returns a promise.
      sendMessage(message, _callback) {
        return Promise.resolve({ success: true, echoed: message });
      },
      lastError: null
    };

    await expect(sendRuntimeMessage(runtime, { action: 'signIn' }))
      .resolves.toEqual({ success: true, echoed: { action: 'signIn' } });
  });

  it('rejects via the promise path when the returned promise rejects', async () => {
    const runtime = {
      sendMessage() {
        return Promise.reject(new Error('boom'));
      },
      lastError: null
    };

    await expect(sendRuntimeMessage(runtime, { action: 'x' })).rejects.toThrow('boom');
  });

  it('rejects with a clear message when no runtime is available', async () => {
    await expect(sendRuntimeMessage(null, { action: 'x' }))
      .rejects.toThrow('Browser runtime API not available');
    await expect(sendRuntimeMessage({}, { action: 'x' }))
      .rejects.toThrow('Browser runtime API not available');
  });

  it('rejects when sendMessage throws synchronously', async () => {
    const runtime = {
      sendMessage() {
        throw new Error('extension context invalidated');
      }
    };

    await expect(sendRuntimeMessage(runtime, { action: 'x' }))
      .rejects.toThrow('extension context invalidated');
  });

  // Regression for the auth-menu latent bug: before unification, signIn did
  // `await runtime.sendMessage(...)` directly. On a callback-based runtime
  // (Chrome before the polyfill loads) sendMessage returns undefined, so the
  // await resolved to undefined and signIn treated it as success. The shared
  // helper must correctly resolve via the callback instead.
  it('does NOT resolve to undefined on a callback-based runtime (auth-menu regression)', async () => {
    let callback = null;
    const runtime = {
      sendMessage(_message, cb) { callback = cb; return undefined; },
      lastError: null
    };

    const pending = sendRuntimeMessage(runtime, { action: 'signIn' });
    callback({ success: true, user: { uid: 'u1' } });

    const result = await pending;
    expect(result).toEqual({ success: true, user: { uid: 'u1' } });
    expect(result).not.toBeUndefined();
  });
});

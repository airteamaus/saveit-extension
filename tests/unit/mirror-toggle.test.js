import { describe, expect, it, vi } from 'vitest';

import { initMirrorToggle } from '../../src/newtab-page.js';

// initMirrorToggle is a thin wiring fn over runtime messaging. These tests pin
// the contract callers rely on: optimistic state flip, notify() called with the
// right message on success, revert + error toast on failure, and that the
// initial getBookmarkMirrorState read sets aria-pressed.

function setup({ initialResponse } = {}) {
  document.body.innerHTML = `
    <button id="hero-mirror-toggle" aria-pressed="false">
      <svg class="dropdown-item-icon"></svg>
      <span class="dropdown-item-label">Sync browser</span>
    </button>
    <div id="user-dropdown" class="hidden"></div>
  `;
  const elements = {
    mirrorToggle: document.getElementById('hero-mirror-toggle'),
    userDropdown: document.getElementById('user-dropdown')
  };

  // Fake runtime.sendMessage that always invokes the callback synchronously,
  // so tests don't need async plumbing.
  const sendMessage = vi.fn((message, callback) => {
    if (message.action === 'getBookmarkMirrorState') {
      callback(initialResponse ?? { success: true, enabled: false });
      return;
    }
    // setBookmarkMirrorEnabled
    callback({ success: true });
  });

  const runtime = { sendMessage, lastError: null };
  return { elements, runtime };
}

describe('initMirrorToggle', () => {
  it('reads the initial enabled state from getBookmarkMirrorState', () => {
    const { elements, runtime } = setup({ initialResponse: { success: true, enabled: true } });
    initMirrorToggle({ elements, runtime });

    expect(elements.mirrorToggle.getAttribute('aria-pressed')).toBe('true');
  });

  it('optimistically flips state, calls notify on success, and closes the dropdown', () => {
    const { elements, runtime } = setup();
    const notify = vi.fn();
    initMirrorToggle({ elements, runtime, notify });

    elements.mirrorToggle.click();

    // Optimistic flip + persistent after the success response.
    expect(elements.mirrorToggle.getAttribute('aria-pressed')).toBe('true');
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0]).toBe('Browser bookmark sync enabled');
    // Dropdown closed so the bookmark tree is visible.
    expect(elements.userDropdown.classList.contains('hidden')).toBe(true);
  });

  it('reverts state and shows an error toast when the runtime reports failure', () => {
    const { elements, runtime } = setup();
    // Make setBookmarkMirrorEnabled fail.
    runtime.sendMessage.mockImplementation((message, callback) => {
      if (message.action === 'getBookmarkMirrorState') {
        callback({ success: true, enabled: false });
        return;
      }
      callback({ success: false });
    });
    const notify = vi.fn();
    initMirrorToggle({ elements, runtime, notify });

    elements.mirrorToggle.click();

    // Reverted to the prior off state.
    expect(elements.mirrorToggle.getAttribute('aria-pressed')).toBe('false');
    expect(notify).toHaveBeenCalledWith(
      'Could not change browser bookmark sync — try again',
      { type: 'error' }
    );
  });

  it('disables label reads as off when enabled is toggled off', () => {
    const { elements, runtime } = setup({ initialResponse: { success: true, enabled: true } });
    const notify = vi.fn();
    initMirrorToggle({ elements, runtime, notify });

    elements.mirrorToggle.click(); // currently on -> toggling off

    expect(elements.mirrorToggle.getAttribute('aria-pressed')).toBe('false');
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0]).toBe('Browser bookmark sync disabled');
  });

  it('no-ops when there is no toggle element', () => {
    const notify = vi.fn();
    // Should not throw even with empty elements.
    initMirrorToggle({ elements: {}, runtime: { sendMessage: vi.fn() }, notify });
    expect(notify).not.toHaveBeenCalled();
  });
});

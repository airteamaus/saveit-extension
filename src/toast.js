// toast.js - Lightweight in-page toast notifications.
//
// A single region (#toast-region) hosts transient messages that auto-dismiss
// after a few seconds. Intended for non-blocking confirmations (e.g. the mirror
// toggle), replacing the rougher window.alert() for those flows. Type drives
// the accent colour via a modifier class on each toast element.

const DEFAULT_DURATION_MS = 3000;

function isToastType(value) {
  return value === 'success' || value === 'error';
}

export function createToastRegion({ container, documentObj = document, durationMs = DEFAULT_DURATION_MS } = {}) {
  if (!container) {
    return { show() { /* no-op when the region isn't mounted */ } };
  }

  const windowObj = documentObj.defaultView || globalThis;
  let dismissTimer = null;
  let activeToast = null;

  function dismiss() {
    if (dismissTimer !== null) {
      windowObj.clearTimeout(dismissTimer);
      dismissTimer = null;
    }
    if (activeToast) {
      activeToast.remove();
      activeToast = null;
    }
  }

  function show(message, { type } = {}) {
    if (!message) return;
    dismiss();

    const toast = documentObj.createElement('div');
    toast.className = 'toast';
    if (isToastType(type)) {
      toast.classList.add(`toast--${type}`);
    }
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
    toast.textContent = String(message);
    container.replaceChildren(toast);
    activeToast = toast;

    // Add the visible class on the next macrotask so the slide-in transition
    // runs (the element needs to be in the layout first). Using setTimeout
    // rather than rAF keeps this controllable under fake timers in tests.
    windowObj.setTimeout(() => toast.classList.add('toast--visible'), 0);

    dismissTimer = windowObj.setTimeout(dismiss, durationMs);
  }

  return { show, dismiss };
}

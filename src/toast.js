// toast.js - Lightweight in-page toast notifications.
//
// A single region (#toast-region) hosts transient messages that auto-dismiss
// after a few seconds. Intended for non-blocking confirmations (e.g. the mirror
// toggle), replacing the rougher window.alert() for those flows. Type drives
// the accent colour via a modifier class on each toast element.

const DEFAULT_DURATION_MS = 5000;

function isToastType(value) {
  return value === 'success' || value === 'error' || value === 'warning';
}

// A green check-circle SVG shown at the start of success toasts. Kept inline so
// the toast stays self-contained (no extra asset fetches or CSP concerns).
const SUCCESS_ICON = '<svg class="toast-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>';

// An amber alert-triangle for warning toasts (e.g. some bookmarks were skipped).
const WARNING_ICON = '<svg class="toast-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>';

const ICONS = { success: SUCCESS_ICON, warning: WARNING_ICON };

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

    // Success and warning toasts lead with an icon; the message follows in a
    // text span so the two lay out side by side.
    const icon = type ? ICONS[type] : null;
    if (icon) {
      toast.innerHTML = icon;
      const text = documentObj.createElement('span');
      text.textContent = String(message);
      toast.append(text);
    } else {
      toast.textContent = String(message);
    }

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

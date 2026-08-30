/* global ThemeManager, AuthMenu */

import './config.js';
import { API } from './api.js';
import { createNewtabApp } from './newtab-app.js';
import { ProjectManager } from './project-manager.js';

const app = createNewtabApp({
  API,
  AuthMenu,
  ProjectManager,
  ThemeManager,
  documentObj: document
});

app.bind();
await app.start();

// Search-hero shortcuts: "/" focuses the search input from anywhere (unless
// the user is already typing in a field); Escape in the input clears it.
const searchInput = document.getElementById('saved-pages-search-input');
document.addEventListener('keydown', (event) => {
  if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) {
    return;
  }

  const active = document.activeElement;
  const tag = active?.tagName?.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || active?.isContentEditable) {
    return;
  }

  event.preventDefault();
  searchInput?.focus();
});
searchInput?.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || !searchInput.value) {
    return;
  }

  event.preventDefault();
  document.getElementById('saved-pages-search-clear-btn')?.click();
  searchInput.focus();
});

// Test/debug seam: expose the live app instance so Playwright (or a developer
// with the URL param) can drive the real production code paths against the
// real DOM — including the saved-pages store and the interactive sign-in
// trigger that the warming UI depends on. Dormant unless explicitly requested.
const debugEnabled = typeof URLSearchParams !== 'undefined'
  && new URLSearchParams(globalThis.location?.search).get('debug') === '1';
if (debugEnabled) {
  globalThis.__saveit = { app };
}


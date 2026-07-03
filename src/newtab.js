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

// Test/debug seam: expose the live app instance so Playwright (or a developer
// with the URL param) can drive the real production code paths against the
// real DOM — including the saved-pages store and the interactive sign-in
// trigger that the warming UI depends on. Dormant unless explicitly requested.
const debugEnabled = typeof URLSearchParams !== 'undefined'
  && new URLSearchParams(globalThis.location?.search).get('debug') === '1';
if (debugEnabled) {
  globalThis.__saveit = { app };
}


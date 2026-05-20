/* global ThemeManager, AuthMenu, ProjectManager */

import './config.js';
import { createNewtabApp } from './newtab-app.js';

const app = createNewtabApp({
  API: globalThis.API,
  AuthMenu,
  ProjectManager,
  ThemeManager,
  documentObj: document
});

app.bind();
await app.start();

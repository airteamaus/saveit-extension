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

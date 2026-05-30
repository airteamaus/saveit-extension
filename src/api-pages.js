// api-pages.js - Saved-page API facade composed from smaller page/project modules

import { applyApiPageActions } from './api-pages-page-actions.js';
import { applyApiPagesLists } from './api-pages-lists.js';
import { applyApiProjects } from './api-pages-projects.js';

export function applyApiPages(API) {
  applyApiPagesLists(API);
  applyApiProjects(API);
  applyApiPageActions(API);
  return API;
}

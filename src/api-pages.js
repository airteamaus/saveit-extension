// api-pages.js - Saved-page API facade composed from smaller page/project modules

import { applyApiDomains } from './api-pages-domains.js';
import { applyApiImport } from './api-pages-import.js';
import { applyApiPageActions } from './api-pages-page-actions.js';
import { applyApiPagesLists } from './api-pages-lists.js';
import { applyApiProjects } from './api-pages-projects.js';

export function applyApiPages(API) {
  applyApiPagesLists(API);
  applyApiProjects(API);
  applyApiPageActions(API);
  applyApiImport(API);
  applyApiDomains(API);
  return API;
}

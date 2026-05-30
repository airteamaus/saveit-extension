// api.js - API facade composed from smaller helper modules
// Automatically detects standalone mode (testing) vs extension mode (production)
// and uses mock data or real Cloud Function accordingly

import { applyApiCore } from './api-core.js';
import { applyApiPages } from './api-pages.js';
import { applyApiSearch } from './api-search.js';

export function createAPI(dependencies = {}) {
  const API = {};
  applyApiCore(API, dependencies.core);
  applyApiPages(API);
  applyApiSearch(API);
  return API;
}

export const API = createAPI();

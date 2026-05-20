import { ProjectsStore } from './projects-store.js';
import { SavedPagesStore } from './saved-pages-store.js';

const DRAWER_INITIAL_FETCH_LIMIT = 50;
const DRAWER_WARM_CACHE_SCOPE = {
  surface: 'saved-pages-drawer',
  sort: 'newest',
  pinnedFirst: false,
  limit: 'all'
};

export function createSavedPagesStore(api) {
  return new SavedPagesStore(api, {
    initialFetchLimit: DRAWER_INITIAL_FETCH_LIMIT,
    prefetchBatchLimit: 100,
    warmCacheScope: DRAWER_WARM_CACHE_SCOPE
  });
}

export function createProjectsStore(api) {
  return new ProjectsStore(api);
}

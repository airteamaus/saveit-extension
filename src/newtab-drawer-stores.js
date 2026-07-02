import { ProjectsStore } from './projects-store.js';
import { SavedPagesStore } from './saved-pages-store.js';

const DRAWER_INITIAL_FETCH_LIMIT = 50;
const DRAWER_WARM_CACHE_SCOPE = {
  surface: 'saved-pages-drawer',
  sort: 'newest',
  pinnedFirst: true,
  limit: 'all'
};

function buildProjectWarmCacheScope(projectId) {
  return {
    surface: 'saved-pages-drawer',
    sort: 'newest',
    pinnedFirst: false,
    projectId,
    limit: 'all'
  };
}

function buildDomainWarmCacheScope(domain) {
  return {
    surface: 'saved-pages-drawer',
    sort: 'newest',
    pinnedFirst: false,
    domain,
    limit: 'all'
  };
}

export function createSavedPagesStore(api) {
  return new SavedPagesStore(api, {
    initialFetchLimit: DRAWER_INITIAL_FETCH_LIMIT,
    prefetchBatchLimit: 100,
    pinnedFirst: true,
    // The All-pages view renders a windowed slice and fetches further pages on
    // scroll, so the store must not eagerly drain the whole collection.
    lazy: true,
    warmCacheScope: DRAWER_WARM_CACHE_SCOPE
  });
}

export function createProjectSavedPagesStore(api, projectId, options = {}) {
  return new SavedPagesStore(api, {
    initialFetchLimit: options.initialFetchLimit || 100,
    prefetchBatchLimit: options.prefetchBatchLimit || 100,
    pinnedFirst: false,
    fetchOptions: {
      projectId
    },
    warmCacheScope: buildProjectWarmCacheScope(projectId)
  });
}

export function createDomainSavedPagesStore(api, domain, options = {}) {
  return new SavedPagesStore(api, {
    initialFetchLimit: options.initialFetchLimit || 100,
    prefetchBatchLimit: options.prefetchBatchLimit || 100,
    pinnedFirst: false,
    fetchOptions: {
      domain
    },
    warmCacheScope: buildDomainWarmCacheScope(domain)
  });
}

export function createProjectsStore(api) {
  return new ProjectsStore(api);
}

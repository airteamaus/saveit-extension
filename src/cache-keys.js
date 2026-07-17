// Central cache-key prefixes. Previously the 'savedPages_cache' literal was
// duplicated across cache-manager.js and saved-pages-cache.js, and projects
// were cached under the same prefix — so invalidating saved pages also nuked
// the projects cache. Each surface now gets its own prefix so invalidation
// can be narrow (AGENTS.md #8) and keys match their query shape (#6).

export const SAVED_PAGES_CACHE_PREFIX = 'savedPages_cache';
export const PROJECTS_CACHE_PREFIX = 'projects_cache';
export const DOMAINS_CACHE_PREFIX = 'domains_cache';

// One-time migration: before a surface got its own prefix, it was cached under
// savedPages_cache_* with a surface=<scope> query fragment. Those stale keys
// are invisible to the surface's own cache manager (which reads <surface>_cache_*),
// so evict them. Match narrowly on the surface scope to avoid touching
// legitimate saved-pages keys.
async function migrateSurfaceCacheKeys(storage, surfaceScope) {
  if (!storage?.get || !storage?.remove) return 0;

  const allItems = await storage.get(null);
  const staleKeys = Object.keys(allItems).filter(key => (
    key.startsWith(`${SAVED_PAGES_CACHE_PREFIX}_`) &&
    key.includes(`surface%3D${surfaceScope}`)
  ));

  if (staleKeys.length > 0) {
    await storage.remove(staleKeys);
  }
  return staleKeys.length;
}

export function migrateProjectsCacheKeys(storage) {
  return migrateSurfaceCacheKeys(storage, 'projects');
}

export function migrateDomainsCacheKeys(storage) {
  return migrateSurfaceCacheKeys(storage, 'domains');
}


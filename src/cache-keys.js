// Central cache-key prefixes. Previously the 'savedPages_cache' literal was
// duplicated across cache-manager.js and saved-pages-cache.js, and projects
// were cached under the same prefix — so invalidating saved pages also nuked
// the projects cache. Each surface now gets its own prefix so invalidation
// can be narrow (AGENTS.md #8) and keys match their query shape (#6).

export const SAVED_PAGES_CACHE_PREFIX = 'savedPages_cache';
export const PROJECTS_CACHE_PREFIX = 'projects_cache';

// One-time migration: before projects got their own prefix, they were cached
// under savedPages_cache_* with a surface=projects scope. Those stale keys are
// now both misleading and invisible to the projects cache manager (which reads
// projects_cache_*), so evict them. Match narrowly on the projects scope to
// avoid touching legitimate saved-pages keys.
export async function migrateProjectsCacheKeys(storage) {
  if (!storage?.get || !storage?.remove) return 0;

  const allItems = await storage.get(null);
  const staleKeys = Object.keys(allItems).filter(key => (
    key.startsWith(`${SAVED_PAGES_CACHE_PREFIX}_`) &&
    key.includes('surface%3Dprojects')
  ));

  if (staleKeys.length > 0) {
    await storage.remove(staleKeys);
  }
  return staleKeys.length;
}


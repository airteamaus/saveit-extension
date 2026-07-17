import { describe, it, expect, vi } from 'vitest';

import { ProjectsStore } from '../../src/projects-store.js';

function attachMeta(projects, fromCache) {
  return Object.assign(projects, {
    meta: {
      fromCache
    }
  });
}

describe('ProjectsStore', () => {
  it('hydrates cached projects and refreshes them through the shared list flow', async () => {
    const cachedProjects = attachMeta([
      { id: 'project-1', name: 'Cached project', visibility: 'private', page_count: 1 },
      { id: 'project-2', name: 'Remove me', visibility: 'private', page_count: 0 }
    ], true);
    const freshProjects = attachMeta([
      { id: 'project-1', name: 'Fresh project', visibility: 'private', page_count: 2 }
    ], false);
    const api = {
      isExtension: true,
      // ProjectsStore reads/writes its warm cache via the projects-surface
      // methods (PROJECTS_CACHE_PREFIX), not the inherited saved-pages ones.
      getProjectsCachedPages: vi.fn(async () => cachedProjects),
      setProjectsCachedPages: vi.fn(async () => {}),
      getProjects: vi
        .fn()
        .mockResolvedValueOnce(freshProjects)
    };
    const store = new ProjectsStore(api);

    await store.hydrate();
    await vi.waitFor(() => {
      expect(store.getSnapshot().projects).toEqual([
        { id: 'project-1', name: 'Fresh project', visibility: 'private', page_count: 2 }
      ]);
    });

    expect(api.getProjects).toHaveBeenCalledWith({ skipCache: true });
    expect(api.setProjectsCachedPages).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: 'project-1', name: 'Fresh project' })
      ]),
      { surface: 'projects' }
    );
  });
});

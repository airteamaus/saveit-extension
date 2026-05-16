import {
  WarmCacheListStore,
  buildListCachePayload
} from './warm-cache-list-store.js';

const PROJECTS_WARM_CACHE_SCOPE = {
  surface: 'projects'
};

function normalizeProjectsResponse(projects) {
  const projectList = Array.isArray(projects) ? projects : [];

  return {
    pages: projectList,
    pagination: {
      total: projectList.length,
      hasNextPage: false,
      nextCursor: null
    },
    meta: projects?.meta || {}
  };
}

export class ProjectsStore extends WarmCacheListStore {
  constructor(api, options = {}) {
    super(api, {
      warmCacheScope: options.warmCacheScope || PROJECTS_WARM_CACHE_SCOPE,
      getList: async fetchOptions => normalizeProjectsResponse(await api?.getProjects?.(fetchOptions)),
      buildInitialFetchOptions: (overrides = {}) => ({
        ...overrides
      }),
      buildLoadMoreFetchOptions: () => ({
        skipCache: true
      })
    });
  }

  getSnapshot() {
    const snapshot = super.getSnapshot();
    return {
      ...snapshot,
      projects: snapshot.allPages
    };
  }

  async setProjects(projects, { requestId = this.state.requestId } = {}) {
    return this.setPages(projects, {
      total: Array.isArray(projects) ? projects.length : 0,
      hasNextPage: false,
      nextCursor: null
    }, { requestId });
  }

  async getWarmCache() {
    if (!this.api?.isExtension || !this.options.warmCacheScope) {
      return null;
    }

    const cachedProjects = await this.api.getCachedPages(this.options.warmCacheScope, {
      allowExpired: true
    });
    if (!Array.isArray(cachedProjects)) {
      return null;
    }

    return buildListCachePayload(cachedProjects, {
      total: cachedProjects.length,
      hasNextPage: false,
      nextCursor: null
    }, true);
  }

  async persistWarmCache(requestId = this.state.requestId) {
    if (
      !this.api?.isExtension ||
      !this.options.warmCacheScope ||
      this.state.requestId !== requestId
    ) {
      return;
    }

    await this.api.setCachedPages(this.state.allPages, this.options.warmCacheScope);
  }
}

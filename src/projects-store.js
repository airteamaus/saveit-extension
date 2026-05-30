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
      return {
        status: 'empty',
        pages: [],
        pagination: {
          total: 0,
          hasNextPage: false,
          nextCursor: null
        },
        error: null,
        reason: 'warm-cache-disabled'
      };
    }

    const cacheState = this.api.getCachedPagesState
      ? await this.api.getCachedPagesState(this.options.warmCacheScope, {
        allowExpired: true
      })
      : await (async () => {
        const response = await this.api.getCachedPages(this.options.warmCacheScope, {
          allowExpired: true
        });
        return {
          status: response ? 'fresh' : 'empty',
          response,
          error: null,
          ageMs: null,
          timestamp: null,
          reason: 'legacy-api',
          usable: Boolean(response)
        };
      })();
    const cachedProjects = Array.isArray(cacheState.response) ? cacheState.response : null;
    if (!cachedProjects) {
      return {
        status: cacheState.status,
        pages: [],
        pagination: {
          total: 0,
          hasNextPage: false,
          nextCursor: null
        },
        error: cacheState.error,
        ageMs: cacheState.ageMs,
        timestamp: cacheState.timestamp,
        reason: cacheState.reason,
        usable: cacheState.usable
      };
    }

    return {
      ...buildListCachePayload(cachedProjects, {
        total: cachedProjects.length,
        hasNextPage: false,
        nextCursor: null
      }, true),
      status: cacheState.status,
      error: cacheState.error,
      ageMs: cacheState.ageMs,
      timestamp: cacheState.timestamp,
      reason: cacheState.reason,
      usable: cacheState.usable
    };
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

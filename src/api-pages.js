// api-pages.js - Saved-page list, favorites, and CRUD API helpers

function buildSavedPagesParams(options) {
  const params = {
    limit: options.limit || 50,
    search: options.search || '',
    sort: options.sort || 'newest'
  };

  if (options.cursor) {
    params.cursor = options.cursor;
  }

  if (options.pinnedFirst !== undefined) {
    params.pinnedFirst = options.pinnedFirst;
  }

  if (options.projectId) {
    params.projectId = options.projectId;
  }

  if (options.newerThanId) {
    params.newerThanId = options.newerThanId;
  }

  if (options.latestKnownId) {
    params.latestKnownId = options.latestKnownId;
  }

  return params;
}

function buildFavoritesParams(options) {
  const params = {
    favorites: 'true',
    limit: options.limit || 300,
    sort: options.sort || 'newest'
  };

  if (options.cursor) {
    params.cursor = options.cursor;
  }

  if (options.pinnedFirst !== undefined) {
    params.pinnedFirst = options.pinnedFirst;
  }

  if (options.projectId) {
    params.projectId = options.projectId;
  }

  if (options.newerThanId) {
    params.newerThanId = options.newerThanId;
  }

  if (options.latestKnownId) {
    params.latestKnownId = options.latestKnownId;
  }

  return params;
}

function createProjectsUnsupportedError() {
  const error = new Error('Project collections are not supported by the connected backend yet.');
  error.code = 'PROJECTS_UNSUPPORTED';
  return error;
}

function isProjectRecord(project) {
  return Boolean(
    project &&
    typeof project === 'object' &&
    typeof project.id === 'string' &&
    typeof project.name === 'string'
  );
}

function normalizeProjectsResponse(data) {
  if (!Array.isArray(data) || !data.every(isProjectRecord)) {
    throw createProjectsUnsupportedError();
  }

  return data;
}

function buildProjectsCacheScope(options = {}) {
  return {
    surface: 'projects',
    includeArchived: options.includeArchived === true ? 'true' : null
  };
}

function withProjectsCacheMetadata(projects, fromCache) {
  Object.defineProperty(projects, 'meta', {
    value: { fromCache },
    configurable: true,
    enumerable: false,
    writable: true
  });

  return projects;
}

function buildCreateProjectPayload(project) {
  const payload = {
    name: project.name?.trim()
  };

  if (project.visibility === 'company') {
    payload.visibility = 'company';
  }

  if (project.company_domain) {
    payload.company_domain = project.company_domain;
  }

  return payload;
}

function buildUpdateProjectPayload(updates) {
  const payload = {};

  if (typeof updates.name === 'string' && updates.name.trim()) {
    payload.name = updates.name.trim();
  }

  if (updates.visibility) {
    payload.visibility = updates.visibility;
  }

  if (typeof updates.company_domain === 'string' && updates.company_domain.trim()) {
    payload.company_domain = updates.company_domain.trim();
  }

  if (typeof updates.archived === 'boolean') {
    payload.archived = updates.archived;
  }

  return payload;
}

function normalizePagination(data) {
  const rawPagination = data?.pagination && typeof data.pagination === 'object'
    ? data.pagination
    : null;
  const normalizedTotal = typeof rawPagination?.total === 'number'
    ? rawPagination.total
    : (typeof data?.total === 'number' ? data.total : null);
  const normalizedHasNextPage = rawPagination?.hasNextPage === true
    || rawPagination?.has_more === true
    || data?.hasMore === true
    || data?.has_more === true;
  const normalizedNextCursor = rawPagination?.nextCursor
    ?? rawPagination?.next_cursor
    ?? data?.nextCursor
    ?? data?.next_cursor
    ?? null;

  return {
    total: normalizedTotal,
    hasNextPage: normalizedHasNextPage,
    nextCursor: normalizedHasNextPage ? normalizedNextCursor : null
  };
}

function normalizePagesResponse(data, context) {
  const pages = Array.isArray(data?.pages)
    ? data.pages
    : (Array.isArray(data) ? data : []);
  const pagination = normalizePagination(data);
  const normalizedResponse = {
    pages,
    pagination: {
      total: typeof pagination.total === 'number' ? pagination.total : pages.length,
      hasNextPage: pagination.hasNextPage,
      nextCursor: pagination.hasNextPage ? pagination.nextCursor : null
    },
    meta: data.meta || {}
  };

  debug(`[${context}] Normalized response:`, {
    count: normalizedResponse.pages.length,
    total: normalizedResponse.pagination.total,
    first_item: normalizedResponse.pages[0]
      ? { id: normalizedResponse.pages[0].id, title: normalizedResponse.pages[0].title }
      : null
  });

  return normalizedResponse;
}

function getMockPages(options) {
  debug('[getSavedPages] Using mock data (standalone mode)');
  const totalPages = globalThis.filterMockData(MOCK_DATA, { ...options, cursor: null });
  const filteredPages = globalThis.filterMockData(MOCK_DATA, options);

  return {
    pages: filteredPages,
    pagination: {
      total: totalPages.length,
      hasNextPage: filteredPages.length < totalPages.length,
      nextCursor: null
    },
    meta: {}
  };
}

function getMockFavorites(options = {}) {
  const allPages = globalThis.filterMockData(MOCK_DATA, { ...options, cursor: null });
  const limit = options.limit || 300;
  const cursor = options.cursor || null;
  const startIndex = cursor
    ? allPages.findIndex(page => page.id === cursor)
    : -1;
  const offset = cursor && startIndex !== -1 ? startIndex + 1 : 0;
  const pageSlice = allPages.slice(offset, offset + limit);
  const nextCursor = offset + pageSlice.length < allPages.length
    ? pageSlice[pageSlice.length - 1]?.id || null
    : null;
  const pages = pageSlice.map(page => ({
    ...page,
    pinned: page.pinned ?? false,
    saved_at: page.saved_at || null
  }));

  return {
    pages,
    pagination: {
      total: allPages.length,
      hasNextPage: nextCursor !== null,
      nextCursor
    },
    meta: {}
  };
}

function getStandaloneProjects(options = {}) {
  if (typeof globalThis.getMockProjectsData === 'function') {
    return globalThis.getMockProjectsData(options);
  }

  const projects = globalThis.MOCK_PROJECTS || [];
  const pages = globalThis.MOCK_DATA || [];
  const includeArchived = options.includeArchived === true;

  return projects
    .filter(project => includeArchived || !project.archived)
    .map(project => ({
      ...project,
      page_count: pages.filter(page => page.project_ids?.includes(project.id)).length
    }));
}

function createStandaloneProject(project) {
  if (typeof globalThis.createMockProjectData === 'function') {
    return globalThis.createMockProjectData(project);
  }

  const now = new Date().toISOString();
  const newProject = {
    id: project.id || `project-${Date.now()}`,
    name: project.name,
    owner_user_id: project.owner_user_id || 'standalone-user',
    visibility: project.visibility || 'private',
    company_domain: project.company_domain || null,
    archived: false,
    created_at: now,
    updated_at: now
  };

  const projects = globalThis.MOCK_PROJECTS || [];
  projects.push(newProject);
  globalThis.MOCK_PROJECTS = projects;
  return { ...newProject, page_count: 0 };
}

function updateStandaloneProject(projectId, updates) {
  if (typeof globalThis.updateMockProjectData === 'function') {
    return globalThis.updateMockProjectData(projectId, updates);
  }

  const projects = globalThis.MOCK_PROJECTS || [];
  const project = projects.find(entry => entry.id === projectId);
  if (!project) {
    throw new Error('Project not found');
  }

  Object.assign(project, updates, { updated_at: new Date().toISOString() });
  return {
    ...project,
    page_count: (globalThis.MOCK_DATA || []).filter(page => page.project_ids?.includes(projectId)).length
  };
}

function addStandalonePageToProject(projectId, pageId) {
  if (typeof globalThis.addPageToMockProjectData === 'function') {
    return globalThis.addPageToMockProjectData(projectId, pageId);
  }

  const page = (globalThis.MOCK_DATA || []).find(entry => entry.id === pageId);
  if (!page) {
    throw new Error('Page not found');
  }

  const nextProjectIds = new Set(page.project_ids || []);
  nextProjectIds.add(projectId);
  page.project_ids = Array.from(nextProjectIds);
  return page;
}

function removeStandalonePageFromProject(projectId, pageId) {
  if (typeof globalThis.removePageFromMockProjectData === 'function') {
    return globalThis.removePageFromMockProjectData(projectId, pageId);
  }

  const page = (globalThis.MOCK_DATA || []).find(entry => entry.id === pageId);
  if (!page) {
    throw new Error('Page not found');
  }

  page.project_ids = (page.project_ids || []).filter(id => id !== projectId);
  return page;
}

async function getCachedOrFreshList(API, {
  surface,
  options,
  context,
  fetcher,
  mockFetcher
}) {
  debug(`[${context}] START:`, {
    isExtension: API.isExtension,
    skipCache: options.skipCache || false
  });

  if (API.isExtension) {
    const cacheScope = API._buildListCacheScope(surface, options);

    if (!options.skipCache) {
      const cached = await API.getCachedPages(cacheScope);
      if (cached) {
        debug(`[${context}] Returning cached data:`, {
          count: cached.pages?.length,
          total: cached.pagination?.total
        });
        return API._withCacheMetadata(cached, true);
      }
    }

    return API._executeWithErrorHandling(
      async () => {
        const data = await fetcher(options);
        const normalized = normalizePagesResponse(data, context);
        await API.setCachedPages(normalized, cacheScope);
        return API._withCacheMetadata(normalized, false);
      },
      context,
      { options }
    );
  }

  return API._withCacheMetadata(mockFetcher(options), false);
}

async function headListFreshness(API, {
  options,
  context,
  fetcher
}) {
  if (!options.latestKnownId) {
    return {
      hasUpdates: true,
      anchorFound: false,
      canIncrementalSync: false
    };
  }

  if (!API.isExtension) {
    return {
      hasUpdates: false,
      anchorFound: true,
      canIncrementalSync: true
    };
  }

  return API._executeWithErrorHandling(
    async () => {
      const response = await fetcher(options);
      return {
        hasUpdates: response.status !== 204,
        anchorFound: response.headers.get('x-saveit-anchor-found') !== 'false',
        canIncrementalSync: response.headers.get('x-saveit-can-incremental-sync') !== 'false'
      };
    },
    context,
    { options }
  );
}

function applyApiPages(API) {
  Object.assign(API, {
    async _fetchFromCloudFunction(options) {
      debug('[getSavedPages] Fetching from Cloud Function...');
      const data = await this._fetchWithAuth('', buildSavedPagesParams(options));
      debug('[getSavedPages] Raw JSON response:', data);
      return data;
    },

    async _headSavedPagesFromCloudFunction(options) {
      debug('[headSavedPages] Checking collection freshness...');
      return await this._requestWithAuth('', buildSavedPagesParams(options), {
        method: 'HEAD'
      });
    },

    async _fetchFavoritesFromCloudFunction(options) {
      debug('[getFavorites] Fetching favorites from Cloud Function...');
      const data = await this._fetchWithAuth('', buildFavoritesParams(options));
      debug('[getFavorites] Raw JSON response:', data);
      return data;
    },

    async _headFavoritesFromCloudFunction(options) {
      debug('[headFavorites] Checking collection freshness...');
      return await this._requestWithAuth('', buildFavoritesParams(options), {
        method: 'HEAD'
      });
    },

    _normalizeResponse(data) {
      return normalizePagesResponse(data, 'getSavedPages');
    },

    _getMockData(options) {
      return getMockPages(options);
    },

    _getMockFavorites(options = {}) {
      return getMockFavorites(options);
    },

    async getSavedPages(options = {}) {
      return getCachedOrFreshList(this, {
        surface: 'dashboard',
        options,
        context: 'getSavedPages',
        fetcher: fetchOptions => this._fetchFromCloudFunction(fetchOptions),
        mockFetcher: getMockPages
      });
    },

    async getFavorites(options = {}) {
      return getCachedOrFreshList(this, {
        surface: 'favorites',
        options,
        context: 'getFavorites',
        fetcher: fetchOptions => this._fetchFavoritesFromCloudFunction(fetchOptions),
        mockFetcher: getMockFavorites
      });
    },

    async checkSavedPagesUpdates(options = {}) {
      return headListFreshness(this, {
        options,
        context: 'headSavedPages',
        fetcher: fetchOptions => this._headSavedPagesFromCloudFunction(fetchOptions)
      });
    },

    async checkFavoritesUpdates(options = {}) {
      return headListFreshness(this, {
        options,
        context: 'headFavorites',
        fetcher: fetchOptions => this._headFavoritesFromCloudFunction(fetchOptions)
      });
    },

    async getProjects(options = {}) {
      if (this.isExtension) {
        return this._executeWithErrorHandling(
          async () => {
            const cacheScope = buildProjectsCacheScope(options);
            if (!options.skipCache) {
              const cached = await this.getCachedPages(cacheScope);
              if (cached) {
                return withProjectsCacheMetadata(normalizeProjectsResponse(cached), true);
              }
            }

            const params = {};
            if (options.includeArchived !== undefined) {
              params.includeArchived = String(options.includeArchived);
            }

            const response = await this._fetchWithAuth('/projects', params);
            const normalized = normalizeProjectsResponse(response);
            await this.setCachedPages(normalized, cacheScope);
            return withProjectsCacheMetadata(normalized, false);
          },
          'getProjects',
          { options }
        );
      }

      return getStandaloneProjects(options);
    },

    async createProject(project) {
      if (this.isExtension) {
        return this._executeWithErrorHandling(
          async () => {
            const payload = buildCreateProjectPayload(project);
            const response = await this._fetchWithAuth('/projects', null, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(payload)
            });

            await this.invalidateCache();
            return response;
          },
          'createProject',
          { project }
        );
      }

      return createStandaloneProject(project);
    },

    async updateProject(projectId, updates) {
      if (this.isExtension) {
        return this._executeWithErrorHandling(
          async () => {
            const payload = buildUpdateProjectPayload(updates);
            const response = await this._fetchWithAuth(`/projects/${encodeURIComponent(projectId)}`, null, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(payload)
            });

            await this.invalidateCache();
            return response;
          },
          'updateProject',
          { projectId, updates }
        );
      }

      return updateStandaloneProject(projectId, updates);
    },

    async addPageToProject(projectId, pageId) {
      if (this.isExtension) {
        return this._executeWithErrorHandling(
          async () => {
            const response = await this._fetchWithAuth(`/projects/${encodeURIComponent(projectId)}/pages`, null, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ pageId })
            });

            await this.invalidateCache();
            return response;
          },
          'addPageToProject',
          { projectId, pageId }
        );
      }

      return addStandalonePageToProject(projectId, pageId);
    },

    async removePageFromProject(projectId, pageId) {
      if (this.isExtension) {
        return this._executeWithErrorHandling(
          async () => {
            const response = await this._fetchWithAuth(
              `/projects/${encodeURIComponent(projectId)}/pages/${encodeURIComponent(pageId)}`,
              null,
              { method: 'DELETE' }
            );

            await this.invalidateCache();
            return response;
          },
          'removePageFromProject',
          { projectId, pageId }
        );
      }

      return removeStandalonePageFromProject(projectId, pageId);
    },

    async deletePage(id) {
      if (this.isExtension) {
        return this._executeWithErrorHandling(
          async () => {
            const response = await this._fetchWithAuth('', { id }, {
              method: 'DELETE',
            });

            await this.invalidateCache();
            return response;
          },
          'deletePage',
          { id }
        );
      }

      debug('Mock delete:', id);
      const index = MOCK_DATA.findIndex(page => page.id === id);
      if (index !== -1) {
        MOCK_DATA.splice(index, 1);
      }
      return { success: true };
    },

    async updatePage(id, updates) {
      if (this.isExtension) {
        return this._executeWithErrorHandling(
          async () => {
            const response = await this._fetchWithAuth('/updatePage', null, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ id, ...updates })
            });

            await this.invalidateCache();
            return response;
          },
          'updatePage',
          { id, updates }
        );
      }

      debug('Mock update:', id, updates);
      const page = MOCK_DATA.find(item => item.id === id);
      if (page) {
        Object.assign(page, updates);
        return page;
      }
      throw new Error('Page not found');
    },

    async pinPage(id, pinned) {
      if (this.isExtension) {
        return this._executeWithErrorHandling(
          async () => {
            const response = await this._fetchWithAuth('/pin', null, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ id, pinned })
            });

            await this.invalidateCache();
            return response;
          },
          'pinPage',
          { id, pinned }
        );
      }

      debug('Mock pin:', id, pinned);
      const page = MOCK_DATA.find(item => item.id === id);
      if (page) {
        page.pinned = pinned;
        return { success: true };
      }
      throw new Error('Page not found');
    }
  });

  return API;
}

const ApiPages_Export = { applyApiPages };
globalThis.ApiPages_Export = ApiPages_Export;

/* eslint-disable no-undef */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { applyApiPages };
}
/* eslint-enable no-undef */

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

  return params;
}

function normalizePagesResponse(data, context) {
  const normalizedResponse = {
    pages: data.pages || data,
    pagination: data.pagination || {
      total: (data.pages || data).length,
      hasNextPage: false,
      nextCursor: null
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
  const pagedPages = globalThis.filterMockData(MOCK_DATA, options);
  const limit = options.limit || 300;
  const pages = pagedPages.slice(0, limit).map(page => ({
    ...page,
    pinned: page.pinned ?? false,
    saved_at: page.saved_at || null
  }));

  return {
    pages,
    pagination: {
      total: allPages.length,
      hasNextPage: allPages.length > limit,
      nextCursor: null
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

function applyApiPages(API) {
  Object.assign(API, {
    async _fetchFromCloudFunction(options) {
      debug('[getSavedPages] Fetching from Cloud Function...');
      const data = await this._fetchWithAuth('', buildSavedPagesParams(options));
      debug('[getSavedPages] Raw JSON response:', data);
      return data;
    },

    async _fetchFavoritesFromCloudFunction(options) {
      debug('[getFavorites] Fetching favorites from Cloud Function...');
      const data = await this._fetchWithAuth('', buildFavoritesParams(options));
      debug('[getFavorites] Raw JSON response:', data);
      return data;
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

    async getProjects(options = {}) {
      if (this.isExtension) {
        return this._executeWithErrorHandling(
          async () => {
            const params = {};
            if (options.includeArchived !== undefined) {
              params.includeArchived = String(options.includeArchived);
            }

            return await this._fetchWithAuth('/projects', params);
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
            const response = await this._fetchWithAuth('/projects', null, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(project)
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
            const response = await this._fetchWithAuth(`/projects/${encodeURIComponent(projectId)}`, null, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(updates)
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
            const idToken = await this.getIdToken();
            const params = new URLSearchParams({ id });

            const response = await fetch(`${CONFIG.cloudFunctionUrl}?${params}`, {
              method: 'DELETE',
              headers: {
                'Authorization': `Bearer ${idToken}`
              }
            });

            if (!response.ok) {
              const errorMessage = await this.parseErrorResponse(response);
              throw new Error(errorMessage);
            }

            await this.invalidateCache();
            return await response.json();
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
            const idToken = await this.getIdToken();
            const response = await fetch(`${CONFIG.cloudFunctionUrl}/updatePage`, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
              },
              body: JSON.stringify({ id, ...updates })
            });

            if (!response.ok) {
              const errorMessage = await this.parseErrorResponse(response);
              throw new Error(errorMessage);
            }

            return await response.json();
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

import {
  addStandalonePageToProject,
  createStandaloneProject,
  getStandaloneProjects,
  removeStandalonePageFromProject,
  updateStandaloneProject
} from './api-pages-standalone.js';
import { assertRealPageId } from './pending-saves.js';

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

export function applyApiProjects(API) {
  Object.assign(API, {
    async getProjects(options = {}) {
      if (this.isExtension) {
        const params = {};
        if (options.includeArchived !== undefined) {
          params.includeArchived = String(options.includeArchived);
        }

        return this._getCachedOrFreshList({
          cacheScope: buildProjectsCacheScope(options),
          readCache: (scope) => this.getProjectsCachedPages(scope),
          writeCache: (value, scope) => this.setProjectsCachedPages(value, scope),
          fetcher: () => this._fetchWithAuth('/projects', params),
          normalize: normalizeProjectsResponse,
          mockFetcher: getStandaloneProjects,
          context: 'getProjects',
          options
        });
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

            await this.invalidateProjectsCache();
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

            await this.invalidateProjectsCache();
            return response;
          },
          'updateProject',
          { projectId, updates }
        );
      }

      return updateStandaloneProject(projectId, updates);
    },

    async addPageToProject(projectId, pageId) {
      assertRealPageId(pageId);
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

            // Adding a page to a project changes both the projects cache
            // (membership) and the saved-pages cache (the page's project_ids).
            await Promise.all([
              this.invalidateProjectsCache(),
              this.invalidateCache()
            ]);
            return response;
          },
          'addPageToProject',
          { projectId, pageId }
        );
      }

      return addStandalonePageToProject(projectId, pageId);
    },

    async removePageFromProject(projectId, pageId) {
      assertRealPageId(pageId);
      if (this.isExtension) {
        return this._executeWithErrorHandling(
          async () => {
            const response = await this._fetchWithAuth(
              `/projects/${encodeURIComponent(projectId)}/pages/${encodeURIComponent(pageId)}`,
              null,
              { method: 'DELETE' }
            );

            // Removing a page from a project changes both surfaces — see addPageToProject.
            await Promise.all([
              this.invalidateProjectsCache(),
              this.invalidateCache()
            ]);
            return response;
          },
          'removePageFromProject',
          { projectId, pageId }
        );
      }

      return removeStandalonePageFromProject(projectId, pageId);
    }
  });

  return API;
}

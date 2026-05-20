export function updatePageProjectMembership(page, pageId, projectId, shouldAssign) {
  if (page.id !== pageId) {
    return page;
  }

  const nextProjectIds = new Set(page.project_ids || []);
  if (shouldAssign) {
    nextProjectIds.add(projectId);
  } else {
    nextProjectIds.delete(projectId);
  }

  return {
    ...page,
    project_ids: Array.from(nextProjectIds)
  };
}

export function createProjectManagerActions({
  api,
  alertFn = (...args) => globalThis.alert?.(...args),
  promptFn = (...args) => globalThis.prompt?.(...args),
  confirmFn = (...args) => globalThis.confirm?.(...args),
  refreshProjectCounts,
  adjustProjectCount,
  renderEditor,
  closeEditor,
  getCompanyDomain,
  isProjectsUnavailable,
  getProjectsUnavailableMessage
}) {
  return {
    async loadProjects(dashboard) {
      if (dashboard.projectsStore?.hydrate) {
        try {
          const snapshot = await dashboard.projectsStore.hydrate();
          dashboard.projects = snapshot.projects || snapshot.allPages || [];
          dashboard.projectsAvailable = true;
          dashboard.projectsUnavailableMessage = '';
          refreshProjectCounts(dashboard);
        } catch (error) {
          console.error('Failed to load projects:', error);
          dashboard.projects = [];
          if (error?.code === 'PROJECTS_UNSUPPORTED') {
            dashboard.projectsAvailable = false;
            dashboard.projectsUnavailableMessage = error.message;
          } else {
            dashboard.projectsAvailable = true;
            dashboard.projectsUnavailableMessage = '';
          }
        }
        return;
      }

      try {
        const projects = await api.getProjects();
        dashboard.projects = projects;
        dashboard.projectsAvailable = true;
        dashboard.projectsUnavailableMessage = '';
        refreshProjectCounts(dashboard);

        if (projects?.meta?.fromCache) {
          api.getProjects({ skipCache: true })
            .then(freshProjects => {
              dashboard.projects = freshProjects;
              dashboard.projectsAvailable = true;
              dashboard.projectsUnavailableMessage = '';
              refreshProjectCounts(dashboard);
              dashboard.onProjectsUpdated?.();
            })
            .catch(error => {
              console.error('Failed to refresh projects:', error);
            });
        }
      } catch (error) {
        console.error('Failed to load projects:', error);
        dashboard.projects = [];
        if (error?.code === 'PROJECTS_UNSUPPORTED') {
          dashboard.projectsAvailable = false;
          dashboard.projectsUnavailableMessage = error.message;
        } else {
          dashboard.projectsAvailable = true;
          dashboard.projectsUnavailableMessage = '';
        }
      }
    },

    async promptCreateProject(dashboard, initialName = '', autoAssignPageId = null) {
      if (isProjectsUnavailable(dashboard)) {
        alertFn(getProjectsUnavailableMessage(dashboard));
        return null;
      }

      const proposedName = promptFn('Project name', initialName);
      const name = proposedName?.trim();
      if (!name) {
        return null;
      }

      return this.createProject(dashboard, name, autoAssignPageId);
    },

    async createProject(dashboard, name, autoAssignPageId = null) {
      if (isProjectsUnavailable(dashboard)) {
        alertFn(getProjectsUnavailableMessage(dashboard));
        return null;
      }

      try {
        const newProject = await api.createProject({
          name,
          visibility: 'private'
        });

        dashboard.projects = [...dashboard.projects, { ...newProject, page_count: newProject.page_count || 0 }];
        await dashboard.persistProjects?.();
        if (autoAssignPageId) {
          await this.togglePageProject(dashboard, autoAssignPageId, newProject.id, true);
          dashboard.projectEditorState.query = '';
        } else {
          refreshProjectCounts(dashboard);
          dashboard.render();
        }

        return newProject;
      } catch (error) {
        console.error('Failed to create project:', error);
        alertFn(error.message || 'Failed to create project. Please try again.');
        return null;
      }
    },

    async renameProject(dashboard, projectId) {
      const project = dashboard.projects.find(entry => entry.id === projectId);
      if (!project) {
        return;
      }

      const nextName = promptFn('Rename project', project.name)?.trim();
      if (!nextName || nextName === project.name) {
        return null;
      }

      const updatedProject = await api.updateProject(projectId, { name: nextName });
      dashboard.projects = dashboard.projects.map(entry => (
        entry.id === projectId ? { ...entry, ...updatedProject } : entry
      ));
      await dashboard.persistProjects?.();
      dashboard.render();
      return updatedProject;
    },

    async toggleProjectVisibility(dashboard, projectId) {
      const project = dashboard.projects.find(entry => entry.id === projectId);
      if (!project) {
        return;
      }

      const nextVisibility = project.visibility === 'company' ? 'private' : 'company';
      const nextDomain = nextVisibility === 'company' ? getCompanyDomain(dashboard) : null;
      const updatedProject = await api.updateProject(projectId, {
        visibility: nextVisibility,
        company_domain: nextDomain
      });

      dashboard.projects = dashboard.projects.map(entry => (
        entry.id === projectId ? { ...entry, ...updatedProject } : entry
      ));
      await dashboard.persistProjects?.();
      dashboard.render();
      return updatedProject;
    },

    async archiveProject(dashboard, projectId) {
      const project = dashboard.projects.find(entry => entry.id === projectId);
      if (!project) {
        return;
      }

      if (!confirmFn(`Archive "${project.name}"?`)) {
        return null;
      }

      await api.updateProject(projectId, { archived: true });
      dashboard.projects = dashboard.projects.filter(entry => entry.id !== projectId);
      await dashboard.persistProjects?.();

      if (dashboard.selectedProjectId === projectId) {
        dashboard.selectedProjectId = null;
        if (dashboard.currentFilter) {
          dashboard.currentFilter.projectId = null;
          dashboard.currentFilter.cursor = null;
        }
        dashboard.tagInteractionManager.clearSelection();
        dashboard.discoveryManager.exit();
        dashboard.showLoading?.();
        await dashboard.loadPages?.();
        await dashboard.handleFilterChange();
        return project;
      }

      dashboard.render();
      return project;
    },

    async selectProject(dashboard, projectId) {
      dashboard.selectedProjectId = projectId || null;
      dashboard.currentFilter.projectId = dashboard.selectedProjectId;
      dashboard.currentFilter.cursor = null;
      dashboard.tagInteractionManager.clearSelection();
      dashboard.discoveryManager.exit();
      closeEditor(dashboard);
      dashboard.showLoading();
      await dashboard.loadPages();
      await dashboard.handleFilterChange();
    },

    async togglePageProject(dashboard, pageId, projectId, shouldAssign) {
      if (shouldAssign) {
        await api.addPageToProject(projectId, pageId);
      } else {
        await api.removePageFromProject(projectId, pageId);
      }

      dashboard.allPages = dashboard.allPages.map(page => (
        updatePageProjectMembership(page, pageId, projectId, shouldAssign)
      ));
      dashboard.pages = dashboard.pages.map(page => (
        updatePageProjectMembership(page, pageId, projectId, shouldAssign)
      ));
      adjustProjectCount(dashboard, projectId, shouldAssign ? 1 : -1);
      await dashboard.persistAllPages?.();
      dashboard.handleProjectMembershipChange?.(pageId, projectId);
      renderEditor(dashboard);
    }
  };
}

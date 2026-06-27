export function getMockPages(options) {
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

export function getMockFavorites(options = {}) {
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

export function getStandaloneProjects(options = {}) {
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

export function createStandaloneProject(project) {
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

export function updateStandaloneProject(projectId, updates) {
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

export function addStandalonePageToProject(projectId, pageId) {
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

export function removeStandalonePageFromProject(projectId, pageId) {
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

export function deleteStandalonePage(id) {
  debug('Mock delete:', id);
  const index = MOCK_DATA.findIndex(page => page.id === id);
  if (index !== -1) {
    MOCK_DATA.splice(index, 1);
  }
  return { success: true };
}

export function updateStandalonePage(id, updates) {
  debug('Mock update:', id, updates);
  const page = MOCK_DATA.find(item => item.id === id);
  if (page) {
    Object.assign(page, updates);
    return page;
  }
  throw new Error('Page not found');
}

export function pinStandalonePage(id, pinned) {
  debug('Mock pin:', id, pinned);
  const page = MOCK_DATA.find(item => item.id === id);
  if (page) {
    page.pinned = pinned;
    return { success: true };
  }
  throw new Error('Page not found');
}

// Standalone mock for bulk bookmark import. Mirrors the backend response
// shape: { success, imported, skipped }. Used for UI development and tests.
export function bulkImportStandalone({ bookmarks, projectId }) {
  if (!Array.isArray(bookmarks)) {
    throw new Error('bookmarks must be an array');
  }
  return {
    success: true,
    imported: bookmarks.length,
    skipped: 0,
    project_id: projectId ?? null,
    request_id: 'mock-bulk-import'
  };
}

// Standalone mock for getDomains: derives distinct domains + counts from the
// loaded mock pages. Mirrors the backend response shape [{ domain, count }].
export function getStandaloneDomains() {
  const allPages = globalThis.MOCK_DATA || [];
  const counts = new Map();
  for (const page of allPages) {
    let domain = page.domain;
    if (!domain && page.url) {
      try {
        domain = new URL(page.url).hostname;
      } catch {
        domain = null;
      }
    }
    if (!domain) continue;
    counts.set(domain, (counts.get(domain) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count);
}

export const PINNED_PAGES_SCOPE_ID = '__pinned__';

const PROJECTS_UNAVAILABLE_MESSAGE =
  'Project collections are not supported by the connected backend yet.';

export function isProjectsUnavailable(dashboard) {
  return dashboard.projectsAvailable === false;
}

export function getProjectsUnavailableMessage(dashboard) {
  return dashboard.projectsUnavailableMessage || PROJECTS_UNAVAILABLE_MESSAGE;
}

export function getSelectedProject(dashboard) {
  if (dashboard.selectedProjectId === PINNED_PAGES_SCOPE_ID) {
    return null;
  }

  return dashboard.projects.find(project => project.id === dashboard.selectedProjectId) || null;
}

export function getScopedPages(dashboard, pages) {
  if (dashboard.selectedProjectId === PINNED_PAGES_SCOPE_ID) {
    return pages.filter(page => page.pinned);
  }

  if (!dashboard.selectedProjectId) {
    return pages.filter(page => page.pinned !== true);
  }

  return pages.filter(page => page.project_ids?.includes(dashboard.selectedProjectId));
}

export function refreshProjectCounts(dashboard) {
  const activeProjects = dashboard.projects || [];
  const computedCounts = new Map(
    dashboard.allPages.reduce((counts, page) => {
      (page.project_ids || []).forEach(projectId => {
        counts.set(projectId, (counts.get(projectId) || 0) + 1);
      });
      return counts;
    }, new Map())
  );

  dashboard.projects = activeProjects.map(project => ({
    ...project,
    page_count: typeof project.page_count === 'number'
      ? project.page_count
      : (computedCounts.get(project.id) || 0)
  }));
}

export function adjustProjectCount(dashboard, projectId, delta) {
  dashboard.projects = (dashboard.projects || []).map(project => {
    if (project.id !== projectId) {
      return project;
    }

    const currentCount = typeof project.page_count === 'number' ? project.page_count : 0;
    return {
      ...project,
      page_count: Math.max(0, currentCount + delta)
    };
  });
}

export function getStatsTotal(dashboard) {
  return getScopedPages(dashboard, dashboard.allPages || []).length;
}

export function getProjectMap(dashboard) {
  return Object.fromEntries((dashboard.projects || []).map(project => [project.id, project]));
}

export function getProjectPills(page, dashboard) {
  const projectMap = getProjectMap(dashboard);
  return (page.project_ids || [])
    .map(projectId => projectMap[projectId])
    .filter(Boolean);
}

export function getCompanyDomain(dashboard) {
  const currentUser = dashboard.getCurrentUser();
  if (currentUser?.email?.includes('@')) {
    return currentUser.email.split('@')[1];
  }

  return 'airteam.com.au';
}

// The signed-in user's Firebase uid. dashboard.getCurrentUser() returns the
// raw Firebase user (whose id field is .uid); project.owner_user_id stores the
// same Firebase uid, so these are directly comparable. Tolerates a dashboard
// without getCurrentUser (e.g. minimal test fixtures) by returning null, which
// means "nothing is owned" — the safe default.
export function getCurrentUserUid(dashboard) {
  return typeof dashboard?.getCurrentUser === 'function'
    ? (dashboard.getCurrentUser()?.uid || null)
    : null;
}

// True when the signed-in user owns this project. Use this instead of the
// visibility flag as the ownership signal — a project you own and have shared
// is still "yours", not "shared with you".
export function isOwnedProject(dashboard, project) {
  const uid = getCurrentUserUid(dashboard);
  return Boolean(uid) && project.owner_user_id === uid;
}

// sharing-centre.js - Project sharing overview modal.
//
// Shows, in one auditable place, the sharing state of every project the viewer
// can see: what they've shared, what's been shared with them, and what they own
// but haven't shared. Lets the owner toggle sharing per project. Always opens
// with a fresh server fetch (skipCache) so the view reflects truth, not stale
// cache — this directly addresses the class of bug where a project "looks
// shared" to the owner but never reaches a colleague.
//
// Built as a sibling surface to import-panel.js: shares the same dialog chrome
// (.project-editor-backdrop / .project-editor-dialog, .hidden toggle) and
// open/close lifecycle (backdrop click + Escape + close button) via
// dialog-lifecycle.js.

import { isOwnedProject } from './project-manager-state.js';
import { createDialogLifecycle } from './dialog-lifecycle.js';
import { createEl, createQueryId } from './shared-ui-helpers.js';

export function createSharingCentre({
  api,
  documentObj = document,
  getDashboard,
  getProjectManager,
  onProjectsChanged = () => {}
} = {}) {
  const queryId = createQueryId(documentObj);
  const getBackdrop = () => queryId('sharing-centre-backdrop');
  const getDialog = () => queryId('sharing-centre-dialog');

  let state = { loading: false, error: null, projects: [], usedFallback: false };

  const { show, close } = createDialogLifecycle({
    getBackdrop,
    getDialog,
    documentObj,
    onClose: () => {
      state = { loading: false, error: null, projects: [], usedFallback: false };
    }
  });

  const el = createEl(documentObj);

  function audienceLabel(project) {
    if (project.visibility !== 'company' || !project.company_domain) {
      return 'Private — only you can see it';
    }
    return `Visible to everyone at ${project.company_domain}`;
  }

  function ownerLabel(project, dashboard) {
    if (isOwnedProject(dashboard, project)) {
      return 'Shared by you';
    }
    return project.owner_user_email ? `Shared by ${project.owner_user_email}` : 'Shared with your team';
  }

  function pageCountText(project) {
    const count = typeof project.page_count === 'number' ? project.page_count : 0;
    return `${count} ${count === 1 ? 'page' : 'pages'}`;
  }

  function createProjectRow(project, { showToggle }) {
    const dashboard = getDashboard();
    const owned = isOwnedProject(dashboard, project);
    const isShared = project.visibility === 'company';

    const meta = el('div', { className: 'sharing-centre-row-meta', children: [
      el('span', { className: 'sharing-centre-audience', text: audienceLabel(project) }),
      el('span', { className: 'sharing-centre-dot', text: '·' }),
      el('span', { className: 'sharing-centre-count', text: pageCountText(project) })
    ] });

    // Only show the owner attribution line when it adds information — i.e. for
    // projects the viewer doesn't own. On owned rows the section header already
    // says "Shared by you" / "Not shared".
    const ownerLine = owned ? null : el('div', { className: 'sharing-centre-row-owner', text: ownerLabel(project, dashboard) });

    const main = el('div', { className: 'sharing-centre-row-main', children: [
      el('span', { className: 'sharing-centre-row-name', text: project.name }),
      meta,
      ownerLine
    ] });

    // The owner can toggle sharing. A non-owner viewer cannot un-share a
    // project they don't own (mirrors the backend owner-only update rule).
    const toggle = showToggle && owned
      ? el('button', {
        className: 'sharing-centre-toggle',
        text: isShared ? 'Make private' : 'Share with company',
        attrs: { type: 'button', 'data-project-id': project.id },
        onClick: (event) => handleToggle(event, project)
      })
      : null;

    return el('div', { className: 'sharing-centre-row', children: [main, toggle].filter(Boolean) });
  }

  async function handleToggle(event, project) {
    const button = event.currentTarget;
    const projectManager = getProjectManager();
    const dashboard = getDashboard();
    if (!projectManager || !dashboard) return;

    button.disabled = true;
    try {
      await projectManager.toggleProjectVisibility(dashboard, project.id);
      // toggleProjectVisibility updates dashboard.projects and re-renders the
      // sidebar; re-render the centre from the live dashboard so the row stays
      // in the correct section (shared -> not shared or vice versa).
      state.projects = dashboard.projects || [];
      render();
      onProjectsChanged();
    } catch (error) {
      button.disabled = false;
      state.error = error?.message || 'Could not change sharing. Try again.';
      render();
    }
  }

  function renderSection(title, rows, { hint } = {}) {
    if (!rows.length) return null;
    const headerChildren = [el('h3', { className: 'sharing-centre-section-title', text: title })];
    if (hint) headerChildren.push(el('p', { className: 'sharing-centre-section-hint', text: hint }));
    return el('section', { className: 'sharing-centre-section', children: [
      el('div', { className: 'sharing-centre-section-header', children: headerChildren }),
      ...rows
    ] });
  }

  function render() {
    const dialog = getDialog();
    if (!dialog) return;

    const dashboard = getDashboard();
    const projects = state.projects;

    const sharedByYou = projects.filter(project => isOwnedProject(dashboard, project) && project.visibility === 'company');
    const sharedWithYou = projects.filter(project => !isOwnedProject(dashboard, project));
    const notShared = projects.filter(project => isOwnedProject(dashboard, project) && project.visibility !== 'company');

    const header = el('div', { className: 'sharing-centre-header', children: [
      el('h2', { className: 'project-editor-title', text: 'Sharing', attrs: { id: 'sharing-centre-title' } }),
      el('button', { className: 'project-editor-close', text: '✕', attrs: { 'aria-label': 'Close' }, onClick: close })
    ] });

    const intro = el('p', {
      className: 'sharing-centre-intro',
      text: 'Review who can see each project. Company projects are visible to everyone sharing your email domain.'
    });

    const sections = [];

    if (state.loading) {
      sections.push(el('p', { className: 'sharing-centre-status', text: 'Loading latest sharing state…' }));
    } else if (state.error) {
      sections.push(el('p', { className: 'sharing-centre-error', text: state.error }));
    }

    if (state.usedFallback && !state.loading) {
      sections.push(el('p', {
        className: 'sharing-centre-warn',
        text: 'Couldn’t reach the server — showing the last known state.'
      }));
    }

    const sharedByYouSection = renderSection(
      'Shared by you',
      sharedByYou.map(project => createProjectRow(project, { showToggle: true })),
      { hint: sharedByYou.length ? undefined : 'You haven’t shared any projects yet.' }
    );
    if (sharedByYouSection) sections.push(sharedByYouSection);

    const sharedWithYouSection = renderSection(
      'Shared with you',
      sharedWithYou.map(project => createProjectRow(project, { showToggle: false })),
      { hint: sharedWithYou.length ? 'You can view these but can’t change their sharing.' : undefined }
    );
    if (sharedWithYouSection) sections.push(sharedWithYouSection);

    const notSharedSection = renderSection(
      'Your other projects',
      notShared.map(project => createProjectRow(project, { showToggle: true }))
    );
    if (notSharedSection) sections.push(notSharedSection);

    if (!state.loading && !sharedByYou.length && !sharedWithYou.length && !notShared.length) {
      sections.push(el('p', { className: 'sharing-centre-status', text: 'No projects to show.' }));
    }

    const footer = el('div', { className: 'sharing-centre-footer', children: [
      el('button', {
        className: 'sharing-centre-refresh',
        text: 'Refresh from server',
        attrs: { type: 'button' },
        onClick: () => { void open(); }
      })
    ] });

    dialog.replaceChildren(header, intro, ...sections, footer);
  }

  async function open() {
    show();
    state = { loading: true, error: null, projects: [], usedFallback: false };
    render();

    const dashboard = getDashboard();

    // Fresh server fetch so the centre always reflects current sharing — never
    // stale warm cache. This is the core clarity fix: opening the centre is the
    // reliable way to answer "is this actually shared?".
    try {
      const fresh = await api.getProjects({ skipCache: true });
      state.projects = Array.isArray(fresh) ? fresh : [];
      state.usedFallback = false;
      // Keep the dashboard in sync so the sidebar reflects the same truth.
      if (dashboard) {
        dashboard.projects = state.projects;
        await dashboard.persistProjects?.();
      }
    } catch {
      // Fall back to whatever the dashboard already has so the user isn't
      // staring at an empty modal on a flaky connection.
      state.projects = dashboard?.projects ? [...dashboard.projects] : [];
      state.usedFallback = true;
    } finally {
      state.loading = false;
      render();
    }
  }

  return { open, close };
}

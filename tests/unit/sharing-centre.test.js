import { describe, expect, it, vi } from 'vitest';

import { createSharingCentre } from '../../src/sharing-centre.js';

// The sharing centre is a sibling surface to import-panel: it renders into two
// pre-declared dialog shells (#sharing-centre-backdrop / -dialog). These tests
// verify the ownership-based grouping, audience labels, owner attribution, the
// null-email fallback, and that toggling calls through to the project manager.

function setupDocument() {
  document.body.innerHTML = `
    <div id="sharing-centre-backdrop" class="hidden" aria-hidden="true"></div>
    <div id="sharing-centre-dialog" class="hidden" role="dialog"></div>
  `;
}

function makeDashboard({ projects, uid = 'uid-rich' }) {
  return {
    projects,
    getCurrentUser: () => ({ uid, email: 'rich@airteam.com.au' }),
    persistProjects: vi.fn().mockResolvedValue(undefined)
  };
}

describe('sharing centre', () => {
  it('groups projects by ownership and labels audiences explicitly', async () => {
    setupDocument();
    const projects = [
      { id: 'p1', name: 'Monarc', owner_user_id: 'uid-rich', owner_user_email: 'rich@airteam.com.au', visibility: 'company', company_domain: 'airteam.com.au', page_count: 5 },
      { id: 'p2', name: 'Private thing', owner_user_id: 'uid-rich', owner_user_email: 'rich@airteam.com.au', visibility: 'private', company_domain: null, page_count: 1 },
      { id: 'p3', name: 'Top Teacher', owner_user_id: 'uid-nick', owner_user_email: 'nick@airteam.com.au', visibility: 'company', company_domain: 'airteam.com.au', page_count: 9 }
    ];
    const api = { getProjects: vi.fn().mockResolvedValue(projects) };
    const dashboard = makeDashboard({ projects });

    const centre = createSharingCentre({
      api,
      documentObj: document,
      getDashboard: () => dashboard,
      getProjectManager: () => null
    });

    await centre.open();

    const text = document.getElementById('sharing-centre-dialog').textContent;

    // Owned + company -> "Shared by you" section.
    expect(text).toContain('Shared by you');
    expect(text).toContain('Monarc');
    // The audience is named explicitly, not the vague "Shared with company".
    expect(text).toContain('Visible to everyone at airteam.com.au');

    // Not owned -> "Shared with you" section, with owner attribution.
    expect(text).toContain('Shared with you');
    expect(text).toContain('Top Teacher');
    expect(text).toContain('Shared by nick@airteam.com.au');

    // Owned + private -> "Your other projects" section.
    expect(text).toContain('Your other projects');
    expect(text).toContain('Private thing');
    expect(text).toContain('Private — only you can see it');
  });

  it('falls back to "shared with your team" when owner_user_email is null (legacy docs)', async () => {
    setupDocument();
    const projects = [
      // Legacy doc: owner_user_email missing, but visibility=company and owned
      // by someone else.
      { id: 'p1', name: 'Old shared', owner_user_id: 'uid-someone', owner_user_email: null, visibility: 'company', company_domain: 'airteam.com.au', page_count: 2 }
    ];
    const api = { getProjects: vi.fn().mockResolvedValue(projects) };
    const dashboard = makeDashboard({ projects });

    const centre = createSharingCentre({
      api,
      documentObj: document,
      getDashboard: () => dashboard,
      getProjectManager: () => null
    });

    await centre.open();

    const text = document.getElementById('sharing-centre-dialog').textContent;
    expect(text).toContain('Shared with your team');
    // Must not render a broken "Shared by null".
    expect(text).not.toContain('Shared by null');
  });

  it('lets the owner toggle sharing and re-renders from the live dashboard', async () => {
    setupDocument();
    const projects = [
      { id: 'p1', name: 'Monarc', owner_user_id: 'uid-rich', owner_user_email: 'rich@airteam.com.au', visibility: 'company', company_domain: 'airteam.com.au', page_count: 5 }
    ];
    const api = { getProjects: vi.fn().mockResolvedValue(projects) };
    const dashboard = makeDashboard({ projects });

    const toggleProjectVisibility = vi.fn().mockImplementation(() => {
      // Simulate the action: flip the project to private in the dashboard.
      dashboard.projects = dashboard.projects.map(project => (
        project.id === 'p1'
          ? { ...project, visibility: 'private', company_domain: null }
          : project
      ));
      return Promise.resolve(dashboard.projects[0]);
    });

    const centre = createSharingCentre({
      api,
      documentObj: document,
      getDashboard: () => dashboard,
      getProjectManager: () => ({ toggleProjectVisibility })
    });

    await centre.open();

    const toggleButton = document.querySelector('.sharing-centre-toggle');
    expect(toggleButton).not.toBeNull();
    expect(toggleButton.textContent).toBe('Make private');

    toggleButton.click();
    // Flush the async click handler.
    await Promise.resolve();
    await Promise.resolve();

    expect(toggleProjectVisibility).toHaveBeenCalledWith(dashboard, 'p1');
    // After toggling private, the project moves out of "Shared by you" into
    // "Your other projects", and the audience label reflects private.
    const text = document.getElementById('sharing-centre-dialog').textContent;
    expect(text).toContain('Your other projects');
    expect(text).toContain('Private — only you can see it');
  });

  it('fetches fresh state from the server on open (skipCache)', async () => {
    setupDocument();
    const api = { getProjects: vi.fn().mockResolvedValue([]) };
    const dashboard = makeDashboard({ projects: [] });

    const centre = createSharingCentre({
      api,
      documentObj: document,
      getDashboard: () => dashboard,
      getProjectManager: () => null
    });

    await centre.open();

    // The whole point: opening the centre always hits the server, never the
    // warm cache, so it reliably answers "is this actually shared?".
    expect(api.getProjects).toHaveBeenCalledWith({ skipCache: true });
  });

  it('falls back to dashboard state when the server fetch fails', async () => {
    setupDocument();
    const cachedProjects = [
      { id: 'p1', name: 'Stale', owner_user_id: 'uid-rich', visibility: 'private', page_count: 0 }
    ];
    const api = { getProjects: vi.fn().mockRejectedValue(new Error('network down')) };
    const dashboard = makeDashboard({ projects: cachedProjects });

    const centre = createSharingCentre({
      api,
      documentObj: document,
      getDashboard: () => dashboard,
      getProjectManager: () => null
    });

    await centre.open();

    const text = document.getElementById('sharing-centre-dialog').textContent;
    // Shows the fallback data plus a warning that the server couldn't be reached.
    expect(text).toContain('Stale');
    expect(text).toContain("Couldn’t reach the server");
  });

  it('shows no toggle on projects the viewer does not own', async () => {
    setupDocument();
    const projects = [
      { id: 'p1', name: 'Theirs', owner_user_id: 'uid-nick', owner_user_email: 'nick@airteam.com.au', visibility: 'company', company_domain: 'airteam.com.au', page_count: 3 }
    ];
    const api = { getProjects: vi.fn().mockResolvedValue(projects) };
    const dashboard = makeDashboard({ projects });

    const centre = createSharingCentre({
      api,
      documentObj: document,
      getDashboard: () => dashboard,
      getProjectManager: () => ({ toggleProjectVisibility: vi.fn() })
    });

    await centre.open();

    // A non-owner cannot un-share a project they don't own (mirrors the backend
    // owner-only update rule). No toggle button should render for their rows.
    expect(document.querySelector('.sharing-centre-toggle')).toBeNull();
  });
});

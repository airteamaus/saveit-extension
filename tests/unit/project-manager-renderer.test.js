import { describe, expect, it, vi } from 'vitest';

import {
  getProjectActionIcon,
  renderProjectEditor,
  renderProjectSidebar
} from '../../src/project-manager-renderer.js';

describe('project manager renderer helpers', () => {
  it('renders the sidebar unavailable state message', () => {
    document.body.innerHTML = '<div id="project-sidebar"></div>';
    const container = document.getElementById('project-sidebar');

    renderProjectSidebar(container, {
      dashboard: {
        projectsAvailable: false
      },
      htmlUtils: {
        escapeHtml: value => value
      },
      isProjectsUnavailable: () => true,
      getProjectsUnavailableMessage: () => 'Projects unavailable right now.',
      getSelectedProject: () => null
    });

    expect(container.textContent).toContain('Projects unavailable right now.');
  });

  it('renders the sidebar split by ownership with owner attribution on shared rows', () => {
    document.body.innerHTML = '<div id="project-sidebar"></div>';
    const container = document.getElementById('project-sidebar');

    renderProjectSidebar(container, {
      dashboard: {
        allItemsTotal: 4,
        allPages: [
          { id: 'page-1', pinned: true },
          { id: 'page-2', pinned: false },
          { id: 'page-3', pinned: false }
        ],
        projectsLoading: false,
        selectedProjectId: 'project-1',
        // The signed-in user owns Alpha (private) and Bravo (shared company).
        // Charlie is a company project owned by someone else — shared with me.
        getCurrentUser: () => ({ uid: 'uid-rich', email: 'rich@airteam.com.au' }),
        projects: [
          { id: 'project-1', name: 'Alpha', page_count: 2, visibility: 'private', owner_user_id: 'uid-rich' },
          { id: 'project-2', name: 'Bravo', page_count: 1, visibility: 'company', owner_user_id: 'uid-rich', company_domain: 'airteam.com.au' },
          { id: 'project-3', name: 'Charlie', page_count: 4, visibility: 'company', owner_user_id: 'uid-nick', owner_user_email: 'nick@airteam.com.au', company_domain: 'airteam.com.au' }
        ]
      },
      htmlUtils: {
        escapeHtml: value => value
      },
      isProjectsUnavailable: () => false,
      getProjectsUnavailableMessage: () => '',
      getSelectedProject: dashboard => dashboard.projects[0]
    });

    expect(container.innerHTML).toContain('project-action-archive');
    expect(container.textContent).toContain('Alpha');
    expect(container.textContent).toContain('Bravo');
    expect(container.textContent).toContain('Charlie');

    // Three-way split: Alpha (owned+private) under "Projects", Bravo
    // (owned+company) under "Shared by you", Charlie (not owned) under
    // "Shared with me". The earlier ownership-only split conflated Alpha and
    // Bravo under "Projects"; this keeps shared/private distinct.
    expect(container.textContent).toContain('Projects');
    expect(container.textContent).toContain('Shared by you');
    expect(container.textContent).toContain('Shared with me');
    expect(container.innerHTML).toContain('<span class="project-nav-count">2</span>');

    // Ordering: section header must precede its project name in the DOM.
    const text = container.textContent;
    expect(text.indexOf('Projects')).toBeLessThan(text.indexOf('Alpha'));
    expect(text.indexOf('Shared by you')).toBeLessThan(text.indexOf('Bravo'));
    expect(text.indexOf('Shared with me')).toBeLessThan(text.indexOf('Charlie'));
    // And the sections themselves appear in order.
    expect(text.indexOf('Projects')).toBeLessThan(text.indexOf('Shared by you'));
    expect(text.indexOf('Shared by you')).toBeLessThan(text.indexOf('Shared with me'));

    // The non-owned row carries owner attribution; owned rows do not.
    const subtitles = [...container.querySelectorAll('.project-nav-subtitle')].map(el => el.textContent);
    expect(subtitles).toContain('by nick@airteam.com.au');
    expect(subtitles.length).toBe(1);

    // All pages is the default first row, ahead of Pinned.
    const names = [...container.querySelectorAll('.project-nav-name')].map(el => el.textContent.trim());
    expect(names.indexOf('All pages')).toBeLessThan(names.indexOf('Pinned'));
    expect(names[0]).toBe('All pages');

    // No per-row visibility caption duplicates the section headers.
    expect(container.querySelector('.project-nav-visibility')).toBeNull();

    // The "Collections" heading is gone (the rail + section dots replace it).
    expect(container.querySelector('.project-sidebar-title')).toBeNull();

    // Every nav row carries a # channel prefix.
    const hashes = [...container.querySelectorAll('.project-nav-hash')].map(el => el.textContent);
    expect(hashes.length).toBe(names.length);
    expect(hashes.every(h => h === '#')).toBe(true);

    // Section dots: primary for "Projects", shared-green for both shared sections.
    const dotColors = [...container.querySelectorAll('.project-nav-section-dot')].map(el => el.style.background);
    expect(dotColors).toContain('var(--color-primary)');
    expect(dotColors).toContain('var(--color-shared)');
  });

  it('renders the editor unavailable state and can clear missing pages', () => {
    document.body.innerHTML = `
      <div id="project-editor-backdrop" class="hidden"></div>
      <div id="project-editor-dialog" class="hidden"></div>
    `;
    const backdrop = document.getElementById('project-editor-backdrop');
    const dialog = document.getElementById('project-editor-dialog');

    renderProjectEditor(backdrop, dialog, {
      dashboard: {
        projectsAvailable: false
      },
      htmlUtils: {
        escapeHtml: value => value
      },
      isProjectsUnavailable: () => true,
      getProjectsUnavailableMessage: () => 'Unsupported backend',
      getProjectPills: () => [],
      onMissingPage: vi.fn()
    });

    expect(backdrop.classList.contains('hidden')).toBe(false);
    expect(dialog.textContent).toContain('Unsupported backend');

    const onMissingPage = vi.fn();
    renderProjectEditor(backdrop, dialog, {
      dashboard: {
        projectsAvailable: true,
        projectEditorState: { pageId: 'missing', query: '' },
        allPages: [],
        pages: [],
        projects: []
      },
      htmlUtils: {
        escapeHtml: value => value
      },
      isProjectsUnavailable: () => false,
      getProjectsUnavailableMessage: () => '',
      getProjectPills: () => [],
      onMissingPage
    });

    expect(onMissingPage).toHaveBeenCalled();
  });

  it('returns distinct masked-icon spans for each action', () => {
    const rename = getProjectActionIcon('rename');
    const visibility = getProjectActionIcon('visibility');
    const archive = getProjectActionIcon('archive');

    // Each is a masked span pointing at a distinct Streamline icon file.
    expect(rename).toContain('project-action-icon--rename');
    expect(rename).toContain('Pencil-Edit-Desktop--Streamline-Ultimate.png');
    expect(visibility).toContain('project-action-icon--visibility');
    expect(visibility).toContain('Share-1--Streamline-Ultimate.png');
    expect(archive).toContain('project-action-icon--archive');
    expect(archive).toContain('Archive--Streamline-Ultimate.png');
  });
});

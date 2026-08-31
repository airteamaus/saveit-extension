import { describe, it, expect, vi } from 'vitest';
import { createDrawerUiController } from '../../src/newtab-drawer-ui.js';

// Regression tests for the idle-desk render branches around the org feed.
// The feed-owns-the-index path is the only render branch that does not go
// through drawerRenderer.renderResults/renderDrawerState — both of those
// paint the chrome (project sidebar + dateline) as a side effect, so the
// feed branch must paint it explicitly or the sidebar never shows loaded
// projects when the desk is idle.

function buildHarness({ feedController }) {
  document.body.innerHTML = `
    <div id="results"></div>
    <div id="strip"></div>
    <div id="dateline"></div>
  `;
  const state = {
    query: '',
    selectedProjectId: null,
    selectedDomainId: null,
    semanticLoading: false,
    semanticResults: null,
    warmUpInProgress: false,
    indexSort: 'newest',
    renderLimit: 10,
    pages: [{ id: 'p1', title: 'Page', url: 'https://a.com', saved_at: '2026-08-29T00:00:00Z' }],
    allPages: []
  };
  const projectManager = {
    getProjectPills: () => '',
    getSelectedProject: () => null,
    renderSidebar: vi.fn(),
    renderEditor: vi.fn()
  };
  const ui = createDrawerUiController({
    state,
    projectManager,
    resultsContainer: document.getElementById('results'),
    launchStripContainer: document.getElementById('strip'),
    datelineEl: document.getElementById('dateline'),
    getSavedPagesView: () => state,
    documentObj: document,
    feedController
  });
  return { ui, projectManager, state };
}

describe('drawer ui controller idle-desk feed branch', () => {
  it('paints the chrome when the feed owns the idle desk', () => {
    const feedController = { renderIdle: vi.fn(() => true), hide: vi.fn() };
    const { ui, projectManager } = buildHarness({ feedController });

    ui.renderResults();

    expect(feedController.renderIdle).toHaveBeenCalled();
    expect(projectManager.renderSidebar).toHaveBeenCalled();
  });

  it('hides the feed on drawer activity (query or scope)', () => {
    const feedController = { renderIdle: vi.fn(() => true), hide: vi.fn() };
    const { ui, state } = buildHarness({ feedController });

    state.query = 'anything';
    ui.renderResults();
    expect(feedController.hide).toHaveBeenCalled();

    state.query = '';
    state.selectedProjectId = 'project-1';
    ui.renderResults();
    expect(feedController.hide).toHaveBeenCalledTimes(2);
  });
});

describe('drawer ui controller personal-list pinned dedupe', () => {
  // The renderResults path the feed falls through to (feedController null =
  // feed unavailable) goes through drawerRenderer.renderResults — asserted
  // via the DOM it produces rather than a renderer mock.
  function buildPersonalHarness({ selectedProjectId = null } = {}) {
    document.body.innerHTML = `
      <div id="results"></div>
      <div id="strip"></div>
      <div id="dateline"></div>
    `;
    const state = {
      query: '',
      selectedProjectId,
      selectedDomainId: null,
      semanticLoading: false,
      semanticResults: null,
      warmUpInProgress: false,
      indexSort: 'newest',
      renderLimit: 10,
      pages: [
        { id: 'plain', title: 'Plain', url: 'https://a.com/1', saved_at: '2026-08-29T00:00:00Z', pinned: false },
        { id: 'pinned', title: 'Pinned', url: 'https://a.com/2', saved_at: '2026-08-28T00:00:00Z', pinned: true }
      ],
      allPages: [
        { id: 'plain', title: 'Plain', url: 'https://a.com/1', saved_at: '2026-08-29T00:00:00Z', pinned: false },
        { id: 'pinned', title: 'Pinned', url: 'https://a.com/2', saved_at: '2026-08-28T00:00:00Z', pinned: true }
      ]
    };
    const projectManager = {
      getProjectPills: () => '',
      getSelectedProject: () => (selectedProjectId ? { name: 'Proj' } : null),
      renderSidebar: vi.fn(),
      renderEditor: vi.fn()
    };
    const ui = createDrawerUiController({
      state,
      projectManager,
      resultsContainer: document.getElementById('results'),
      launchStripContainer: document.getElementById('strip'),
      datelineEl: document.getElementById('dateline'),
      getSavedPagesView: () => state,
      documentObj: document,
      feedController: null
    });
    return { ui, state };
  }

  it('idle list omits pinned rows (the launch strip shows them above)', () => {
    const { ui } = buildPersonalHarness();

    ui.renderResults();

    const rowIds = [...document.querySelectorAll('.index-row')].map(el => el.dataset.pageId);
    expect(rowIds).toEqual(['plain']);
    // The strip above still carries the pinned page.
    expect(document.querySelector('#strip .launch-chip')?.dataset.pageId).toBe('pinned');
  });

  it('scoped lists keep pinned rows (the strip is hidden there)', () => {
    const { ui } = buildPersonalHarness({ selectedProjectId: 'project-1' });

    ui.renderResults();

    const rowIds = [...document.querySelectorAll('.index-row')].map(el => el.dataset.pageId);
    expect(rowIds).toContain('pinned');
    expect(document.querySelector('#strip .launch-chip')).toBeNull();
  });
});

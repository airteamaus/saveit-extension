import { describe, expect, it } from 'vitest';

import { initSidebarOverlay } from '../../src/newtab-app.js';

function setup({ sidebarHidden = false } = {}) {
  document.body.innerHTML = `
    <button id="toggle" aria-expanded="false" aria-controls="sidebar"></button>
    <div id="backdrop" class="hidden"></div>
    <aside id="sidebar"></aside>
  `;
  const toggleBtn = document.getElementById('toggle');
  const backdrop = document.getElementById('backdrop');
  const sidebar = document.getElementById('sidebar');
  if (sidebarHidden) {
    sidebar.classList.add('hidden');
  }
  initSidebarOverlay({ sidebar, toggleBtn, backdrop, documentObj: document });
  return { toggleBtn, backdrop, sidebar };
}

function click(el) {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

describe('initSidebarOverlay', () => {
  it('opens the overlay on toggle click: adds is-overlay-open, shows backdrop, sets aria-expanded', () => {
    const { toggleBtn, backdrop, sidebar } = setup();

    click(toggleBtn);

    expect(sidebar.classList.contains('is-overlay-open')).toBe(true);
    expect(backdrop.classList.contains('hidden')).toBe(false);
    expect(toggleBtn.getAttribute('aria-expanded')).toBe('true');
  });

  it('closes the overlay on a second toggle click', () => {
    const { toggleBtn, backdrop, sidebar } = setup();
    click(toggleBtn); // open
    click(toggleBtn); // close

    expect(sidebar.classList.contains('is-overlay-open')).toBe(false);
    expect(backdrop.classList.contains('hidden')).toBe(true);
    expect(toggleBtn.getAttribute('aria-expanded')).toBe('false');
  });

  it('closes on backdrop click', () => {
    const { toggleBtn, backdrop, sidebar } = setup();
    click(toggleBtn); // open
    click(backdrop);  // close via backdrop

    expect(sidebar.classList.contains('is-overlay-open')).toBe(false);
    expect(toggleBtn.getAttribute('aria-expanded')).toBe('false');
  });

  it('closes on Escape', () => {
    const { toggleBtn, sidebar } = setup();
    click(toggleBtn); // open
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(sidebar.classList.contains('is-overlay-open')).toBe(false);
    expect(toggleBtn.getAttribute('aria-expanded')).toBe('false');
  });

  it('closes when a sidebar nav item (button/a) is clicked', () => {
    const { toggleBtn, sidebar } = setup();
    // add a nav button inside the sidebar
    const navBtn = document.createElement('button');
    navBtn.textContent = 'All pages';
    sidebar.appendChild(navBtn);

    click(toggleBtn); // open
    click(navBtn);    // clicking a nav item closes

    expect(sidebar.classList.contains('is-overlay-open')).toBe(false);
  });

  it('does NOT close when a non-interactive area of the sidebar is clicked', () => {
    const { toggleBtn, sidebar } = setup();
    click(toggleBtn); // open
    // click the sidebar itself (not a button/a)
    click(sidebar);

    expect(sidebar.classList.contains('is-overlay-open')).toBe(true);
  });

  it('no-ops the open when the sidebar is auth-hidden (signed out)', () => {
    const { toggleBtn, backdrop, sidebar } = setup({ sidebarHidden: true });
    click(toggleBtn);

    // the auth .hidden class must not be fought — overlay stays closed
    expect(sidebar.classList.contains('is-overlay-open')).toBe(false);
    expect(backdrop.classList.contains('hidden')).toBe(true);
    expect(toggleBtn.getAttribute('aria-expanded')).toBe('false');
  });

  it('is safe to call with missing elements (no throw)', () => {
    expect(() => initSidebarOverlay({})).not.toThrow();
    expect(() => initSidebarOverlay({ sidebar: null, toggleBtn: null })).not.toThrow();
  });
});

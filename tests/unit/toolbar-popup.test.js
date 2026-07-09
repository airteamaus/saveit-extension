import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('toolbar popup', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = `
      <main class="toolbar-popup-shell">
        <button id="save-default-btn" type="button">Save</button>
        <div id="toolbar-project-list" aria-busy="true">
          <p class="toolbar-popup-empty">Loading projects...</p>
        </div>
        <p id="toolbar-popup-status"></p>
      </main>
    `;
  });

  it('keeps loading text in one place while projects are loading', async () => {
    let resolveProjects;
    const sendMessage = vi.fn(() => new Promise((resolve) => {
      resolveProjects = resolve;
    }));

    globalThis.browser = {
      runtime: {
        sendMessage
      }
    };

    await import('../../src/toolbar-popup.js?loading-state');
    await Promise.resolve();

    expect(document.getElementById('toolbar-project-list')?.textContent).toContain('Loading projects...');
    expect(document.getElementById('toolbar-popup-status')?.textContent).toBe('');

    resolveProjects({ success: true, projects: [] });
    await Promise.resolve();
  });

  it('renders project buttons from the background response', async () => {
    const sendMessage = vi.fn(async (message) => {
      if (message.action === 'getToolbarProjects') {
        return {
          success: true,
          projects: [
            { id: 'project-1', name: "Buckley's product" },
            { id: 'project-2', name: 'AI radar' }
          ]
        };
      }

      return { success: true };
    });

    globalThis.browser = {
      runtime: {
        sendMessage
      }
    };

    await import('../../src/toolbar-popup.js?render-projects');
    await Promise.resolve();

    const projectButtons = [...document.querySelectorAll('.toolbar-popup-project-btn')];
    expect(projectButtons.map((button) => button.textContent)).toEqual(["Buckley's product", 'AI radar']);
  });

  it('sends the selected project when a project button is clicked', async () => {
    const closeSpy = vi.spyOn(window, 'close').mockImplementation(() => {});
    const sendMessage = vi.fn(async (message) => {
      if (message.action === 'getToolbarProjects') {
        return {
          success: true,
          projects: [{ id: 'project-1', name: "Buckley's product" }]
        };
      }

      return { success: true };
    });

    globalThis.browser = {
      runtime: {
        sendMessage
      }
    };

    await import('../../src/toolbar-popup.js?project-click');
    await Promise.resolve();

    document.querySelector('.toolbar-popup-project-btn')?.click();
    await vi.waitFor(() => {
      expect(sendMessage).toHaveBeenNthCalledWith(2, {
        action: 'saveCurrentPage',
        projectId: 'project-1'
      });
      expect(closeSpy).toHaveBeenCalled();
    });

    closeSpy.mockRestore();
  });
});

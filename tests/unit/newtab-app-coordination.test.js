import { describe, expect, it, vi } from 'vitest';

import {
  createNewtabAuthLifecycle,
  createSavedPagesFooterUpdater
} from '../../src/newtab-app-coordination.js';

describe('newtab app coordination', () => {
  it('maps saved-pages totals to the footer stats payload', () => {
    const updateStatsDisplay = vi.fn();
    const updateFooter = createSavedPagesFooterUpdater({
      versionIndicator: { id: 'version-indicator' },
      updateStatsDisplay
    });

    updateFooter(42);
    updateFooter(null);

    expect(updateStatsDisplay).toHaveBeenNthCalledWith(1, { id: 'version-indicator' }, { total: 42 });
    expect(updateStatsDisplay).toHaveBeenNthCalledWith(2, { id: 'version-indicator' }, null);
  });

  it('coordinates signed-in and signed-out auth lifecycle behavior', async () => {
    const drawerController = {
      handleSignedIn: vi.fn().mockResolvedValue(undefined),
      handleSignedOut: vi.fn()
    };
    const lifecycle = createNewtabAuthLifecycle({
      drawerController
    });

    await lifecycle.onSignedIn();
    await lifecycle.onSignedOut();

    expect(drawerController.handleSignedIn).toHaveBeenCalled();
    expect(drawerController.handleSignedOut).toHaveBeenCalled();
  });
});

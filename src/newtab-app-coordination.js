export function createSavedPagesFooterUpdater({
  versionIndicator,
  updateStatsDisplay
}) {
  return total => {
    updateStatsDisplay(
      versionIndicator,
      typeof total === 'number' ? { total } : null
    );
  };
}

export function createFavoritesRefreshHandler(favoritesController) {
  return () => {
    void favoritesController.load();
  };
}

export function createNewtabAuthLifecycle({
  drawerController
}) {
  return {
    async onSignedIn() {
      await drawerController.handleSignedIn();
    },
    async onSignedOut() {
      drawerController.handleSignedOut();
    }
  };
}

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
  favoritesController,
  drawerController
}) {
  return {
    async onSignedIn() {
      await Promise.all([
        favoritesController.load(),
        drawerController.handleSignedIn()
      ]);
    },
    async onSignedOut() {
      favoritesController.reset();
      drawerController.handleSignedOut();
    }
  };
}

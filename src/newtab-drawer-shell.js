export function getSavedPagesDrawerUrl(locationHref, {
  isOpen,
  searchQuery = '',
  drawerParam = 'drawer',
  drawerValue = 'saved-pages'
}) {
  const url = new URL(locationHref);

  if (isOpen) {
    url.searchParams.set(drawerParam, drawerValue);
    if (searchQuery.trim()) {
      url.searchParams.set('search', searchQuery.trim());
    } else {
      url.searchParams.delete('search');
    }
  } else {
    url.searchParams.delete(drawerParam);
    url.searchParams.delete('search');
  }

  return url;
}

export function shouldOpenDrawerCardInNewTab(event = {}) {
  return Boolean(event.metaKey || event.ctrlKey || event.button === 1);
}

export function createDrawerShellController({
  state,
  savedPagesToggleBtn,
  savedPagesDrawer,
  savedPagesDrawerSearchInput,
  savedPagesDrawerClearBtn,
  getDataController,
  renderDrawerResults,
  drawerParam = 'drawer',
  drawerValue = 'saved-pages',
  windowObj = window,
  documentObj = document
}) {
  function isDrawerOpen() {
    return Boolean(savedPagesDrawer && !savedPagesDrawer.classList.contains('hidden'));
  }

  function getSearchQuery() {
    return savedPagesDrawerSearchInput?.value || state.query;
  }

  function updateDrawerUrl(isOpen, searchQuery = '') {
    const url = getSavedPagesDrawerUrl(windowObj.location.href, {
      isOpen,
      searchQuery,
      drawerParam,
      drawerValue
    });

    windowObj.history.replaceState({}, '', url);
  }

  function setDrawerToggleState(isOpen) {
    if (!savedPagesToggleBtn) return;

    savedPagesToggleBtn.setAttribute('aria-expanded', String(isOpen));
    savedPagesToggleBtn.setAttribute('aria-label', isOpen ? 'Close saved pages' : 'Open saved pages');
    savedPagesToggleBtn.title = isOpen ? 'Close saved pages' : 'Open saved pages';
    savedPagesToggleBtn.classList.toggle('is-active', isOpen);
  }

  function setDrawerSearchValue(query = '') {
    if (!savedPagesDrawerSearchInput || !savedPagesDrawerClearBtn) return;

    savedPagesDrawerSearchInput.value = query;
    savedPagesDrawerClearBtn.classList.toggle('hidden', !query.trim());
  }

  function navigateDrawerCard(card, event = {}) {
    const url = card?.dataset?.url;
    if (!url) {
      return;
    }

    if (shouldOpenDrawerCardInNewTab(event)) {
      windowObj.open(url, '_blank', 'noopener');
      return;
    }

    windowObj.location.assign(url);
  }

  function openSavedPagesDrawer({ syncUrl = true, searchQuery = '' } = {}) {
    if (!savedPagesDrawer) return;

    setDrawerSearchValue(searchQuery);
    savedPagesDrawer.classList.remove('hidden');
    savedPagesDrawer.setAttribute('aria-hidden', 'false');
    documentObj.body.classList.add('saved-pages-drawer-open');
    setDrawerToggleState(true);

    if (syncUrl) {
      updateDrawerUrl(true, searchQuery);
    }

    const dataController = getDataController();
    if (!state.hasInitialized) {
      void dataController.loadDrawerBasePages({ query: searchQuery, syncUrl: false });
    } else if (state.query !== searchQuery.trim()) {
      void dataController.loadDrawerResults(searchQuery, { syncUrl: false });
    } else {
      renderDrawerResults();
    }
  }

  function closeSavedPagesDrawer({ syncUrl = true } = {}) {
    if (!savedPagesDrawer) return;

    savedPagesDrawer.classList.add('hidden');
    savedPagesDrawer.setAttribute('aria-hidden', 'true');
    documentObj.body.classList.remove('saved-pages-drawer-open');
    setDrawerToggleState(false);

    if (syncUrl) {
      updateDrawerUrl(false);
    }
  }

  return {
    closeSavedPagesDrawer,
    getSearchQuery,
    isDrawerOpen,
    navigateDrawerCard,
    openSavedPagesDrawer,
    setDrawerSearchValue,
    setDrawerToggleState,
    updateDrawerUrl
  };
}

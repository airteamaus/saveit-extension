import { FavoritesStore } from './favorites-store.js';
import { replaceElementHtml } from './dom-render.js';
import { reconcileKeyedChildren } from './keyed-dom-list.js';
import {
  createBookmarkIconElement,
  escapeHtml,
  formatSavedDate,
  getFaviconUrl,
  getPageDomain,
  renderPageTags,
  truncateText
} from './newtab-shared.js';

const FAVORITES_MAX_ITEMS = 300;
const FAVORITES_INITIAL_FETCH_LIMIT = 36;
const FAVORITES_PREFETCH_BATCH_LIMIT = 72;
const FAVORITES_DRAG_THRESHOLD = 40;
const FAVORITES_MAX_COLUMNS = 10;
const FAVORITES_MIN_COLUMNS = 6;
const FAVORITES_MOBILE_COLUMNS = 4;
const FAVORITES_MOBILE_ROWS = 2;
const FAVORITES_DEFAULT_ROWS = 2;
const FAVORITES_TALL_SCREEN_ROWS = 3;
const FAVORITES_TALL_SCREEN_HEIGHT = 860;
const FAVORITES_WIDE_SCREEN_THREE_ROW_WIDTH = 1280;
const FAVORITES_DESKTOP_TILE_WIDTH = 88;
const FAVORITES_MOBILE_TILE_WIDTH = 80;
const FAVORITES_TILE_GAP = 12;
const FAVORITES_WIDTH_PADDING = 220;
const FAVORITES_MAX_GRID_WIDTH = 1008;
const FAVORITE_PREVIEW_WIDTH_MULTIPLIER = 4;
const FAVORITE_PREVIEW_MARGIN = 8;
const FAVORITE_PREVIEW_GAP = 14;
const FAVORITES_WARM_CACHE_SCOPE = {
  surface: 'favorites-prefetch',
  sort: 'newest',
  pinnedFirst: true,
  limit: FAVORITES_MAX_ITEMS
};

export function createFavoritesStore(api) {
  return new FavoritesStore(api, {
    maxItems: FAVORITES_MAX_ITEMS,
    initialFetchLimit: FAVORITES_INITIAL_FETCH_LIMIT,
    prefetchBatchLimit: FAVORITES_PREFETCH_BATCH_LIMIT,
    warmCacheScope: FAVORITES_WARM_CACHE_SCOPE,
    initialLayout: {
      pageSize: 12,
      columns: FAVORITES_MIN_COLUMNS,
      rows: FAVORITES_DEFAULT_ROWS,
      tileWidth: FAVORITES_DESKTOP_TILE_WIDTH,
      gridWidth: FAVORITES_MAX_GRID_WIDTH
    }
  });
}

export function getFavoritesLayout(viewportWidth = window.innerWidth, viewportHeight = window.innerHeight) {
  if (viewportWidth <= 640) {
    const columns = FAVORITES_MOBILE_COLUMNS;
    const rows = FAVORITES_MOBILE_ROWS;
    const tileWidth = FAVORITES_MOBILE_TILE_WIDTH;
    return {
      columns,
      rows,
      tileWidth,
      pageSize: columns * rows,
      gridWidth: (columns * tileWidth) + ((columns - 1) * FAVORITES_TILE_GAP)
    };
  }

  const availableWidth = Math.min(
    Math.max(
      viewportWidth - FAVORITES_WIDTH_PADDING,
      FAVORITES_MIN_COLUMNS * (FAVORITES_DESKTOP_TILE_WIDTH + FAVORITES_TILE_GAP)
    ),
    FAVORITES_MAX_GRID_WIDTH
  );
  const calculatedColumns = Math.floor(
    (availableWidth + FAVORITES_TILE_GAP) / (FAVORITES_DESKTOP_TILE_WIDTH + FAVORITES_TILE_GAP)
  );
  const columns = Math.max(FAVORITES_MIN_COLUMNS, Math.min(FAVORITES_MAX_COLUMNS, calculatedColumns));
  const rows = viewportWidth >= FAVORITES_WIDE_SCREEN_THREE_ROW_WIDTH || viewportHeight >= FAVORITES_TALL_SCREEN_HEIGHT
    ? FAVORITES_TALL_SCREEN_ROWS
    : FAVORITES_DEFAULT_ROWS;

  return {
    columns,
    rows,
    tileWidth: FAVORITES_DESKTOP_TILE_WIDTH,
    pageSize: columns * rows,
    gridWidth: (columns * FAVORITES_DESKTOP_TILE_WIDTH) + ((columns - 1) * FAVORITES_TILE_GAP)
  };
}

export function createFavoritesController({
  store,
  elements,
  windowObj = window,
  documentObj = document
}) {
  const {
    favoritesSection,
    favoritesViewport,
    favoritesRow,
    favoritesPrevBtn,
    favoritesNextBtn,
    favoritesDots,
    favoriteHoverConnector,
    favoriteHoverCard
  } = elements;

  const state = {
    activePreviewId: null,
    pointerActive: false,
    pointerStartX: 0,
    pointerStartY: 0,
    pointerDeltaX: 0,
    pointerDeltaY: 0,
    dragging: false,
    suppressClick: false
  };

  function getSnapshot() {
    return store.getSnapshot();
  }

  function getFavoritePreviewWidth(sectionWidth, tileWidth) {
    const maxWidth = Math.max(160, sectionWidth - (FAVORITE_PREVIEW_MARGIN * 2));
    return Math.min(
      maxWidth,
      (tileWidth * FAVORITE_PREVIEW_WIDTH_MULTIPLIER) + (FAVORITES_TILE_GAP * 3) + 28
    );
  }

  function clampFavoritePreviewLeft(sectionWidth, preferredLeft, previewWidth) {
    return Math.max(
      FAVORITE_PREVIEW_MARGIN,
      Math.min(preferredLeft, sectionWidth - previewWidth - FAVORITE_PREVIEW_MARGIN)
    );
  }

  function clampFavoritePreviewTop(sectionHeight, preferredTop, previewHeight) {
    return Math.max(
      FAVORITE_PREVIEW_MARGIN,
      Math.min(preferredTop, sectionHeight - previewHeight - FAVORITE_PREVIEW_MARGIN)
    );
  }

  function getFavoritePreviewPlacement(sectionRect, itemRect, previewRect) {
    const sectionWidth = sectionRect.width;
    const sectionHeight = sectionRect.height;
    const itemLeft = itemRect.left - sectionRect.left;
    const itemRight = itemRect.right - sectionRect.left;
    const itemTop = itemRect.top - sectionRect.top;
    const itemBottom = itemRect.bottom - sectionRect.top;
    const availableRight = sectionRect.right - itemRect.right - FAVORITE_PREVIEW_MARGIN;
    const availableLeft = itemRect.left - sectionRect.left - FAVORITE_PREVIEW_MARGIN;

    let placement = 'right';
    let left = itemRight + FAVORITE_PREVIEW_GAP;
    let top = clampFavoritePreviewTop(
      sectionHeight,
      (itemTop + (itemRect.height / 2)) - (previewRect.height / 2),
      previewRect.height
    );

    if (availableRight < previewRect.width + FAVORITE_PREVIEW_GAP) {
      if (availableLeft >= previewRect.width + FAVORITE_PREVIEW_GAP) {
        placement = 'left';
        left = itemLeft - previewRect.width - FAVORITE_PREVIEW_GAP;
      } else {
        const availableBelow = sectionRect.bottom - itemRect.bottom - FAVORITE_PREVIEW_MARGIN;
        const availableAbove = itemRect.top - sectionRect.top - FAVORITE_PREVIEW_MARGIN;
        left = clampFavoritePreviewLeft(
          sectionWidth,
          itemLeft + (itemRect.width / 2) - (previewRect.width / 2),
          previewRect.width
        );

        if (availableBelow >= previewRect.height + FAVORITE_PREVIEW_GAP || availableBelow >= availableAbove) {
          placement = 'below';
          top = itemBottom + FAVORITE_PREVIEW_GAP;
        } else {
          placement = 'above';
          top = itemTop - previewRect.height - FAVORITE_PREVIEW_GAP;
        }
      }
    }

    left = clampFavoritePreviewLeft(sectionWidth, left, previewRect.width);
    top = clampFavoritePreviewTop(sectionHeight, top, previewRect.height);

    return { placement, left, top };
  }

  function clearFavoritePreviewHighlight() {
    documentObj.querySelectorAll('.favorite-item.is-preview-active').forEach(item => {
      item.classList.remove('is-preview-active');
    });
  }

  function hideFavoriteConnector() {
    if (!favoriteHoverConnector) return;

    favoriteHoverConnector.classList.add('hidden');
    favoriteHoverConnector.setAttribute('aria-hidden', 'true');
  }

  function showFavoriteConnector(itemRect, previewRect, sectionRect, placement) {
    if (!favoriteHoverConnector) return;

    const itemCenterX = (itemRect.left - sectionRect.left) + (itemRect.width / 2);
    const itemCenterY = (itemRect.top - sectionRect.top) + (itemRect.height / 2);
    let startX = itemCenterX;
    let startY = itemCenterY;
    let endX = previewRect.left - sectionRect.left;
    let endY = (previewRect.top - sectionRect.top) + (previewRect.height / 2);

    if (placement === 'right') {
      startX = itemRect.right - sectionRect.left;
    } else if (placement === 'left') {
      startX = itemRect.left - sectionRect.left;
      endX = previewRect.right - sectionRect.left;
    } else if (placement === 'below') {
      startY = itemRect.bottom - sectionRect.top;
      endX = (previewRect.left - sectionRect.left) + (previewRect.width / 2);
      endY = previewRect.top - sectionRect.top;
    } else if (placement === 'above') {
      startY = itemRect.top - sectionRect.top;
      endX = (previewRect.left - sectionRect.left) + (previewRect.width / 2);
      endY = previewRect.bottom - sectionRect.top;
    }

    const deltaX = endX - startX;
    const deltaY = endY - startY;
    const length = Math.sqrt((deltaX ** 2) + (deltaY ** 2));
    const angle = Math.atan2(deltaY, deltaX);

    favoriteHoverConnector.style.left = `${startX}px`;
    favoriteHoverConnector.style.top = `${startY}px`;
    favoriteHoverConnector.style.width = `${length}px`;
    favoriteHoverConnector.style.transform = `rotate(${angle}rad)`;
    favoriteHoverConnector.classList.remove('hidden');
    favoriteHoverConnector.setAttribute('aria-hidden', 'false');
  }

  function hideFavoritePreview() {
    state.activePreviewId = null;
    clearFavoritePreviewHighlight();
    hideFavoriteConnector();
    if (!favoriteHoverCard) return;

    favoriteHoverCard.classList.add('hidden');
    favoriteHoverCard.setAttribute('aria-hidden', 'true');
  }

  function showFavoritePreview(page, item) {
    if (!favoriteHoverCard || !favoritesSection || !page || !item) {
      return;
    }

    const title = truncateText(page.title || '', 256);
    const domain = getPageDomain(page);
    const summary = page.ai_summary_brief || page.description || '';
    const savedDate = formatSavedDate(page.saved_at);
    const tagsHtml = renderPageTags(page);
    const meta = [];

    if (domain) meta.push(`<span>${escapeHtml(domain)}</span>`);
    if (savedDate) meta.push(`<span>Saved ${escapeHtml(savedDate)}</span>`);
    if (page.reading_time_minutes) meta.push(`<span>${page.reading_time_minutes} min read</span>`);
    if (page.pinned) meta.push('<span>Pinned</span>');

    replaceElementHtml(favoriteHoverCard, `
      <div class="favorite-hover-card-header">
        <div class="favorite-hover-card-icon">
          ${domain ? `<img src="https://icons.duckduckgo.com/ip3/${escapeHtml(domain)}.ico" alt="" width="22" height="22">` : ''}
        </div>
        <h3 class="favorite-hover-card-title">${escapeHtml(title)}</h3>
      </div>
      ${summary ? `<p class="favorite-hover-card-summary">${escapeHtml(truncateText(summary, 220))}</p>` : ''}
      ${tagsHtml ? `<div class="favorite-hover-card-tags">${tagsHtml}</div>` : ''}
      ${meta.length ? `<div class="favorite-hover-card-meta">${meta.join('<span class="favorite-hover-card-separator">•</span>')}</div>` : ''}
    `);

    const sectionRect = favoritesSection.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    const previewWidth = getFavoritePreviewWidth(sectionRect.width, getSnapshot().tileWidth);

    favoriteHoverCard.style.width = `${previewWidth}px`;
    favoriteHoverCard.classList.remove('hidden');
    favoriteHoverCard.setAttribute('aria-hidden', 'false');

    const previewRect = favoriteHoverCard.getBoundingClientRect();
    const { placement, left, top } = getFavoritePreviewPlacement(sectionRect, itemRect, previewRect);

    favoriteHoverCard.style.left = `${left}px`;
    favoriteHoverCard.style.top = `${top}px`;
    favoriteHoverCard.dataset.placement = placement;
    clearFavoritePreviewHighlight();
    item.classList.add('is-preview-active');

    const updatedPreviewRect = favoriteHoverCard.getBoundingClientRect();
    showFavoriteConnector(itemRect, updatedPreviewRect, sectionRect, placement);
    state.activePreviewId = page.id;
  }

  function createFavoriteItem(page) {
    const item = documentObj.createElement('a');
    item.className = 'favorite-item';
    item.href = page.url || '#';
    item.dataset.pageId = page.id;

    const iconContainer = documentObj.createElement('div');
    iconContainer.className = 'favorite-icon';

    const faviconUrl = getFaviconUrl(page.url);
    if (faviconUrl) {
      const img = documentObj.createElement('img');
      img.src = faviconUrl;
      img.alt = '';
      img.onerror = () => {
        iconContainer.replaceChildren(createBookmarkIconElement(documentObj));
      };
      iconContainer.appendChild(img);
    } else {
      iconContainer.replaceChildren(createBookmarkIconElement(documentObj));
    }

    const title = documentObj.createElement('span');
    title.className = 'favorite-title';
    title.textContent = page.title || getPageDomain(page) || page.url || 'Saved page';
    title.title = page.title || page.url || title.textContent;

    item.appendChild(iconContainer);
    item.appendChild(title);

    item.addEventListener('mouseenter', () => showFavoritePreview(page, item));
    item.addEventListener('focus', () => showFavoritePreview(page, item));
    item.addEventListener('mouseleave', hideFavoritePreview);
    item.addEventListener('blur', hideFavoritePreview);

    return item;
  }

  function updateFavoritesNav(snapshot = getSnapshot()) {
    const totalPages = snapshot.pagedPages.length;
    const hasMultiplePages = totalPages > 1;

    favoritesPrevBtn?.classList.toggle('favorites-nav-hidden', !hasMultiplePages);
    favoritesNextBtn?.classList.toggle('favorites-nav-hidden', !hasMultiplePages);

    if (favoritesPrevBtn) {
      favoritesPrevBtn.disabled = !hasMultiplePages || snapshot.currentPage === 0;
    }

    if (favoritesNextBtn) {
      favoritesNextBtn.disabled = !hasMultiplePages || snapshot.currentPage >= totalPages - 1;
    }

    if (!favoritesDots) return;

    favoritesDots.replaceChildren();
    favoritesDots.classList.toggle('hidden', !hasMultiplePages);

    if (!hasMultiplePages) return;

    snapshot.pagedPages.forEach((_, index) => {
      const dot = documentObj.createElement('button');
      dot.type = 'button';
      dot.className = 'favorite-dot';
      dot.setAttribute('aria-label', `Show favorites page ${index + 1}`);
      dot.setAttribute('aria-pressed', String(index === snapshot.currentPage));
      if (index === snapshot.currentPage) {
        dot.classList.add('active');
      }
      dot.addEventListener('click', () => void store.goToPage(index));
      favoritesDots.appendChild(dot);
    });
  }

  function applyFavoritesLayout(snapshot = getSnapshot()) {
    favoritesSection?.style.setProperty('--favorites-grid-width', `${snapshot.gridWidth}px`);
    favoritesRow?.style.setProperty('--favorites-columns', String(snapshot.columns));
    favoritesRow?.style.setProperty('--favorites-tile-width', `${snapshot.tileWidth}px`);
  }

  function renderFavoritesPage(snapshot = getSnapshot()) {
    if (!favoritesRow || !favoritesSection) return;

    hideFavoritePreview();
    applyFavoritesLayout(snapshot);

    const favorites = snapshot.pagedPages[snapshot.currentPage] || [];
    reconcileKeyedChildren(favoritesRow, favorites, {
      getKey: page => page.id || null,
      getNodeKey: node => node?.dataset?.pageId || null,
      renderItem: (page, existingNode) => {
        const nextNode = createFavoriteItem(page);
        return existingNode && existingNode.outerHTML === nextNode.outerHTML
          ? existingNode
          : nextNode;
      }
    });

    favoritesSection.classList.toggle('hidden', favorites.length === 0);
    updateFavoritesNav(snapshot);
  }

  function handleFavoritesResize() {
    const snapshot = getSnapshot();
    const layout = getFavoritesLayout();
    if (
      layout.pageSize === snapshot.pageSize &&
      layout.columns === snapshot.columns &&
      layout.tileWidth === snapshot.tileWidth
    ) {
      return;
    }

    hideFavoritePreview();
    store.applyLayout(layout);
  }

  function clearFavoritesPointerState() {
    state.pointerActive = false;
    state.pointerDeltaX = 0;
    state.pointerDeltaY = 0;
    state.dragging = false;
    favoritesViewport?.classList.remove('is-dragging');
  }

  function handleFavoritesPointerDown(event) {
    if (!getSnapshot().pagedPages.length) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    hideFavoritePreview();
    state.pointerActive = true;
    state.pointerStartX = event.clientX;
    state.pointerStartY = event.clientY;
    state.pointerDeltaX = 0;
    state.pointerDeltaY = 0;
    state.dragging = false;
  }

  function handleFavoritesPointerMove(event) {
    if (!state.pointerActive) return;

    state.pointerDeltaX = event.clientX - state.pointerStartX;
    state.pointerDeltaY = event.clientY - state.pointerStartY;

    if (
      Math.abs(state.pointerDeltaX) > 10 &&
      Math.abs(state.pointerDeltaX) > Math.abs(state.pointerDeltaY)
    ) {
      state.dragging = true;
      favoritesViewport?.classList.add('is-dragging');
    }
  }

  function handleFavoritesPointerUp() {
    if (!state.pointerActive) return;

    const shouldPage =
      state.dragging &&
      Math.abs(state.pointerDeltaX) >= FAVORITES_DRAG_THRESHOLD &&
      Math.abs(state.pointerDeltaX) > Math.abs(state.pointerDeltaY);

    if (shouldPage) {
      const snapshot = getSnapshot();
      const targetPage = state.pointerDeltaX < 0
        ? snapshot.currentPage + 1
        : snapshot.currentPage - 1;
      void store.goToPage(targetPage);

      state.suppressClick = true;
      windowObj.setTimeout(() => {
        state.suppressClick = false;
      }, 150);
    }

    clearFavoritesPointerState();
  }

  function init() {
    store.subscribe(() => {
      renderFavoritesPage();
    });

    store.applyLayout(getFavoritesLayout(), { emit: false });
    renderFavoritesPage();

    favoritesPrevBtn?.addEventListener('click', () => void store.goToPage(getSnapshot().currentPage - 1));
    favoritesNextBtn?.addEventListener('click', () => void store.goToPage(getSnapshot().currentPage + 1));

    favoritesViewport?.addEventListener('pointerdown', handleFavoritesPointerDown);
    favoritesViewport?.addEventListener('pointermove', handleFavoritesPointerMove);
    favoritesViewport?.addEventListener('pointerup', handleFavoritesPointerUp);
    favoritesViewport?.addEventListener('pointercancel', clearFavoritesPointerState);
    favoritesViewport?.addEventListener('pointerleave', (event) => {
      if (state.pointerActive && event.pointerType === 'mouse') {
        handleFavoritesPointerUp();
      }
    });
    favoritesViewport?.addEventListener('click', (event) => {
      if (!state.suppressClick) return;
      event.preventDefault();
      event.stopPropagation();
      state.suppressClick = false;
    }, true);

    windowObj.addEventListener('resize', handleFavoritesResize);
  }

  async function load() {
    try {
      if (!store?.api?.getFavorites) {
        store.reset();
        return;
      }

      await store.hydrate();
    } catch (error) {
      console.error('[newtab] Failed to load favorites:', error);
    }
  }

  function reset() {
    hideFavoritePreview();
    store.reset();
  }

  return {
    init,
    load,
    reset
  };
}

import {
  getMockFavorites,
  getMockPages
} from './api-pages-standalone.js';

function buildSavedPagesParams(options) {
  const params = {
    limit: options.limit || 50,
    search: options.search || '',
    sort: options.sort || 'newest'
  };

  if (options.cursor) {
    params.cursor = options.cursor;
  }

  if (options.pinnedFirst !== undefined) {
    params.pinnedFirst = options.pinnedFirst;
  }

  if (options.projectId) {
    params.projectId = options.projectId;
  }

  if (options.newerThanId) {
    params.newerThanId = options.newerThanId;
  }

  if (options.latestKnownId) {
    params.latestKnownId = options.latestKnownId;
  }

  return params;
}

function buildFavoritesParams(options) {
  const params = {
    favorites: 'true',
    limit: options.limit || 300,
    sort: options.sort || 'newest'
  };

  if (options.cursor) {
    params.cursor = options.cursor;
  }

  if (options.pinnedFirst !== undefined) {
    params.pinnedFirst = options.pinnedFirst;
  }

  if (options.projectId) {
    params.projectId = options.projectId;
  }

  if (options.newerThanId) {
    params.newerThanId = options.newerThanId;
  }

  if (options.latestKnownId) {
    params.latestKnownId = options.latestKnownId;
  }

  return params;
}

function normalizePagination(data) {
  const rawPagination = data?.pagination && typeof data.pagination === 'object'
    ? data.pagination
    : null;
  const normalizedTotal = typeof rawPagination?.total === 'number'
    ? rawPagination.total
    : (typeof data?.total === 'number' ? data.total : null);
  const normalizedHasNextPage = rawPagination?.hasNextPage === true
    || rawPagination?.has_more === true
    || data?.hasMore === true
    || data?.has_more === true;
  const normalizedNextCursor = rawPagination?.nextCursor
    ?? rawPagination?.next_cursor
    ?? data?.nextCursor
    ?? data?.next_cursor
    ?? null;

  return {
    total: normalizedTotal,
    hasNextPage: normalizedHasNextPage,
    nextCursor: normalizedHasNextPage ? normalizedNextCursor : null
  };
}

export function normalizePagesResponse(data, context) {
  const pages = Array.isArray(data?.pages)
    ? data.pages
    : (Array.isArray(data) ? data : []);
  const pagination = normalizePagination(data);
  const normalizedResponse = {
    pages,
    pagination: {
      total: typeof pagination.total === 'number' ? pagination.total : pages.length,
      hasNextPage: pagination.hasNextPage,
      nextCursor: pagination.hasNextPage ? pagination.nextCursor : null
    },
    meta: data.meta || {}
  };

  debug(`[${context}] Normalized response:`, {
    count: normalizedResponse.pages.length,
    total: normalizedResponse.pagination.total,
    first_item: normalizedResponse.pages[0]
      ? { id: normalizedResponse.pages[0].id, title: normalizedResponse.pages[0].title }
      : null
  });

  return normalizedResponse;
}

async function getCachedOrFreshList(API, {
  surface,
  options,
  context,
  fetcher,
  mockFetcher
}) {
  debug(`[${context}] START:`, {
    isExtension: API.isExtension,
    skipCache: options.skipCache || false
  });

  if (API.isExtension) {
    const cacheScope = API._buildListCacheScope(surface, options);

    if (!options.skipCache) {
      const cached = await API.getCachedPages(cacheScope);
      if (cached) {
        debug(`[${context}] Returning cached data:`, {
          count: cached.pages?.length,
          total: cached.pagination?.total
        });
        return API._withCacheMetadata(cached, true);
      }
    }

    return API._executeWithErrorHandling(
      async () => {
        const data = await fetcher(options);
        const normalized = normalizePagesResponse(data, context);
        await API.setCachedPages(normalized, cacheScope);
        return API._withCacheMetadata(normalized, false);
      },
      context,
      { options }
    );
  }

  return API._withCacheMetadata(mockFetcher(options), false);
}

async function headListFreshness(API, {
  options,
  context,
  fetcher
}) {
  if (!options.latestKnownId) {
    return {
      hasUpdates: true,
      anchorFound: false,
      canIncrementalSync: false
    };
  }

  if (!API.isExtension) {
    return {
      hasUpdates: false,
      anchorFound: true,
      canIncrementalSync: true
    };
  }

  return API._executeWithErrorHandling(
    async () => {
      const response = await fetcher(options);
      return {
        hasUpdates: response.status !== 204,
        anchorFound: response.headers.get('x-saveit-anchor-found') !== 'false',
        canIncrementalSync: response.headers.get('x-saveit-can-incremental-sync') !== 'false'
      };
    },
    context,
    { options }
  );
}

export function applyApiPagesLists(API) {
  Object.assign(API, {
    async _fetchFromCloudFunction(options) {
      debug('[getSavedPages] Fetching from Cloud Function...');
      const data = await this._fetchWithAuth('', buildSavedPagesParams(options));
      debug('[getSavedPages] Raw JSON response:', data);
      return data;
    },

    async _headSavedPagesFromCloudFunction(options) {
      debug('[headSavedPages] Checking collection freshness...');
      return await this._requestWithAuth('', buildSavedPagesParams(options), {
        method: 'HEAD'
      });
    },

    async _fetchFavoritesFromCloudFunction(options) {
      debug('[getFavorites] Fetching favorites from Cloud Function...');
      const data = await this._fetchWithAuth('', buildFavoritesParams(options));
      debug('[getFavorites] Raw JSON response:', data);
      return data;
    },

    async _headFavoritesFromCloudFunction(options) {
      debug('[headFavorites] Checking collection freshness...');
      return await this._requestWithAuth('', buildFavoritesParams(options), {
        method: 'HEAD'
      });
    },

    _normalizeResponse(data) {
      return normalizePagesResponse(data, 'getSavedPages');
    },

    _getMockData(options) {
      return getMockPages(options);
    },

    _getMockFavorites(options = {}) {
      return getMockFavorites(options);
    },

    async getSavedPages(options = {}) {
      return getCachedOrFreshList(this, {
        surface: 'dashboard',
        options,
        context: 'getSavedPages',
        fetcher: fetchOptions => this._fetchFromCloudFunction(fetchOptions),
        mockFetcher: getMockPages
      });
    },

    async getFavorites(options = {}) {
      return getCachedOrFreshList(this, {
        surface: 'favorites',
        options,
        context: 'getFavorites',
        fetcher: fetchOptions => this._fetchFavoritesFromCloudFunction(fetchOptions),
        mockFetcher: getMockFavorites
      });
    },

    async checkSavedPagesUpdates(options = {}) {
      return headListFreshness(this, {
        options,
        context: 'headSavedPages',
        fetcher: fetchOptions => this._headSavedPagesFromCloudFunction(fetchOptions)
      });
    },

    async checkFavoritesUpdates(options = {}) {
      return headListFreshness(this, {
        options,
        context: 'headFavorites',
        fetcher: fetchOptions => this._headFavoritesFromCloudFunction(fetchOptions)
      });
    }
  });

  return API;
}

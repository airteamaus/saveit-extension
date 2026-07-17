// api-pages-import.js - Bulk bookmark import API method.
//
// Adds bulkImportBookmarks to the shared API facade. This is the first write
// operation on the shared facade (toolbar saves bypass it via background.js),
// but the import flow belongs here per the "reuse shared helpers" guidance in
// AGENTS.md: it uses the same auth, transport, and error-handling as reads.

import { bulkImportStandalone } from './api-pages-standalone.js';

export function applyApiImport(API) {
  Object.assign(API, {
    /**
     * Send a batch of bookmarks to the bulk-import endpoint.
     *
     * @param {object} options
     * @param {Array<{url: string, title?: string}>} options.bookmarks
     * @param {string|null} [options.projectId] - Optional project to assign imports to.
     * @returns {Promise<{imported: number, skipped: number}>}
     */
    async bulkImportBookmarks({ bookmarks, projectId = null }) {
      if (this.isExtension) {
        return this._executeWithErrorHandling(
          async () => {
            const response = await this._fetchWithAuth('', null, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              // The backend POST router disambiguates by body shape: bulk:true
              // routes to handleBulkImport; otherwise handleSavePage.
              body: JSON.stringify({ bulk: true, projectId, bookmarks })
            });

            // One cache invalidation per affected surface for the whole batch,
            // not per item. Bulk imports create saved pages and may assign them
            // to a project (options.projectId), so both surfaces can be stale.
            await Promise.all([
              this.invalidateCache(),
              this.invalidateProjectsCache()
            ]);
            return response;
          },
          'bulkImportBookmarks',
          { count: bookmarks.length, projectId }
        );
      }

      return bulkImportStandalone({ bookmarks, projectId });
    }
  });

  return API;
}

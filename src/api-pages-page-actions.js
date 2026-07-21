import {
  deleteStandalonePage,
  pinStandalonePage,
  updateStandalonePage
} from './api-pages-standalone.js';
import { assertRealPageId } from './pending-saves.js';

export function applyApiPageActions(API) {
  Object.assign(API, {
    async deletePage(id) {
      assertRealPageId(id);
      if (this.isExtension) {
        return this._executeWithErrorHandling(
          async () => {
            const response = await this._fetchWithAuth('', { id }, {
              method: 'DELETE',
            });

            // Deleting a page shifts its domain's count, so invalidate the
            // domains cache alongside the saved-pages cache.
            await Promise.all([
              this.invalidateCache(),
              this.invalidateDomainsCache()
            ]);
            return response;
          },
          'deletePage',
          { id }
        );
      }

      return deleteStandalonePage(id);
    },

    async updatePage(id, updates) {
      assertRealPageId(id);
      if (this.isExtension) {
        return this._executeWithErrorHandling(
          async () => {
            const response = await this._fetchWithAuth('/updatePage', null, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ id, ...updates })
            });

            // An update can change classification/title (which feeds the
            // domains list), so invalidate domains alongside saved pages.
            await Promise.all([
              this.invalidateCache(),
              this.invalidateDomainsCache()
            ]);
            return response;
          },
          'updatePage',
          { id, updates }
        );
      }

      return updateStandalonePage(id, updates);
    },

    async pinPage(id, pinned) {
      assertRealPageId(id);
      if (this.isExtension) {
        return this._executeWithErrorHandling(
          async () => {
            const response = await this._fetchWithAuth('/pin', null, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ id, pinned })
            });

            // Pinning doesn't change domain membership, so only the saved-pages
            // surface (which carries the pinned flag) needs invalidation.
            await this.invalidateCache();
            return response;
          },
          'pinPage',
          { id, pinned }
        );
      }

      return pinStandalonePage(id, pinned);
    }
  });

  return API;
}

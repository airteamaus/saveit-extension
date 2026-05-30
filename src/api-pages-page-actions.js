import {
  deleteStandalonePage,
  pinStandalonePage,
  updateStandalonePage
} from './api-pages-standalone.js';

export function applyApiPageActions(API) {
  Object.assign(API, {
    async deletePage(id) {
      if (this.isExtension) {
        return this._executeWithErrorHandling(
          async () => {
            const response = await this._fetchWithAuth('', { id }, {
              method: 'DELETE',
            });

            await this.invalidateCache();
            return response;
          },
          'deletePage',
          { id }
        );
      }

      return deleteStandalonePage(id);
    },

    async updatePage(id, updates) {
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

            await this.invalidateCache();
            return response;
          },
          'updatePage',
          { id, updates }
        );
      }

      return updateStandalonePage(id, updates);
    },

    async pinPage(id, pinned) {
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

// api.js - API facade composed from smaller helper modules
// Automatically detects standalone mode (testing) vs extension mode (production)
// and uses mock data or real Cloud Function accordingly

const API = {};

globalThis.ApiCore_Export.applyApiCore(API);
globalThis.ApiPages_Export.applyApiPages(API);
globalThis.ApiSearch_Export.applyApiSearch(API);

globalThis.API = API;

// Export for testing
/* eslint-disable no-undef */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { API };
}
/* eslint-enable no-undef */

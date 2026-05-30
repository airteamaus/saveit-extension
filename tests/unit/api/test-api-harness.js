import { vi } from 'vitest';

import { createAPI } from '../../../src/api.js';

export function createApiTestHarness({ cloudFunctionUrl = 'https://test.run.app' } = {}) {
  const state = {
    browserRuntime: null,
    storageApi: null,
    cloudFunctionUrl
  };

  const getBrowserRuntime = vi.fn(() => state.browserRuntime);
  const getStorageAPI = vi.fn(() => state.storageApi);

  const API = createAPI({
    core: {
      config: {
        get cloudFunctionUrl() {
          return state.cloudFunctionUrl;
        }
      },
      getBrowserRuntime: () => getBrowserRuntime(),
      getStorageAPI: () => getStorageAPI()
    }
  });

  return {
    API,
    getBrowserRuntime,
    getStorageAPI,
    setStandaloneMode() {
      state.browserRuntime = null;
      state.storageApi = null;
    },
    setExtensionMode(storageApi = { local: {} }, browserRuntime = { id: 'test-extension' }) {
      state.browserRuntime = browserRuntime;
      state.storageApi = storageApi;
    },
    setBrowserRuntime(browserRuntime) {
      state.browserRuntime = browserRuntime;
    },
    setStorageApi(storageApi) {
      state.storageApi = storageApi;
    },
    setCloudFunctionUrl(url) {
      state.cloudFunctionUrl = url;
    }
  };
}

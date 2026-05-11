import { describe, expect, it } from 'vitest';

import { createChromeStoreManifest } from '../../scripts/build-chrome-package.js';

describe('createChromeStoreManifest', () => {
  it('keeps a stable Chrome key while removing Firefox-only manifest fields', () => {
    const manifest = {
      manifest_version: 3,
      version: '1.9.5',
      key: 'firefox-key',
      browser_specific_settings: {
        gecko: {
          id: 'saveit@airteam.com.au'
        }
      },
      background: {
        scripts: ['src/bundles/background-bundle.js'],
        service_worker: 'src/bundles/background-bundle.js',
        type: 'module'
      }
    };

    const chromeManifest = createChromeStoreManifest(manifest);

    expect(chromeManifest.key).toBe('firefox-key');
    expect(chromeManifest.browser_specific_settings).toBeUndefined();
    expect(chromeManifest.background.scripts).toBeUndefined();
    expect(chromeManifest.background.service_worker).toBe('src/bundles/background-bundle.js');
    expect(chromeManifest.background.type).toBe('module');
  });

  it('does not mutate the original manifest object', () => {
    const manifest = {
      key: 'firefox-key',
      background: {
        scripts: ['background.js'],
        service_worker: 'background.js'
      }
    };

    createChromeStoreManifest(manifest);

    expect(manifest.key).toBe('firefox-key');
    expect(manifest.background.scripts).toEqual(['background.js']);
  });
});

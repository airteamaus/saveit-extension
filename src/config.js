// Environment-aware configuration
// Automatically detects environment based on context

/**
 * Detect current environment
 * @returns {'development' | 'staging' | 'production'}
 */
function getEnvironment() {
  // Check if running in browser extension
  if (typeof browser !== 'undefined' && browser.runtime) {
    try {
      const version = browser.runtime.getManifest().version;

      // Beta versions go to staging
      if (version.includes('beta')) {
        return 'staging';
      }

      // Production release
      return 'production';
    } catch {
      // Fallback to development
    }
  }

  // Standalone mode (file:// protocol)
  return 'development';
}

/**
 * Environment-specific configurations
 */
const CONFIGS = {
  development: {
    cloudFunctionUrl: 'http://localhost:8080',
    oauthClientId: '903859773555-dev-test-id.apps.googleusercontent.com',
    firebase: {
      apiKey: 'AIzaSyDIQ83Bzs4wd6L1x2MTBqbDKQ987RNnVbA',
      authDomain: 'bookmarking-477502.firebaseapp.com',
      projectId: 'bookmarking-477502'
    },
    enableErrorReporting: false,
    enableDebugLogging: true
  },

  staging: {
    cloudFunctionUrl: 'https://saveit-staging-5pu7ljvnuq-uc.a.run.app',
    oauthClientId: '903859773555-389kkh3aum4b6hmk1ofbn0a9h56lv751.apps.googleusercontent.com',
    firebase: {
      apiKey: 'AIzaSyDIQ83Bzs4wd6L1x2MTBqbDKQ987RNnVbA',
      authDomain: 'bookmarking-477502.firebaseapp.com',
      projectId: 'bookmarking-477502'
    },
    enableErrorReporting: true,
    enableDebugLogging: true
  },

  production: {
    cloudFunctionUrl: 'https://saveit-5pu7ljvnuq-uc.a.run.app',
    oauthClientId: '903859773555-389kkh3aum4b6hmk1ofbn0a9h56lv751.apps.googleusercontent.com',
    firebase: {
      apiKey: 'AIzaSyDIQ83Bzs4wd6L1x2MTBqbDKQ987RNnVbA',
      authDomain: 'bookmarking-477502.firebaseapp.com',
      projectId: 'bookmarking-477502'
    },
    enableErrorReporting: true,
    enableDebugLogging: false
  }
};

// Export the active config based on environment
const ENV = getEnvironment();
export const CONFIG = {
  ...CONFIGS[ENV],
  environment: ENV
};

// Log environment on load (only in dev/staging)
if (ENV !== 'production' && typeof console !== 'undefined') {
  console.log(`[Config] Environment: ${ENV}`, CONFIG);
}

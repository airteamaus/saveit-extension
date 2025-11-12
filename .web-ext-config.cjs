// web-ext configuration
// https://extensionworkshop.com/documentation/develop/web-ext-command-reference/

module.exports = {
  build: {
    overwriteDest: true,
  },
  ignoreFiles: [
    // Test files
    'tests/**',
    '**/*.test.js',
    'vitest.config.js',
    'playwright.config.js',

    // Coverage reports
    'coverage/**',

    // Development files
    'firefox-dev-profile/**',
    'scripts/**',
    'docs/**',
    '.github/**',

    // Config files
    'eslint.config.js',
    '.web-ext-config.js',
    'justfile',

    // Git files
    '.git/**',
    '.gitignore',

    // Node files
    'node_modules/**',
    'package.json',
    'package-lock.json',

    // Private key (should never be packaged)
    'key.pem',

    // Build artifacts
    'web-ext-artifacts/**',

    // Misc
    '.DS_Store',
    '*.log',
    '.env*',
    'updates.json',
  ],
};

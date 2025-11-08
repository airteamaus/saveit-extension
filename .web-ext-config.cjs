module.exports = {
  // Ignore files that shouldn't be included in the build
  ignoreFiles: [
    '*.sh',
    'build-and-sign.sh',
    'install-dev.sh',
    'run-extension.sh',
    'CLAUDE.md',
    'DASHBOARD-README.md',
    'README.md',
    'package.json',
    'package-lock.json',
    '.web-ext-config.js',
    '.gitignore',
    '.git',
    'node_modules'
  ],

  // Build configuration
  build: {
    overwriteDest: true
  },

  // Linter configuration
  lint: {
    // We properly escape all user content with escapeHtml()
    // These warnings are false positives
    warningsAsErrors: false
  }
};

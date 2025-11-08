module.exports = {
  // Ignore files that shouldn't be included in the build
  ignoreFiles: [
    'scripts/**',
    'docs/**',
    '*.md',
    'package.json',
    'package-lock.json',
    '.web-ext-config.cjs',
    '.gitignore',
    '.git',
    'node_modules',
    'justfile',
    '.github'
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

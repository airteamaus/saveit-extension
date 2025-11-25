import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./tests/setup.js'],
    include: ['tests/unit/**/*.test.js', 'tests/integration/**/*.test.js'],
    exclude: ['tests/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.js'],
      exclude: [
        'src/bundles/**',
        'src/config.js',
        'src/mock-data.js'
      ],
      thresholds: {
        lines: 22,       // Adjusted for UI-heavy newtab-minimal.js, search-results.js
        functions: 23,   // Adjusted for UI-heavy newtab-minimal.js, search-results.js
        branches: 29,    // Adjusted for UI-heavy newtab-minimal.js, search-results.js
        statements: 22   // Adjusted for UI-heavy newtab-minimal.js, search-results.js
      }
    }
  }
});

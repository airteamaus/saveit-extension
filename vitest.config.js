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
        lines: 25,       // Adjusted for UI-heavy newtab-minimal.js
        functions: 26,   // Adjusted for UI-heavy newtab-minimal.js
        branches: 32,    // Adjusted for UI-heavy newtab-minimal.js
        statements: 26   // Adjusted for UI-heavy newtab-minimal.js
      }
    }
  }
});

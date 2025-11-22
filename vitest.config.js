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
        lines: 28,       // Phase 3 complete (currently 28.6%)
        functions: 27,   // Phase 3 complete (currently 27.66%)
        branches: 35,    // Phase 3 complete (currently 35.13%)
        statements: 29   // Phase 3 complete (currently 29.14%)
      }
    }
  }
});

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
        lines: 16,       // Phase 2 complete (currently 16.54%)
        functions: 18,   // Phase 2 complete (currently 18.66%)
        branches: 22,    // Phase 2 complete (currently 22.36%)
        statements: 17   // Phase 2 complete (currently 17.5%)
      }
    }
  }
});

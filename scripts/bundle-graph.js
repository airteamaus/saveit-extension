#!/usr/bin/env node
// Bundle graph-viz library for use in browser extension
// Creates a single bundle that exports GraphViz class
// Three.js is kept external (loaded via import map in HTML)

import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXTENSION_DIR = path.join(__dirname, '..');
const BUNDLE_DIR = path.join(EXTENSION_DIR, 'src', 'bundles');

// Check multiple possible paths for graph-viz directory
// 1. Sibling repo (local development): ../../saveit-backend/graph-viz
// 2. Inside repo (CI): ../saveit-backend/graph-viz
const POSSIBLE_GRAPH_VIZ_PATHS = [
  path.join(__dirname, '..', '..', 'saveit-backend', 'graph-viz'), // Local dev
  path.join(__dirname, '..', 'saveit-backend', 'graph-viz'),        // CI
];

const GRAPH_VIZ_DIR = POSSIBLE_GRAPH_VIZ_PATHS.find(p => fs.existsSync(p));

// Ensure bundles directory exists
if (!fs.existsSync(BUNDLE_DIR)) {
  fs.mkdirSync(BUNDLE_DIR, { recursive: true });
}

const sharedConfig = {
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['firefox115', 'chrome120'],
  sourcemap: true,
  minify: true,
  treeShaking: true,
};

async function buildGraphVizBundle() {
  // Create a temporary entry file that exports GraphViz, Viewfinder, and sets up ForceGraph3D global
  // This ensures only one copy of Three.js is bundled
  // Resolve 3d-force-graph from graph-viz's node_modules
  const forceGraphPath = path.join(GRAPH_VIZ_DIR, 'node_modules', '3d-force-graph', 'dist', '3d-force-graph.mjs').replace(/\\/g, '/');

  const entryContent = `
// Import and expose ForceGraph3D globally (required by graph-viz internals)
import ForceGraph3D from '${forceGraphPath}';
window.ForceGraph3D = ForceGraph3D;

export { GraphViz } from '${path.join(GRAPH_VIZ_DIR, 'src', 'index.js').replace(/\\/g, '/')}';
export { Viewfinder } from '${path.join(GRAPH_VIZ_DIR, 'examples', 'components', 'viewfinder.js').replace(/\\/g, '/')}';
`;
  const entryFile = path.join(BUNDLE_DIR, '_entry.js');
  fs.writeFileSync(entryFile, entryContent);

  // Bundle graph-viz main entry point with all dependencies
  // Three.js is bundled for extension CSP compliance (no import maps allowed)
  await esbuild.build({
    ...sharedConfig,
    entryPoints: [entryFile],
    outfile: path.join(BUNDLE_DIR, 'graph-viz.js'),
    // Include Three.js in bundle - extensions can't use import maps
  });

  // Clean up temp file
  fs.unlinkSync(entryFile);

  console.log('  Built graph-viz.js (includes Viewfinder)');
}

// Viewfinder is now included in the main graph-viz.js bundle
// No separate bundle needed

async function copyAssets() {
  // Copy CSS files
  const cssFiles = [
    {
      src: path.join(GRAPH_VIZ_DIR, 'examples', 'components', 'viewfinder.css'),
      dest: path.join(EXTENSION_DIR, 'src', 'graph-viewfinder.css')
    }
  ];

  for (const { src, dest } of cssFiles) {
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      console.log(`  Copied ${path.basename(dest)}`);
    } else {
      console.warn(`  Warning: ${src} not found`);
    }
  }
}

async function build() {
  try {
    console.log('Building graph bundles...');

    // Verify graph-viz directory exists
    if (!GRAPH_VIZ_DIR) {
      const searchedPaths = POSSIBLE_GRAPH_VIZ_PATHS.map(p => `  - ${p}`).join('\n');
      throw new Error(`graph-viz directory not found. Searched:\n${searchedPaths}`);
    }

    // Build main bundle (includes GraphViz and Viewfinder)
    await buildGraphVizBundle();

    // Copy assets
    await copyAssets();

    console.log('Graph bundles built successfully!');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

// Run if called directly
build();

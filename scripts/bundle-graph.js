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
const GRAPH_VIZ_DIR = path.join(__dirname, '..', '..', 'saveit-backend', 'graph-viz');

// Ensure bundles directory exists
if (!fs.existsSync(BUNDLE_DIR)) {
  fs.mkdirSync(BUNDLE_DIR, { recursive: true });
}

const sharedConfig = {
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['firefox115', 'chrome120'],
  sourcemap: false,
  minify: true,
  treeShaking: true,
};

async function buildGraphVizBundle() {
  // Bundle graph-viz main entry point with all dependencies
  // Three.js is bundled for extension CSP compliance (no import maps allowed)
  await esbuild.build({
    ...sharedConfig,
    entryPoints: [path.join(GRAPH_VIZ_DIR, 'src', 'index.js')],
    outfile: path.join(BUNDLE_DIR, 'graph-viz.js'),
    // Include Three.js in bundle - extensions can't use import maps
  });

  console.log('  Built graph-viz.js');
}

async function buildViewfinderBundle() {
  // Bundle viewfinder component
  await esbuild.build({
    ...sharedConfig,
    entryPoints: [path.join(GRAPH_VIZ_DIR, 'examples', 'components', 'viewfinder.js')],
    outfile: path.join(BUNDLE_DIR, 'viewfinder.js'),
  });

  console.log('  Built viewfinder.js');
}

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
    if (!fs.existsSync(GRAPH_VIZ_DIR)) {
      throw new Error(`graph-viz directory not found at ${GRAPH_VIZ_DIR}`);
    }

    // Build bundles in parallel
    await Promise.all([
      buildGraphVizBundle(),
      buildViewfinderBundle(),
    ]);

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

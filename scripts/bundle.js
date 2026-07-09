#!/usr/bin/env node
// Bundle the background service worker, Sentry init, and polyfill for the
// extension build. (Previously also bundled the Firebase SDK; that was removed
// when auth moved to backend-issued session tokens.)

import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SRC_DIR = path.join(__dirname, '..', 'src');
const BUNDLE_DIR = path.join(SRC_DIR, 'bundles');

// Ensure bundles directory exists
if (!fs.existsSync(BUNDLE_DIR)) {
  fs.mkdirSync(BUNDLE_DIR, { recursive: true });
}

const sharedConfig = {
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['firefox115', 'chrome120'], // Firefox ESR + Chrome 120+
  sourcemap: true,
  minify: true,
  treeShaking: true,
};

async function bundleBackgroundScript() {
  // Read polyfill to prepend to bundle
  const polyfillPath = path.join(
    __dirname,
    '..',
    'node_modules',
    'webextension-polyfill',
    'dist',
    'browser-polyfill.min.js'
  );
  const polyfillContent = fs.readFileSync(polyfillPath, 'utf8');

  // Bundle background.js with all imports + polyfill prepended
  await esbuild.build({
    ...sharedConfig,
    entryPoints: [path.join(SRC_DIR, 'background.js')],
    outfile: path.join(BUNDLE_DIR, 'background-bundle.js'),
    banner: {
      js: polyfillContent
    },
  });

  console.log('✅ Built background-bundle.js (with polyfill)');
}

async function buildSentryBundle() {
  // Bundle sentry-init.js for page surfaces (needs @sentry/browser bundled)
  await esbuild.build({
    ...sharedConfig,
    entryPoints: [path.join(SRC_DIR, 'sentry-init.js')],
    outfile: path.join(BUNDLE_DIR, 'sentry-init.js'),
  });

  console.log('✅ Built sentry-init.js');
}

async function buildCaptureBundle() {
  // Bundle capture-bundle-entry.js (which imports buildClientObject from
  // page-capture.js — this inlines Readability) into an injectable file. The
  // injector loads this via executeScript files:[...] in the page's ISOLATED
  // world, where ESM imports do not work, so it must be pre-bundled.
  await esbuild.build({
    ...sharedConfig,
    entryPoints: [path.join(SRC_DIR, 'capture-bundle-entry.js')],
    outfile: path.join(BUNDLE_DIR, 'capture-bundle.js'),
  });

  console.log('✅ Built capture-bundle.js');
}

async function copyPolyfill() {
  const polyfillSource = path.join(
    __dirname,
    '..',
    'node_modules',
    'webextension-polyfill',
    'dist',
    'browser-polyfill.min.js'
  );
  const polyfillDest = path.join(BUNDLE_DIR, 'browser-polyfill.min.js');

  fs.copyFileSync(polyfillSource, polyfillDest);
  console.log('✅ Copied browser-polyfill.min.js');
}

async function build() {
  try {
    console.log('🔨 Building bundles...');
    await Promise.all([
      bundleBackgroundScript(),
      buildSentryBundle(),
      buildCaptureBundle(),
    ]);
    copyPolyfill();
    console.log('✅ All bundles built successfully!');
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

// Run if called directly
build();

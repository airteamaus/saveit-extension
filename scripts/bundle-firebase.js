#!/usr/bin/env node
// Bundle Firebase SDK for use in browser extension
// Creates two bundles: one for background.js (service worker), one for dashboard

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
  sourcemap: false,
  minify: true,
  treeShaking: true,
};

async function buildBackgroundBundle() {
  const entryContent = `
// Firebase bundle for background.js (service worker)
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithCredential,
  GoogleAuthProvider,
  onAuthStateChanged,
  getIdToken,
  signOut
} from '@firebase/auth/web-extension';

export {
  initializeApp,
  getAuth,
  signInWithCredential,
  GoogleAuthProvider,
  onAuthStateChanged,
  getIdToken,
  signOut
};
`;

  const entryFile = path.join(BUNDLE_DIR, '_background-entry.js');
  fs.writeFileSync(entryFile, entryContent);

  await esbuild.build({
    ...sharedConfig,
    entryPoints: [entryFile],
    outfile: path.join(BUNDLE_DIR, 'firebase-background.js'),
  });

  fs.unlinkSync(entryFile);
  console.log('✅ Built firebase-background.js');
}

async function buildDashboardBundle() {
  const entryContent = `
// Firebase bundle for dashboard (newtab.html)
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  getIdToken,
  signOut
} from '@firebase/auth/web-extension';

export {
  initializeApp,
  getAuth,
  onAuthStateChanged,
  getIdToken,
  signOut
};
`;

  const entryFile = path.join(BUNDLE_DIR, '_dashboard-entry.js');
  fs.writeFileSync(entryFile, entryContent);

  await esbuild.build({
    ...sharedConfig,
    entryPoints: [entryFile],
    outfile: path.join(BUNDLE_DIR, 'firebase-dashboard.js'),
  });

  fs.unlinkSync(entryFile);
  console.log('✅ Built firebase-dashboard.js');
}

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
    console.log('🔨 Building Firebase bundles...');
    await Promise.all([
      buildBackgroundBundle(),
      buildDashboardBundle(),
      bundleBackgroundScript()
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

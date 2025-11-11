#!/usr/bin/env node
// Bundle Firebase SDK for use in browser extension
// Creates two bundles: one for background.js (service worker), one for dashboard

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

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
  target: 'firefox115', // Firefox ESR
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

async function build() {
  try {
    console.log('🔨 Building Firebase bundles...');
    await Promise.all([
      buildBackgroundBundle(),
      buildDashboardBundle()
    ]);
    console.log('✅ All bundles built successfully!');
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  build();
}

module.exports = { build };

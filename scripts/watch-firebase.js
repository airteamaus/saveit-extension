#!/usr/bin/env node
// Watch Firebase dependencies and rebuild bundles on changes

const chokidar = require('chokidar');
const { build } = require('./bundle-firebase.js');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');

// Watch package.json and node_modules/firebase for changes
const watcher = chokidar.watch([
  path.join(ROOT_DIR, 'package.json'),
  path.join(ROOT_DIR, 'node_modules/firebase'),
  path.join(ROOT_DIR, 'node_modules/@firebase')
], {
  ignored: /(^|[\/\\])\../, // ignore dotfiles
  persistent: true,
  ignoreInitial: true,
  awaitWriteFinish: {
    stabilityThreshold: 100,
    pollInterval: 100
  }
});

console.log('👀 Watching Firebase dependencies for changes...');
console.log('   Press Ctrl+C to stop\n');

// Initial build
build();

watcher
  .on('change', (filepath) => {
    console.log(`\n📝 Changed: ${path.relative(ROOT_DIR, filepath)}`);
    build();
  })
  .on('error', error => console.error(`Watcher error: ${error}`));

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Stopped watching');
  watcher.close();
  process.exit(0);
});

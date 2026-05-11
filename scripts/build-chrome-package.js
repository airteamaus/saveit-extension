#!/usr/bin/env node

import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.join(__dirname, '..');
const ARTIFACTS_DIR = path.join(REPO_ROOT, 'web-ext-artifacts');

export function createChromeStoreManifest(manifest) {
  const chromeManifest = structuredClone(manifest);

  delete chromeManifest.browser_specific_settings;

  if (chromeManifest.background?.scripts) {
    delete chromeManifest.background.scripts;
  }

  return chromeManifest;
}

function copyExtensionSource(destinationDir) {
  fs.mkdirSync(destinationDir, { recursive: true });
  fs.cpSync(path.join(REPO_ROOT, 'src'), path.join(destinationDir, 'src'), {
    recursive: true
  });
}

function writeChromeManifest(destinationDir) {
  const manifestPath = path.join(REPO_ROOT, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const chromeManifest = createChromeStoreManifest(manifest);

  fs.writeFileSync(
    path.join(destinationDir, 'manifest.json'),
    JSON.stringify(chromeManifest, null, 2) + '\n'
  );

  return chromeManifest.version;
}

function renameBuiltZip(version, existingArtifacts) {
  const builtArtifacts = fs.readdirSync(existingArtifacts)
    .filter((file) => file.endsWith('.zip'));

  if (builtArtifacts.length !== 1) {
    throw new Error(`Expected exactly one new Chrome zip, found ${builtArtifacts.length}`);
  }

  const builtZipName = builtArtifacts[0];
  const chromeZipName = `saveit-chrome-${version}.zip`;
  const builtZipPath = path.join(existingArtifacts, builtZipName);
  const chromeZipPath = path.join(ARTIFACTS_DIR, chromeZipName);

  if (builtZipName !== chromeZipName) {
    if (fs.existsSync(chromeZipPath)) {
      fs.unlinkSync(chromeZipPath);
    }
    fs.renameSync(builtZipPath, chromeZipPath);
  }

  return chromeZipPath;
}

export function buildChromePackage() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'saveit-chrome-build-'));
  const sourceDir = path.join(tempRoot, 'extension');
  const tempArtifactsDir = path.join(tempRoot, 'artifacts');

  try {
    copyExtensionSource(sourceDir);
    const version = writeChromeManifest(sourceDir);

    fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
    fs.mkdirSync(tempArtifactsDir, { recursive: true });

    execFileSync(
      'npx',
      [
        'web-ext',
        'build',
        '--overwrite-dest',
        '--source-dir',
        sourceDir,
        '--artifacts-dir',
        tempArtifactsDir
      ],
      {
        cwd: REPO_ROOT,
        stdio: 'inherit'
      }
    );

    const chromeZipPath = renameBuiltZip(version, tempArtifactsDir);
    console.log(`✅ Built Chrome package: ${path.basename(chromeZipPath)}`);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] === __filename) {
  try {
    buildChromePackage();
  } catch (error) {
    console.error('❌ Chrome package build failed:', error.message);
    process.exit(1);
  }
}

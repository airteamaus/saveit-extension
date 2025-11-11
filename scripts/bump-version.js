#!/usr/bin/env node

/**
 * Version bump script for SaveIt extension
 *
 * Usage:
 *   node scripts/bump-version.js [patch|minor|major]
 *
 * This script:
 * 1. Reads the current version from manifest.json
 * 2. Increments the version (patch/minor/major)
 * 3. Updates manifest.json
 * 4. Commits the change
 * 5. Creates a git tag
 * 6. Provides instructions for pushing
 */

import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MANIFEST_PATH = path.join(__dirname, '..', 'manifest.json');

// Parse version bump type
const bumpType = process.argv[2] || 'patch';
if (!['patch', 'minor', 'major'].includes(bumpType)) {
  console.error('Error: Invalid version bump type. Use: patch, minor, or major');
  process.exit(1);
}

// Read manifest
let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
} catch (err) {
  console.error('Error reading manifest.json:', err.message);
  process.exit(1);
}

const currentVersion = manifest.version;
console.log(`Current version: ${currentVersion}`);

// Parse current version
const parts = currentVersion.split('.').map(Number);
if (parts.length !== 3 || parts.some(isNaN)) {
  console.error('Error: Invalid version format in manifest.json. Expected: x.y.z');
  process.exit(1);
}

let [major, minor, patch] = parts;

// Bump version
switch (bumpType) {
  case 'major':
    major++;
    minor = 0;
    patch = 0;
    break;
  case 'minor':
    minor++;
    patch = 0;
    break;
  case 'patch':
    patch++;
    break;
}

const newVersion = `${major}.${minor}.${patch}`;
console.log(`New version: ${newVersion}`);

// Update manifest
manifest.version = newVersion;
fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
console.log('✓ Updated manifest.json');

// Check if there are uncommitted changes (other than manifest.json)
try {
  const status = execSync('git status --porcelain', { encoding: 'utf8' });
  const otherChanges = status
    .split('\n')
    .filter(line => line && !line.includes('manifest.json'))
    .length > 0;

  if (otherChanges) {
    console.warn('\nWarning: You have other uncommitted changes.');
    console.warn('This script will only commit manifest.json');
    console.warn('Commit or stash other changes first if desired.\n');
  }
} catch (err) {
  console.error('Error checking git status:', err.message);
  process.exit(1);
}

// Git commit
try {
  execSync('git add manifest.json', { stdio: 'inherit' });
  execSync(`git commit -m "Bump version to ${newVersion}"`, { stdio: 'inherit' });
  console.log('✓ Committed version bump');
} catch (err) {
  console.error('Error committing changes:', err.message);
  process.exit(1);
}

// Git tag
try {
  execSync(`git tag v${newVersion}`, { stdio: 'inherit' });
  console.log(`✓ Created tag v${newVersion}`);
} catch (err) {
  console.error('Error creating tag:', err.message);
  console.error('Hint: If tag already exists, delete it with: git tag -d v' + newVersion);
  process.exit(1);
}

// Ask if user wants to push immediately
console.log(`
✓ Version bumped to ${newVersion}

Next steps:
1. Review the changes: git show
2. Push commit and tag: git push origin main --tags

GitHub Actions will automatically:
- Build the extension
- Sign with Mozilla
- Create a GitHub Release with signed XPI
- Update updates.json for auto-updates

Tip: The pre-push hook will prevent pushing mismatched version tags.
     Always use 'just bump' instead of manually creating tags.
`);

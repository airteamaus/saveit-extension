#!/usr/bin/env node

/**
 * Version bump script for SaveIt extension
 *
 * Usage:
 *   node scripts/bump-version.js [patch|minor|major]
 *
 * This script:
 * 1. Reads the current version from manifest.json and package.json
 * 2. Increments the version (patch/minor/major)
 * 3. Updates manifest.json and package.json
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
const PACKAGE_PATH = path.join(__dirname, '..', 'package.json');

// Parse version bump type
const bumpType = process.argv[2] || 'patch';
if (!['patch', 'minor', 'major'].includes(bumpType)) {
  console.error('Error: Invalid version bump type. Use: patch, minor, or major');
  process.exit(1);
}

// Read manifest and package.json
let manifest;
let packageJson;
try {
  manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  packageJson = JSON.parse(fs.readFileSync(PACKAGE_PATH, 'utf8'));
} catch (err) {
  console.error('Error reading version files:', err.message);
  process.exit(1);
}

const currentVersion = manifest.version;
if (packageJson.version !== currentVersion) {
  console.error(
    `Error: version mismatch detected. manifest.json=${currentVersion}, package.json=${packageJson.version}`
  );
  console.error('Resolve the mismatch before running the bump script.');
  process.exit(1);
}

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

// Update manifest and package.json
manifest.version = newVersion;
packageJson.version = newVersion;
fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
fs.writeFileSync(PACKAGE_PATH, JSON.stringify(packageJson, null, 2) + '\n');
console.log('✓ Updated manifest.json and package.json');

// Check if there are uncommitted changes (other than version files)
try {
  const status = execSync('git status --porcelain', { encoding: 'utf8' });
  const otherChanges = status
    .split('\n')
    .filter(line => line &&
      !line.includes('manifest.json') &&
      !line.includes('package.json')
    )
    .length > 0;

  if (otherChanges) {
    console.warn('\nWarning: You have other uncommitted changes.');
    console.warn('This script will only commit manifest.json and package.json');
    console.warn('Commit or stash other changes first if desired.\n');
  }
} catch (err) {
  console.error('Error checking git status:', err.message);
  process.exit(1);
}

// Git commit
 try {
   execSync('git add manifest.json package.json', { stdio: 'inherit' });
   execSync(
     `git commit -m "Bump version to ${newVersion}"`,
     { stdio: 'inherit' }
   );
   console.log('✓ Committed version bump');
 } catch (err) {
   console.error('Error committing changes:', err.message);
   process.exit(1);
}

// Update CHANGELOG.md. This amends the version-bump commit, so it MUST happen
// before tagging — otherwise the tag points at the pre-amend commit and gets
// orphaned (the tag would reference a commit no longer on the branch).
try {
  console.log('Updating CHANGELOG.md...');
  execSync('node scripts/generate-changelog.js', { stdio: 'inherit' });
  execSync('git add CHANGELOG.md', { stdio: 'inherit' });
  execSync(`git commit --amend --no-edit`, { stdio: 'inherit' });
  console.log('✓ Updated CHANGELOG.md');
} catch (err) {
  console.warn('Warning: Failed to update CHANGELOG.md:', err.message);
  console.warn('You can manually run: node scripts/generate-changelog.js');
}

// Git tag — created AFTER the changelog amend so it points at the final commit.
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

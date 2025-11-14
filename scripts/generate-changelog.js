#!/usr/bin/env node
// Generate CHANGELOG.md from conventional commits

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CHANGELOG_PATH = path.join(__dirname, '..', 'CHANGELOG.md');

/**
 * Parse a conventional commit message
 * Returns: { type, scope, breaking, subject }
 */
function parseCommit(message) {
  // Match: type(scope): subject
  // or: type: subject
  // or: type(scope)!: subject (breaking change)
  const match = message.match(/^(\w+)(?:\(([^)]+)\))?(!)?: (.+)$/);

  if (!match) {
    return null;
  }

  const [, type, scope, breaking, subject] = match;

  return {
    type,
    scope: scope || null,
    breaking: breaking === '!',
    subject: subject.trim()
  };
}

/**
 * Get commits between two tags (or from tag to HEAD)
 */
function getCommits(fromTag, toTag = 'HEAD') {
  try {
    const range = fromTag ? `${fromTag}..${toTag}` : toTag;
    const output = execSync(`git log ${range} --pretty=format:"%H|||%s"`, {
      encoding: 'utf8'
    });

    if (!output.trim()) {
      return [];
    }

    return output.split('\n').map(line => {
      const [hash, message] = line.split('|||');
      const parsed = parseCommit(message);

      return {
        hash: hash.substring(0, 7),
        message,
        ...parsed
      };
    }).filter(commit => commit.type); // Only include conventional commits
  } catch (error) {
    console.error('Failed to get commits:', error.message);
    return [];
  }
}

/**
 * Get all version tags, sorted by version (newest first)
 */
function getVersionTags() {
  try {
    const output = execSync('git tag -l "v*" --sort=-version:refname', {
      encoding: 'utf8'
    });

    return output.split('\n').filter(Boolean);
  } catch (error) {
    console.error('Failed to get tags:', error.message);
    return [];
  }
}

/**
 * Get tag date
 */
function getTagDate(tag) {
  try {
    const output = execSync(`git log -1 --format=%ai ${tag}`, {
      encoding: 'utf8'
    });
    return output.split(' ')[0]; // YYYY-MM-DD
  } catch (error) {
    return new Date().toISOString().split('T')[0];
  }
}

/**
 * Categorize commits by type
 */
function categorizeCommits(commits) {
  const categories = {
    breaking: [],
    feat: [],
    fix: [],
    perf: [],
    refactor: [],
    docs: [],
    test: [],
    build: [],
    ci: [],
    chore: [],
    other: []
  };

  for (const commit of commits) {
    if (commit.breaking) {
      categories.breaking.push(commit);
    } else if (categories[commit.type]) {
      categories[commit.type].push(commit);
    } else {
      categories.other.push(commit);
    }
  }

  return categories;
}

/**
 * Format a commit for changelog
 */
function formatCommit(commit) {
  const scope = commit.scope ? `**${commit.scope}:** ` : '';
  return `- ${scope}${commit.subject} (${commit.hash})`;
}

/**
 * Generate changelog section for a version
 */
function generateVersionSection(version, date, commits) {
  const categories = categorizeCommits(commits);
  let section = `## [${version}] - ${date}\n\n`;

  const categoryMapping = {
    breaking: { title: '⚠️ BREAKING CHANGES', commits: categories.breaking },
    feat: { title: '✨ Features', commits: categories.feat },
    fix: { title: '🐛 Bug Fixes', commits: categories.fix },
    perf: { title: '⚡ Performance', commits: categories.perf },
    refactor: { title: '♻️ Refactoring', commits: categories.refactor },
    docs: { title: '📚 Documentation', commits: categories.docs },
    test: { title: '✅ Tests', commits: categories.test },
    build: { title: '🔧 Build System', commits: categories.build },
    ci: { title: '👷 CI/CD', commits: categories.ci }
  };

  let hasContent = false;

  for (const [, { title, commits }] of Object.entries(categoryMapping)) {
    if (commits.length > 0) {
      section += `### ${title}\n\n`;
      section += commits.map(formatCommit).join('\n') + '\n\n';
      hasContent = true;
    }
  }

  if (!hasContent) {
    section += 'No notable changes.\n\n';
  }

  return section;
}

/**
 * Generate complete changelog
 */
function generateChangelog(options = {}) {
  const { fullHistory = false, sinceTag = null } = options;

  let changelog = `# Changelog

All notable changes to the SaveIt extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

`;

  const tags = getVersionTags();

  if (tags.length === 0) {
    console.warn('No version tags found. Creating changelog from all commits.');
    const commits = getCommits(null);
    const version = 'Unreleased';
    const date = new Date().toISOString().split('T')[0];
    changelog += generateVersionSection(version, date, commits);
    return changelog;
  }

  // Unreleased section (commits since last tag)
  const unreleasedCommits = getCommits(tags[0]);
  if (unreleasedCommits.length > 0) {
    changelog += generateVersionSection('Unreleased', 'TBD', unreleasedCommits);
  }

  // Process tags
  const tagsToProcess = sinceTag
    ? tags.slice(0, tags.indexOf(sinceTag) + 1)
    : fullHistory
      ? tags
      : tags.slice(0, 10); // Default: last 10 versions

  for (let i = 0; i < tagsToProcess.length; i++) {
    const tag = tagsToProcess[i];
    const version = tag.replace(/^v/, '');
    const date = getTagDate(tag);
    const fromTag = tagsToProcess[i + 1] || null;
    const commits = getCommits(fromTag, tag);

    changelog += generateVersionSection(version, date, commits);
  }

  if (!fullHistory && tags.length > 10) {
    changelog += `\n---\n\n*Showing last 10 versions. Use \`--full-history\` to see all releases.*\n`;
  }

  return changelog;
}

/**
 * Generate release notes for a specific version (for GitHub releases)
 */
function generateReleaseNotes(version) {
  const tags = getVersionTags();
  const currentTag = `v${version}`;
  const currentIndex = tags.indexOf(currentTag);

  if (currentIndex === -1) {
    console.error(`Tag ${currentTag} not found`);
    return null;
  }

  const previousTag = tags[currentIndex + 1] || null;
  const commits = getCommits(previousTag, currentTag);
  const categories = categorizeCommits(commits);

  let notes = '';

  const categoryMapping = {
    breaking: { emoji: '⚠️', title: 'BREAKING CHANGES', commits: categories.breaking },
    feat: { emoji: '✨', title: 'Features', commits: categories.feat },
    fix: { emoji: '🐛', title: 'Bug Fixes', commits: categories.fix },
    perf: { emoji: '⚡', title: 'Performance', commits: categories.perf },
    refactor: { emoji: '♻️', title: 'Refactoring', commits: categories.refactor }
  };

  for (const [, { emoji, title, commits }] of Object.entries(categoryMapping)) {
    if (commits.length > 0) {
      notes += `## ${emoji} ${title}\n\n`;
      notes += commits.map(c => {
        const scope = c.scope ? `**${c.scope}:** ` : '';
        return `- ${scope}${c.subject}`;
      }).join('\n') + '\n\n';
    }
  }

  if (!notes) {
    notes = 'No notable changes in this release.\n';
  }

  return notes;
}

// CLI
const args = process.argv.slice(2);
const command = args[0];

if (command === 'release-notes') {
  const version = args[1];
  if (!version) {
    console.error('Usage: generate-changelog.js release-notes <version>');
    process.exit(1);
  }
  const notes = generateReleaseNotes(version);
  if (notes) {
    console.log(notes);
  } else {
    process.exit(1);
  }
} else {
  const fullHistory = args.includes('--full-history');
  const sinceIndex = args.indexOf('--since');
  const sinceTag = sinceIndex !== -1 ? args[sinceIndex + 1] : null;

  const changelog = generateChangelog({ fullHistory, sinceTag });
  fs.writeFileSync(CHANGELOG_PATH, changelog);
  console.log(`✅ Generated ${CHANGELOG_PATH}`);
}

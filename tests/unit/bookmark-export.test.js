import { describe, it, expect } from 'vitest';
import { toRaindropCsv, toJsonBackup, toNetscapeHtml } from '../../src/bookmark-export.js';
import { parseRaindropCsv, parseBackupJson, parseNetscapeHtml } from '../../src/bookmark-import.js';

const PAGES = [
  {
    id: 'p1',
    url: 'https://example.com',
    title: 'Example',
    description: 'A note about this page',
    domain: 'example.com',
    saved_at: '2021-08-26T14:28:45.000Z',
    manual_tags: ['js', 'web'],
    project_ids: ['proj-1']
  },
  {
    id: 'p2',
    url: 'https://plain.com',
    title: 'Plain',
    description: null,
    domain: 'plain.com',
    saved_at: '2021-09-01T00:00:00.000Z',
    manual_tags: [],
    project_ids: []
  }
];

const PROJECTS = new Map([['proj-1', 'Dev']]);

describe('toRaindropCsv', () => {
  it('produces the canonical Raindrop header', () => {
    const csv = toRaindropCsv(PAGES, PROJECTS);
    expect(csv.split('\n')[0]).toBe('folder,url,title,note,tags,created');
  });

  it('writes the project name as the folder', () => {
    const csv = toRaindropCsv(PAGES, PROJECTS);
    const lines = csv.split('\n');
    // First data row (after header) should have Dev as the folder. Unquoted —
    // "Dev" has no special chars, so RFC-4180 leaves it bare.
    expect(lines[1].startsWith('Dev,')).toBe(true);
  });

  it('writes a Unix-seconds timestamp for created', () => {
    const csv = toRaindropCsv(PAGES, PROJECTS);
    const lines = csv.split('\n');
    // The first row's last field is 1629988125 (2021-08-26T14:28:45Z as Unix seconds).
    expect(lines[1].endsWith(',1629988125')).toBe(true);
  });

  it('quotes fields containing commas (tags, notes)', () => {
    // Use a note with a comma to verify the quoting rule actually fires.
    const pagesWithCommaNote = [
      { ...PAGES[0], description: 'A note, with a comma' }
    ];
    const csv = toRaindropCsv(pagesWithCommaNote, PROJECTS);
    expect(csv).toContain('"js, web"');
    expect(csv).toContain('"A note, with a comma"');
  });

  it('round-trips: exported CSV re-imports to the same data', () => {
    const csv = toRaindropCsv(PAGES, PROJECTS);
    const { bookmarks } = parseRaindropCsv(csv);
    expect(bookmarks).toHaveLength(2);
    expect(bookmarks[0]).toMatchObject({
      url: 'https://example.com',
      title: 'Example',
      notes: 'A note about this page',
      tags: ['js', 'web'],
      folder: 'Dev',
      createdAt: '2021-08-26T14:28:45.000Z'
    });
    // Second page: no project → blank folder (parsed as null).
    expect(bookmarks[1].folder).toBeNull();
  });

  it('skips pages without a url', () => {
    const csv = toRaindropCsv([{ title: 'no url' }], new Map());
    expect(csv.split('\n')).toHaveLength(2); // header + trailing newline only
  });
});

describe('toJsonBackup', () => {
  it('produces a versioned backup envelope', () => {
    const json = JSON.parse(toJsonBackup(PAGES, [{ id: 'proj-1', name: 'Dev' }]));
    expect(json.format).toBe('newtab-backup');
    expect(json.version).toBe(1);
    expect(json.pages).toHaveLength(2);
    expect(json.projects).toHaveLength(1);
  });

  it('carries tags, description, savedAt, and projectId per page', () => {
    const json = JSON.parse(toJsonBackup(PAGES));
    expect(json.pages[0]).toMatchObject({
      url: 'https://example.com',
      title: 'Example',
      description: 'A note about this page',
      tags: ['js', 'web'],
      savedAt: '2021-08-26T14:28:45.000Z',
      projectId: 'proj-1'
    });
  });

  it('round-trips: exported JSON re-imports to the same data', () => {
    const json = toJsonBackup(PAGES, [{ id: 'proj-1', name: 'Dev' }]);
    const { bookmarks } = parseBackupJson(json);
    expect(bookmarks[0]).toMatchObject({
      url: 'https://example.com',
      title: 'Example',
      notes: 'A note about this page',
      tags: ['js', 'web'],
      createdAt: '2021-08-26T14:28:45.000Z',
      projectId: 'proj-1'
    });
  });
});

describe('toNetscapeHtml', () => {
  it('produces a valid Netscape bookmark document', () => {
    const html = toNetscapeHtml(PAGES);
    expect(html).toContain('<!DOCTYPE NETSCAPE-Bookmark-file-1>');
    expect(html).toContain('Newtab');
    expect(html).toContain('https://example.com');
  });

  it('escapes HTML entities in titles and descriptions', () => {
    const html = toNetscapeHtml([
      { url: 'https://x.com', title: 'A & B <script>', description: '<test>' }
    ]);
    expect(html).toContain('A &amp; B &lt;script&gt;');
    expect(html).toContain('&lt;test&gt;');
    expect(html).not.toContain('<script>');
  });

  it('includes ADD_DATE for pages with a saved_at', () => {
    const html = toNetscapeHtml(PAGES);
    expect(html).toContain('ADD_DATE="1629988125"');
  });

  it('round-trips: exported HTML re-imports to the same URLs/titles', () => {
    const html = toNetscapeHtml(PAGES);
    const { bookmarks } = parseNetscapeHtml(html);
    expect(bookmarks).toHaveLength(2);
    const example = bookmarks.find((b) => b.url === 'https://example.com');
    expect(example.title).toBe('Example');
    expect(example.createdAt).toBe('2021-08-26T14:28:45.000Z');
  });
});

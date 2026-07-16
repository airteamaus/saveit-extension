import { describe, it, expect } from 'vitest';
import {
  parseCsv,
  parseRaindropCsv,
  parseNetscapeHtml,
  parseBackupJson,
  detectImportFormat
} from '../../src/bookmark-import.js';

describe('parseCsv', () => {
  it('parses a simple comma-separated row', () => {
    expect(parseCsv('a,b,c')).toEqual([['a', 'b', 'c']]);
  });

  it('handles quoted fields containing commas', () => {
    expect(parseCsv('"hello, world",b')).toEqual([['hello, world', 'b']]);
  });

  it('handles escaped double quotes inside quoted fields', () => {
    expect(parseCsv('"she said ""hi""",b')).toEqual([['she said "hi"', 'b']]);
  });

  it('handles newlines inside quoted fields', () => {
    expect(parseCsv('"line1\nline2",b')).toEqual([['line1\nline2', 'b']]);
  });

  it('normalizes Windows CRLF line endings', () => {
    expect(parseCsv('a,b\r\nc,d')).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('flushes a trailing row with no final newline', () => {
    expect(parseCsv('a,b')).toEqual([['a', 'b']]);
  });
});

describe('parseRaindropCsv', () => {
  const RAINDROP_SAMPLE = [
    'folder,url,title,note,tags,created',
    '"Reading/Dev",https://example.com,Example,"A note","js, web",1629980125',
    ',https://plain.com,Plain,,,',
    '"Misc",https://tagged.com,Tagged,,"only-tag"'
  ].join('\n');

  it('parses the canonical Raindrop header set by column name', () => {
    const { bookmarks } = parseRaindropCsv(RAINDROP_SAMPLE);
    expect(bookmarks).toHaveLength(3);
    expect(bookmarks[0]).toMatchObject({
      url: 'https://example.com',
      title: 'Example',
      notes: 'A note',
      tags: ['js', 'web'],
      folder: 'Reading/Dev'
    });
  });

  it('converts a Unix-seconds timestamp to ISO', () => {
    const { bookmarks } = parseRaindropCsv(RAINDROP_SAMPLE);
    expect(bookmarks[0].createdAt).toBe('2021-08-26T12:15:25.000Z');
  });

  it('tolerates ISO 8601 in the created column', () => {
    const csv = [
      'url,created',
      'https://iso.com,2025-01-15T10:00:00Z'
    ].join('\n');
    const { bookmarks } = parseRaindropCsv(csv);
    expect(bookmarks[0].createdAt).toBe('2025-01-15T10:00:00.000Z');
  });

  it('treats a 13-digit number as milliseconds, not seconds', () => {
    const csv = 'url,created\nhttps://ms.com,1629980125000';
    const { bookmarks } = parseRaindropCsv(csv);
    expect(bookmarks[0].createdAt).toBe('2021-08-26T12:15:25.000Z');
  });

  it('returns null createdAt for an unparseable date', () => {
    const csv = 'url,created\nhttps://bad.com,not-a-date';
    const { bookmarks } = parseRaindropCsv(csv);
    expect(bookmarks[0].createdAt).toBeNull();
  });

  it('skips rows without a URL and reports them in errors', () => {
    const csv = ['url,title', 'https://has.com,Has', ',NoUrl'].join('\n');
    const { bookmarks, errors } = parseRaindropCsv(csv);
    expect(bookmarks).toHaveLength(1);
    expect(errors.some((e) => e.includes('missing URL'))).toBe(true);
  });

  it('accepts a "notes" column as an alias for "note"', () => {
    const csv = 'url,notes\nhttps://x.com,My note';
    const { bookmarks } = parseRaindropCsv(csv);
    expect(bookmarks[0].notes).toBe('My note');
  });

  it('survives column reordering (parses by header name, not position)', () => {
    const csv = [
      'title,url,tags',
      'T,https://x.com,"a, b"'
    ].join('\n');
    const { bookmarks } = parseRaindropCsv(csv);
    expect(bookmarks[0]).toMatchObject({ url: 'https://x.com', title: 'T', tags: ['a', 'b'] });
  });

  it('errors when the url column is missing entirely', () => {
    const { bookmarks, errors } = parseRaindropCsv('title,note\nA,B');
    expect(bookmarks).toHaveLength(0);
    expect(errors[0]).toMatch(/missing.*url/i);
  });

  it('returns empty + error for an empty input', () => {
    const result = parseRaindropCsv('');
    expect(result.bookmarks).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
  });

  it('skips fully-blank trailing rows', () => {
    const csv = 'url\nhttps://a.com\n,\n,';
    const { bookmarks } = parseRaindropCsv(csv);
    expect(bookmarks).toHaveLength(1);
  });

  it('handles unicode in titles and notes', () => {
    const csv = 'url,title,note\nhttps://u.com,日本語,Emoji 🎉';
    const { bookmarks } = parseRaindropCsv(csv);
    expect(bookmarks[0].title).toBe('日本語');
    expect(bookmarks[0].notes).toBe('Emoji 🎉');
  });
});

describe('parseNetscapeHtml', () => {
  const HTML_SAMPLE = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="1629980125" LAST_MODIFIED="1629980125">Dev</H3>
    <DL><p>
        <DT><A HREF="https://example.com" ADD_DATE="1629980125">Example</A>
        <DD>A note about this page
        <DT><A HREF="https://plain.com">Plain</A>
    </DL><p>
    <DT><A HREF="https://top.com">Top level</A>
</DL><p>`;

  it('extracts url, title, and note from bookmark entries', () => {
    const { bookmarks } = parseNetscapeHtml(HTML_SAMPLE);
    const example = bookmarks.find((b) => b.url === 'https://example.com');
    expect(example).toMatchObject({
      url: 'https://example.com',
      title: 'Example',
      notes: 'A note about this page'
    });
  });

  it('tracks folder nesting through H3/DL', () => {
    const { bookmarks } = parseNetscapeHtml(HTML_SAMPLE);
    const example = bookmarks.find((b) => b.url === 'https://example.com');
    expect(example.folder).toBe('Dev');
    // A bookmark outside the folder has a null folder.
    const top = bookmarks.find((b) => b.url === 'https://top.com');
    expect(top.folder).toBeNull();
  });

  it('converts ADD_DATE Unix seconds to ISO', () => {
    const { bookmarks } = parseNetscapeHtml(HTML_SAMPLE);
    const example = bookmarks.find((b) => b.url === 'https://example.com');
    expect(example.createdAt).toBe('2021-08-26T12:15:25.000Z');
  });

  it('skips non-http schemes (javascript:, place:, file:)', () => {
    const html = '<DL><p><DT><A HREF="javascript:void(0)">JS</A><DT><A HREF="https://keep.com">Keep</A></DL><p>';
    const { bookmarks } = parseNetscapeHtml(html);
    expect(bookmarks).toHaveLength(1);
    expect(bookmarks[0].url).toBe('https://keep.com');
  });

  it('returns empty for blank input', () => {
    expect(parseNetscapeHtml('').bookmarks).toHaveLength(0);
  });
});

describe('parseBackupJson', () => {
  it('restores a Buckley\'s backup with full fidelity', () => {
    const json = JSON.stringify({
      format: 'buckleys-backup',
      version: 1,
      exportedAt: '2025-01-01T00:00:00Z',
      pages: [
        { url: 'https://a.com', title: 'A', notes: 'n', tags: ['t1'], savedAt: '2025-01-01T00:00:00Z', projectId: 'p1' }
      ],
      projects: [{ id: 'p1', name: 'Proj', visibility: 'private' }]
    });
    const { bookmarks } = parseBackupJson(json);
    expect(bookmarks[0]).toMatchObject({
      url: 'https://a.com',
      title: 'A',
      notes: 'n',
      tags: ['t1'],
      createdAt: '2025-01-01T00:00:00Z',
      projectId: 'p1'
    });
  });

  it('skips pages without a URL', () => {
    const json = JSON.stringify({
      format: 'buckleys-backup', version: 1, pages: [{ title: 'no url' }], projects: []
    });
    const { bookmarks, errors } = parseBackupJson(json);
    expect(bookmarks).toHaveLength(0);
    expect(errors.some((e) => e.includes('missing URL'))).toBe(true);
  });

  it('errors on invalid JSON', () => {
    const { bookmarks, errors } = parseBackupJson('{ not json');
    expect(bookmarks).toHaveLength(0);
    expect(errors[0]).toMatch(/Invalid JSON/);
  });

  it('errors when pages array is missing', () => {
    const { bookmarks, errors } = parseBackupJson(JSON.stringify({ format: 'buckleys-backup' }));
    expect(bookmarks).toHaveLength(0);
    expect(errors[0]).toMatch(/missing.*pages/i);
  });
});

describe('detectImportFormat', () => {
  it('detects by extension', () => {
    expect(detectImportFormat('bookmarks.csv')).toBe('csv');
    expect(detectImportFormat('bookmarks.json')).toBe('json');
    expect(detectImportFormat('bookmarks.html')).toBe('html');
    expect(detectImportFormat('bookmarks.htm')).toBe('html');
  });

  it('falls back to content sniffing', () => {
    expect(detectImportFormat('unknown', '<!DOCTYPE html>')).toBe('html');
    expect(detectImportFormat('unknown', '{"format":')).toBe('json');
    expect(detectImportFormat('unknown', 'url,title\nhttps://x.com,X')).toBe('csv');
  });

  it('returns null when it cannot tell', () => {
    expect(detectImportFormat('unknown', 'mystery content')).toBeNull();
  });
});

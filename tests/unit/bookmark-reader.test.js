import { describe, expect, it } from 'vitest';
import {
  flattenBookmarks,
  isImportableUrl,
  normalizeUrl,
  readAllBookmarks
} from '../../src/bookmark-reader.js';

describe('flattenBookmarks', () => {
  it('collects url-bearing nodes from a nested tree', () => {
    const tree = [
      {
        title: 'root',
        children: [
          { url: 'https://a.com', title: 'A' },
          {
            title: 'folder',
            children: [
              { url: 'https://b.com', title: 'B' },
              { url: 'https://c.com', title: 'C' }
            ]
          }
        ]
      }
    ];

    const result = flattenBookmarks(tree);
    expect(result.map(r => r.url)).toEqual(['https://a.com', 'https://b.com', 'https://c.com']);
  });

  it('skips folder nodes that have no url', () => {
    const tree = [{ title: 'folder', children: [{ url: 'https://a.com', title: 'A' }] }];
    const result = flattenBookmarks(tree);
    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('https://a.com');
  });

  it('handles an empty or malformed tree', () => {
    expect(flattenBookmarks([])).toEqual([]);
    expect(flattenBookmarks(null)).toEqual([]);
  });
});

describe('isImportableUrl', () => {
  it('accepts http and https', () => {
    expect(isImportableUrl('http://example.com')).toBe(true);
    expect(isImportableUrl('https://example.com')).toBe(true);
  });

  it('rejects non-http schemes', () => {
    expect(isImportableUrl('javascript:alert(1)')).toBe(false);
    expect(isImportableUrl('file:///etc/passwd')).toBe(false);
    expect(isImportableUrl('moz-extension://abc/page.html')).toBe(false);
  });

  it('rejects garbage and empty input', () => {
    expect(isImportableUrl('not a url')).toBe(false);
    expect(isImportableUrl('')).toBe(false);
    expect(isImportableUrl(null)).toBe(false);
    expect(isImportableUrl(undefined)).toBe(false);
  });
});

describe('normalizeUrl', () => {
  it('lowercases and strips trailing slashes', () => {
    expect(normalizeUrl('HTTPS://GitHub.COM/')).toBe('https://github.com');
  });

  it('keeps query strings and fragments', () => {
    expect(normalizeUrl('https://a.com/page?x=1#sec')).toBe('https://a.com/page?x=1#sec');
  });
});

describe('readAllBookmarks', () => {
  // A fake bookmarks API wrapping a static tree.
  const fakeApi = (tree) => ({ getTree: async () => tree });

  it('returns deduplicated, http-only bookmarks', async () => {
    const api = fakeApi([
      {
        children: [
          { url: 'https://a.com', title: 'A' },
          { url: 'https://b.com/', title: 'B trailing slash' },
          { url: 'HTTPS://A.COM', title: 'A dup different case' },
          { url: 'javascript:void(0)', title: 'bookmarklet' }
        ]
      }
    ]);

    const result = await readAllBookmarks({ bookmarksApi: api });

    expect(result.bookmarks).toHaveLength(2);
    expect(result.bookmarks[0].url).toBe('https://a.com');
    // 'HTTPS://A.COM' normalizes to the same as 'https://a.com' → deduped.
    expect(result.bookmarks.some(b => b.url === 'HTTPS://A.COM')).toBe(false);
    expect(result.total).toBe(4);
    expect(result.skipped).toBe(2);
  });

  it('walks nested folders', async () => {
    const api = fakeApi([
      {
        children: [
          { url: 'https://x.com', title: 'X' },
          { children: [{ url: 'https://y.com', title: 'Y' }] }
        ]
      }
    ]);

    const result = await readAllBookmarks({ bookmarksApi: api });
    expect(result.bookmarks.map(b => b.url)).toEqual(['https://x.com', 'https://y.com']);
  });

  it('throws when the bookmarks API is unavailable', async () => {
    await expect(readAllBookmarks({ bookmarksApi: null })).rejects.toThrow('Bookmarks API not available');
  });
});

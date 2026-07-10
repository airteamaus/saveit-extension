import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildClientObject, truncateContent } from '../../src/page-capture.js';

// In a real browser, Readability returns null on app-like pages (Google Drive,
// Plex, dashboards) due to shadow DOM, iframes, and scoring thresholds against
// large chrome trees. happy-dom's DOM is too small/clean to reproduce that, so
// fixtures with any <p>/<div> text get parsed as articles and never reach the
// fallback branch. To exercise the fallback path deterministically we force
// Readability.parse() to return null via this flag. The flag defaults to false
// (real Readability runs, see the success tests) and is set true only inside
// the fallback tests. A top-level beforeEach resets it before every test so a
// forced-null test can never leak into a real-Readability test via ordering.
let readabilityForcedNull = false;

vi.mock('@mozilla/readability', async () => {
  const actual = await vi.importActual('@mozilla/readability');
  return {
    Readability: class extends actual.Readability {
      parse() {
        return readabilityForcedNull ? null : super.parse();
      }
    }
  };
});

// Guard against test-ordering leakage of the forced-null flag.
beforeAll(() => {
  readabilityForcedNull = false;
});
beforeEach(() => {
  readabilityForcedNull = false;
});

describe('truncateContent', () => {
  it('truncates to 12000 chars head-weighted', () => {
    const long = 'a'.repeat(20000);
    const result = truncateContent(long);
    expect(result.length).toBe(12000);
  });

  it('leaves short content unchanged', () => {
    expect(truncateContent('short')).toBe('short');
  });

  it('handles null input', () => {
    expect(truncateContent(null)).toBeNull();
  });
});

describe('buildClientObject', () => {
  it('extracts title, content, and meta from a document', () => {
    // happy-dom provides a DOM in the test environment
    document.head.innerHTML = `
      <meta property="og:title" content="OG Title">
      <meta property="og:description" content="OG desc">
      <meta property="og:image" content="https://example.com/img.png">
      <meta property="article:published_time" content="2026-07-01T10:00:00Z">
      <meta name="author" content="Jane Doe">
    `;
    document.body.innerHTML = `
      <article>
        <h1>OG Title</h1>
        <p>This is the article body. It has enough text for Readability to detect it as the main content. ${'x'.repeat(200)}</p>
      </article>
    `;

    const client = buildClientObject(document);

    expect(client.capture_method).toBe('readability');
    expect(client.title).toBeTruthy();
    expect(client.content).toBeTruthy();
    expect(client.content.length).toBeLessThanOrEqual(12000);
    expect(client.image).toBe('https://example.com/img.png');
    expect(client.byline).toBe('Jane Doe');
    expect(client.published_time).toBe('2026-07-01T10:00:00Z');
    expect(client.captured_at).toBeTruthy();
  });

  it('falls back to innerText when Readability finds no article', () => {
    // Simulate a real app shell where Readability finds no article.
    readabilityForcedNull = true;
    // App shell with rendered text (like Google Drive showing a document)
    document.head.innerHTML = '<title>My Document - Drive</title>';
    document.body.innerHTML = `
      <nav>Menu Home Settings</nav>
      <div id="app">
        <h1>Quarterly Budget Report</h1>
        <p>Total revenue: $1,200,000. Operating expenses: $800,000.</p>
        <p>Net profit for Q3: $400,000, up 15% from last quarter.</p>
      </div>
      <footer>Copyright 2026 Footer Links</footer>
    `;

    const client = buildClientObject(document);

    expect(client.capture_method).toBe('fallback');
    expect(client.content).toBeTruthy();
    // Nav and footer text should have been stripped
    expect(client.content).not.toContain('Menu Home Settings');
    expect(client.content).not.toContain('Copyright 2026');
    // Real content should be present
    expect(client.content).toContain('Quarterly Budget Report');
  });

  it('returns capture_method none when page has no body text at all', () => {
    readabilityForcedNull = true;
    document.head.innerHTML = '';
    document.body.innerHTML = '<div id="app"></div>';

    const client = buildClientObject(document);

    expect(client.capture_method).toBe('none');
    expect(client.content).toBeNull();
  });

  it('truncates fallback content to 12000 chars', () => {
    readabilityForcedNull = true;
    document.head.innerHTML = '';
    document.body.innerHTML = `<div>${'x'.repeat(20000)}</div>`;

    const client = buildClientObject(document);

    expect(client.capture_method).toBe('fallback');
    expect(client.content.length).toBeLessThanOrEqual(12000);
  });

  it('restores real Readability after a forced-null test', () => {
    // Same shape as the success test above — proven to make real Readability
    // find an article in happy-dom. Guards against the forced-null flag leaking
    // across tests via ordering.
    document.body.innerHTML = `
      <article>
        <h1>Real Article</h1>
        <p>This is the article body. It has enough text for Readability to detect it as the main content. ${'x'.repeat(200)}</p>
      </article>
    `;
    const client = buildClientObject(document);
    expect(client.capture_method).toBe('readability');
  });
});

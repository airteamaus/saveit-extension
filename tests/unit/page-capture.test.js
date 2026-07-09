import { describe, expect, it } from 'vitest';
import { buildClientObject, truncateContent } from '../../src/page-capture.js';

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

  it('returns capture_method none and null content when Readability finds nothing', () => {
    // A page with no article content (e.g. a bare app shell)
    document.head.innerHTML = '';
    document.body.innerHTML = '<div id="app"></div>';

    const client = buildClientObject(document);

    expect(client.capture_method).toBe('none');
    expect(client.content).toBeNull();
  });
});

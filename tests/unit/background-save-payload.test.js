import { describe, expect, it } from 'vitest';

// buildPageData is the pure payload-builder extracted from savePageFromTab so
// the POST shape is unit-testable without mocking the full save flow (fetch,
// scripting, badges, bookmarks). It is the contract surface between the
// browser capture and the backend: { url, title, saved_at, projectId?, source,
// client }. source is always 'client' for single saves — the browser captured
// the page the user was viewing — even when capture failed (content null).
//
// background.js throws at load time if no browser runtime global is present,
// so we set a minimal stub before importing. buildPageData itself does not
// touch the browser API.
globalThis.browser = globalThis.browser ?? {
  runtime: { id: 'test-extension', getManifest: () => ({ version: '0', name: 'test' }), onMessage: { addListener() {} } },
  action: { onClicked: { addListener() {} }, setBadgeText() {}, setBadgeBackgroundColor() {} }
};

import { buildPageData } from '../../src/background.js';

describe('buildPageData', () => {
  it('includes source=client and the client object', () => {
    const tab = { url: 'https://example.com', title: 'Tab' };
    const client = { title: 'Real', content: 'body', capture_method: 'readability' };
    const data = buildPageData(tab, { projectId: null, client });
    expect(data.source).toBe('client');
    expect(data.client).toEqual(client);
    expect(data.url).toBe('https://example.com');
    expect(data.title).toBe('Tab');
    expect(data.saved_at).toBeTruthy();
  });

  it('includes source=client even when capture failed (content null)', () => {
    const tab = { url: 'https://example.com', title: 'Tab' };
    const client = { title: '', content: null, capture_method: 'none' };
    const data = buildPageData(tab, { projectId: 'p1', client });
    expect(data.source).toBe('client');
    expect(data.client.content).toBeNull();
    expect(data.projectId).toBe('p1');
  });

  it('omits projectId when none is provided', () => {
    const tab = { url: 'https://example.com', title: 'Tab' };
    const client = { content: null, capture_method: 'none' };
    const data = buildPageData(tab, { projectId: null, client });
    expect(data).not.toHaveProperty('projectId');
  });
});

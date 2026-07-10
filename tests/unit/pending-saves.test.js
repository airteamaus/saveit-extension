import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  PENDING_SAVES_KEY,
  addPendingSave,
  getPendingSaves,
  clearPendingSave,
  buildOptimisticPage
} from '../../src/pending-saves.js';

// Minimal storage.local mock. Each test gets a fresh store.
function createMemoryStorage() {
  let store = {};
  return {
    store,
    get: vi.fn(async (keys) => {
      if (keys === null || keys === undefined) {
        return { ...store };
      }
      if (typeof keys === 'string') {
        return keys in store ? { [keys]: store[keys] } : {};
      }
      if (Array.isArray(keys)) {
        const out = {};
        for (const k of keys) {
          if (k in store) out[k] = store[k];
        }
        return out;
      }
      return { ...store };
    }),
    set: vi.fn(async (entries) => {
      store = { ...store, ...entries };
    }),
    remove: vi.fn(async (keys) => {
      const arr = Array.isArray(keys) ? keys : [keys];
      const next = { ...store };
      for (const k of arr) delete next[k];
      store = next;
    })
  };
}

describe('pending-saves storage', () => {
  let storage;

  beforeEach(() => {
    storage = createMemoryStorage();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('writes a pending save record keyed by url under the shared key', async () => {
    const payload = {
      url: 'https://example.com/article',
      title: 'Article',
      saved_at: '2026-07-09T10:00:00.000Z'
    };

    await addPendingSave(storage, payload);

    const result = await storage.get(PENDING_SAVES_KEY);
    const records = result[PENDING_SAVES_KEY];
    expect(records).toBeDefined();
    // keyed by normalized url so re-saves collapse
    expect(Object.keys(records)).toHaveLength(1);
    const record = Object.values(records)[0];
    expect(record.url).toBe(payload.url);
    expect(record.title).toBe('Article');
    expect(record.saved_at).toBe(payload.saved_at);
  });

  it('normalizes the record key so trailing-slash variants collapse', async () => {
    await addPendingSave(storage, {
      url: 'https://example.com/article',
      title: 'First',
      saved_at: '2026-07-09T10:00:00.000Z'
    });
    await addPendingSave(storage, {
      url: 'https://example.com/article/',
      title: 'Second',
      saved_at: '2026-07-09T10:00:01.000Z'
    });

    const records = await getPendingSaves(storage);
    expect(Object.keys(records)).toHaveLength(1);
    // the later save wins (most recent title/saved_at)
    const record = Object.values(records)[0];
    expect(record.title).toBe('Second');
  });

  it('reads pending saves as an object keyed by normalized url', async () => {
    await addPendingSave(storage, { url: 'https://a.com/1', title: 'A', saved_at: '2026-07-09T10:00:00.000Z' });
    await addPendingSave(storage, { url: 'https://b.com/2', title: 'B', saved_at: '2026-07-09T10:00:01.000Z' });

    const records = await getPendingSaves(storage);
    expect(Object.keys(records)).toHaveLength(2);
  });

  it('returns an empty object when no pending saves exist', async () => {
    const records = await getPendingSaves(storage);
    expect(records).toEqual({});
  });

  it('clears a single pending save by url', async () => {
    await addPendingSave(storage, { url: 'https://a.com/1', title: 'A', saved_at: '2026-07-09T10:00:00.000Z' });
    await addPendingSave(storage, { url: 'https://b.com/2', title: 'B', saved_at: '2026-07-09T10:00:01.000Z' });

    await clearPendingSave(storage, 'https://a.com/1');

    const records = await getPendingSaves(storage);
    expect(Object.keys(records)).toHaveLength(1);
    expect(Object.values(records)[0].url).toBe('https://b.com/2');
  });
});

describe('buildOptimisticPage', () => {
  it('builds a renderer-safe optimistic page object from a pending record', () => {
    const record = {
      url: 'https://example.com/article',
      title: 'Article',
      description: 'A description',
      image: 'https://example.com/og.png',
      saved_at: '2026-07-09T10:00:00.000Z'
    };

    const page = buildOptimisticPage(record);

    expect(page.url).toBe('https://example.com/article');
    expect(page.title).toBe('Article');
    expect(page.description).toBe('A description');
    expect(page.image).toBe('https://example.com/og.png');
    expect(page.saved_at).toBe('2026-07-09T10:00:00.000Z');
    expect(page.domain).toBe('example.com');
    // synthetic, stable, non-null id derived from the url
    expect(page.id).toMatch(/^optimistic:/);
    expect(page.id).toBe(`optimistic:${page.url}`);
    // renderer-required fields with safe defaults
    expect(page.pinned).toBe(false);
    expect(page.classifications).toEqual([]);
    expect(page.manual_tags).toEqual([]);
    expect(page.ai_summary_brief).toBeNull();
    expect(page.reading_time_minutes).toBeNull();
    // the flag that excludes it from anchor selection
    expect(page.optimistic).toBe(true);
  });

  it('derives domain from the url when not provided', () => {
    const page = buildOptimisticPage({ url: 'https://www.howtogeek.com/x', saved_at: '2026-07-09T10:00:00.000Z' });
    expect(page.domain).toBe('www.howtogeek.com');
  });

  it('includes project_ids when a projectId is provided', () => {
    const page = buildOptimisticPage(
      { url: 'https://example.com/x', saved_at: '2026-07-09T10:00:00.000Z' },
      { projectId: 'proj-1' }
    );
    expect(page.project_ids).toEqual(['proj-1']);
  });

  it('omits project_ids (empty array) when no projectId', () => {
    const page = buildOptimisticPage({ url: 'https://example.com/x', saved_at: '2026-07-09T10:00:00.000Z' });
    expect(page.project_ids).toEqual([]);
  });
});

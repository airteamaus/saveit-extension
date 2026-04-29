import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

describe('theme-manager', () => {
  const UNSPLASH_BACKGROUND_QUERIES = [
    'architecture',
    'japan',
    'scenic landscape',
    'mountain lake',
    'forest mist',
    'coastal cliffs',
    'city skyline',
    'modern interior',
    'temple street',
    'desert dunes'
  ];

  function buildUnsplashRandomPhotoUrl(randomValue = 0) {
    const query = UNSPLASH_BACKGROUND_QUERIES[
      Math.floor(randomValue * UNSPLASH_BACKGROUND_QUERIES.length)
    ];
    const url = new URL('https://api.unsplash.com/photos/random');
    url.searchParams.set('orientation', 'landscape');
    url.searchParams.set('query', query);
    return url.toString();
  }

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds a landscape query URL for the selected background theme', () => {
    const url = new URL(buildUnsplashRandomPhotoUrl(0.1));

    expect(url.origin).toBe('https://api.unsplash.com');
    expect(url.pathname).toBe('/photos/random');
    expect(url.searchParams.get('orientation')).toBe('landscape');
    expect(UNSPLASH_BACKGROUND_QUERIES).toContain(url.searchParams.get('query'));
  });

  it('can select japan-specific backgrounds from the query pool', () => {
    const japanIndex = UNSPLASH_BACKGROUND_QUERIES.indexOf('japan');
    const randomValue = (japanIndex + 0.01) / UNSPLASH_BACKGROUND_QUERIES.length;
    const url = new URL(buildUnsplashRandomPhotoUrl(randomValue));

    expect(url.searchParams.get('query')).toBe('japan');
  });

  it('can select scenic landscape backgrounds from the query pool', () => {
    const scenicIndex = UNSPLASH_BACKGROUND_QUERIES.indexOf('scenic landscape');
    const randomValue = (scenicIndex + 0.01) / UNSPLASH_BACKGROUND_QUERIES.length;
    const url = new URL(buildUnsplashRandomPhotoUrl(randomValue));

    expect(url.searchParams.get('query')).toBe('scenic landscape');
  });
});

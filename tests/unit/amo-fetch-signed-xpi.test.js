import { describe, expect, it, vi } from 'vitest';

import {
  ADDON_ID,
  createAmoJwt,
  fetchSignedXpiForVersion,
  getAmoVersion,
  EXIT_NEEDS_SIGNING
} from '../../scripts/amo-fetch-signed-xpi.js';

// The fetch impl receives a URL; tests return canned responses.
function mockResponse({ status = 200, json = {}, body } = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => json,
    body,
    arrayBuffer: async () => Buffer.from('xpi-bytes')
  };
}

describe('createAmoJwt', () => {
  it('produces a valid HS256 JWT with iss/iat/exp claims', () => {
    const token = createAmoJwt({ issuer: 'key-123', secret: 'secret-456', issuedAt: 1_000_000, ttlSeconds: 300 });
    const [headerB64, payloadB64] = token.split('.');
    const decode = s => JSON.parse(Buffer.from(s, 'base64url').toString());

    expect(decode(headerB64)).toEqual({ alg: 'HS256', typ: 'JWT' });
    expect(decode(payloadB64)).toMatchObject({ iss: 'key-123', iat: 1000, exp: 1300 });
    expect(token.split('.')).toHaveLength(3); // header.payload.signature
  });

  it('is signed with HMAC-SHA256 over header.payload (verifiable against Node crypto)', async () => {
    const { createHmac } = await import('crypto');
    const issuer = 'key-123';
    const secret = 'secret-456';
    const token = createAmoJwt({ issuer, secret, issuedAt: 1_000_000, ttlSeconds: 300 });
    const [headerB64, payloadB64, signature] = token.split('.');
    const signingInput = `${headerB64}.${payloadB64}`;
    const expectedSig = createHmac('sha256', secret).update(signingInput).digest('base64url');
    expect(signature).toBe(expectedSig);
  });

  it('throws if issuer or secret is missing', () => {
    expect(() => createAmoJwt({ issuer: '', secret: 'x' })).toThrow();
    expect(() => createAmoJwt({ issuer: 'x', secret: '' })).toThrow();
  });
});

describe('getAmoVersion', () => {
  it('returns status 200 + fileUrl when the version exists with a signed file', async () => {
    const fetchImpl = vi.fn(async () => mockResponse({
      status: 200,
      json: { file: { url: 'https://amo.example/signed.xpi', status: 'public' } }
    }));

    const result = await getAmoVersion({
      addonId: ADDON_ID, version: '1.19.2', issuer: 'k', secret: 's', fetchImpl
    });

    expect(result).toEqual({ status: 200, fileUrl: 'https://amo.example/signed.xpi' });
    // Called the canonical version-detail endpoint with JWT auth.
    const calledUrl = String(fetchImpl.mock.calls[0][0]);
    expect(calledUrl).toBe(`https://addons.mozilla.org/api/v5/addons/addon/${ADDON_ID}/versions/1.19.2/`);
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toMatch(/^JWT .+\..+\..+$/);
  });

  it('returns status 404 (no fileUrl) when the version is not on AMO', async () => {
    const fetchImpl = vi.fn(async () => mockResponse({ status: 404 }));
    const result = await getAmoVersion({ addonId: ADDON_ID, version: '9.9.9', issuer: 'k', secret: 's', fetchImpl });
    expect(result).toEqual({ status: 404 });
  });

  it('returns 200 with null fileUrl when the version exists but has no signed file yet', async () => {
    const fetchImpl = vi.fn(async () => mockResponse({ status: 200, json: { file: null } }));
    const result = await getAmoVersion({ addonId: ADDON_ID, version: '1.0.0', issuer: 'k', secret: 's', fetchImpl });
    expect(result).toEqual({ status: 200, fileUrl: null });
  });

  it('surfaces non-200/non-404 statuses for the caller to decide', async () => {
    const fetchImpl = vi.fn(async () => mockResponse({ status: 500 }));
    const result = await getAmoVersion({ addonId: ADDON_ID, version: '1.0.0', issuer: 'k', secret: 's', fetchImpl });
    expect(result).toEqual({ status: 500 });
  });
});

describe('fetchSignedXpiForVersion', () => {
  it('downloads and saves the XPI when the version exists (reuse path)', async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (String(url).includes('/versions/1.19.2/')) {
        return mockResponse({ status: 200, json: { file: { url: 'https://amo.example/x.xpi' } } });
      }
      // The XPI download call.
      return mockResponse({ status: 200 });
    });
    const written = {};
    const writeFile = vi.fn(async (outPath, buffer) => { written[outPath] = buffer.toString(); });

    const result = await fetchSignedXpiForVersion({
      version: '1.19.2', issuer: 'k', secret: 's',
      artifactsDir: '/tmp/fake-artifacts', fetchImpl, writeFile
    });

    expect(result.needsSigning).toBe(false);
    expect(result.outPath).toBe('/tmp/fake-artifacts/saveit-1.19.2.xpi');
    expect(writeFile).toHaveBeenCalledWith(result.outPath, expect.any(Buffer));
    expect(written[result.outPath]).toBe('xpi-bytes');
  });

  it('returns needsSigning when the version is not on AMO (caller runs web-ext sign)', async () => {
    const fetchImpl = vi.fn(async () => mockResponse({ status: 404 }));
    const result = await fetchSignedXpiForVersion({
      version: '9.9.9', issuer: 'k', secret: 's', artifactsDir: '/tmp/x', fetchImpl
    });
    expect(result).toEqual({ needsSigning: true });
  });

  it('returns needsSigning when the version exists but has no signed file yet (pending review)', async () => {
    const fetchImpl = vi.fn(async () => mockResponse({ status: 200, json: { file: null } }));
    const result = await fetchSignedXpiForVersion({
      version: '1.0.0', issuer: 'k', secret: 's', artifactsDir: '/tmp/x', fetchImpl
    });
    expect(result).toEqual({ needsSigning: true });
  });

  it('throws on a hard AMO failure (5xx) rather than silently signing', async () => {
    const fetchImpl = vi.fn(async () => mockResponse({ status: 500 }));
    await expect(fetchSignedXpiForVersion({
      version: '1.0.0', issuer: 'k', secret: 's', artifactsDir: '/tmp/x', fetchImpl
    })).rejects.toThrow(/HTTP 500/);
  });

  it('falls back to needsSigning when the version exists but its signed file 404s', async () => {
    // Regression: a cancelled prior run can leave a version record on AMO whose
    // signed file URL is not yet downloadable (HTTP 404 on the file, not the
    // version lookup). The old code threw on this — failing the whole release —
    // instead of falling back to a fresh sign. Treat an un-downloadable file as
    // "not reusable" so the caller signs fresh.
    const fetchImpl = vi.fn(async (url) => {
      if (String(url).includes('/versions/1.24.0/')) {
        return mockResponse({ status: 200, json: { file: { url: 'https://amo.example/gone.xpi' } } });
      }
      // The signed-file download: AMO returns 404 (pending/incomplete).
      return mockResponse({ status: 404 });
    });
    const result = await fetchSignedXpiForVersion({
      version: '1.24.0', issuer: 'k', secret: 's', artifactsDir: '/tmp/x', fetchImpl
    });
    expect(result).toEqual({ needsSigning: true });
  });

  it('uses EXIT_NEEDS_SIGNING (10) as a sentinel distinct from success/error', () => {
    expect(EXIT_NEEDS_SIGNING).toBe(10);
    expect(EXIT_NEEDS_SIGNING).not.toBe(0);
    expect(EXIT_NEEDS_SIGNING).not.toBe(1);
  });
});

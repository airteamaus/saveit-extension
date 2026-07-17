import { describe, it, expect, vi } from 'vitest';
import { togglePagePrivacy } from '../../src/newtab-privacy.js';

// Tests for the pure handler extracted from newtab.js so the privacy toggle
// is unit-testable without DOM setup. The DOM wiring in newtab-drawer-*.js
// calls this handler from the delegated card click handler — this module is
// the testable contract.
describe('togglePagePrivacy', () => {
  it('flips private false->true and calls updatePage', async () => {
    const api = { updatePage: vi.fn().mockResolvedValue({ id: 'p1', private: true }) };
    const result = await togglePagePrivacy(api, { id: 'p1', private: false });
    expect(api.updatePage).toHaveBeenCalledWith('p1', { private: true });
    expect(result.private).toBe(true);
  });

  it('flips private true->false', async () => {
    const api = { updatePage: vi.fn().mockResolvedValue({ id: 'p1', private: false }) };
    const result = await togglePagePrivacy(api, { id: 'p1', private: true });
    expect(api.updatePage).toHaveBeenCalledWith('p1', { private: false });
    expect(result.private).toBe(false);
  });

  it('returns the API response so callers can apply the persisted state', async () => {
    const persisted = { id: 'p1', private: true, title: 'kept' };
    const api = { updatePage: vi.fn().mockResolvedValue(persisted) };
    const result = await togglePagePrivacy(api, { id: 'p1', private: false });
    expect(result).toEqual(persisted);
  });

  it('treats undefined private as falsy (defaults to private=true)', async () => {
    const api = { updatePage: vi.fn().mockResolvedValue({ id: 'p1', private: true }) };
    await togglePagePrivacy(api, { id: 'p1' });
    expect(api.updatePage).toHaveBeenCalledWith('p1', { private: true });
  });
});

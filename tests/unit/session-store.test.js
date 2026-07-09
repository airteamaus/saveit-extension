import { describe, expect, it, beforeEach, vi } from 'vitest';

// setup.js mocks session-store globally for the api/background tests.
// This file tests the REAL implementation, so import the actual module.
vi.unmock('../../src/session-store.js');

import {
  getSessionToken,
  getCurrentUser,
  getCurrentUserId,
  setSession,
  clearSession,
  isSignedOut,
  isSessionExpiringSoon
} from '../../src/session-store.js';

describe('session-store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getSessionToken', () => {
    it('returns null when no session is stored', async () => {
      browser.storage.local.get.mockResolvedValue({});
      expect(await getSessionToken()).toBeNull();
    });

    it('returns the token when a valid session exists', async () => {
      const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      browser.storage.local.get.mockResolvedValue({
        saveit_session: { sessionToken: 'tok-123', uid: 'uid-1', email: 'a@b.com', expiresAt: future }
      });
      expect(await getSessionToken()).toBe('tok-123');
    });

    it('returns null when the token has expired', async () => {
      const past = new Date(Date.now() - 1000).toISOString();
      browser.storage.local.get.mockResolvedValue({
        saveit_session: { sessionToken: 'tok-123', uid: 'uid-1', expiresAt: past }
      });
      expect(await getSessionToken()).toBeNull();
    });

    it('returns null when expiresAt is missing', async () => {
      browser.storage.local.get.mockResolvedValue({
        saveit_session: { sessionToken: 'tok-123', uid: 'uid-1' }
      });
      expect(await getSessionToken()).toBeNull();
    });
  });

  describe('getCurrentUser', () => {
    it('returns uid and email for a stored session', async () => {
      const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      browser.storage.local.get.mockResolvedValue({
        saveit_session: { sessionToken: 'tok', uid: 'uid-1', email: 'a@b.com', expiresAt: future }
      });
      expect(await getCurrentUser()).toEqual({ uid: 'uid-1', email: 'a@b.com' });
    });

    it('returns the uid even when the token has expired (for cache bootstrap)', async () => {
      const past = new Date(Date.now() - 1000).toISOString();
      browser.storage.local.get.mockResolvedValue({
        saveit_session: { sessionToken: 'tok', uid: 'uid-1', email: 'a@b.com', expiresAt: past }
      });
      expect(await getCurrentUser()).toEqual({ uid: 'uid-1', email: 'a@b.com' });
    });

    it('returns null when no session is stored', async () => {
      browser.storage.local.get.mockResolvedValue({});
      expect(await getCurrentUser()).toBeNull();
    });
  });

  describe('getCurrentUserId', () => {
    it('returns just the uid', async () => {
      browser.storage.local.get.mockResolvedValue({
        saveit_session: { uid: 'uid-9', expiresAt: new Date(Date.now() + 100000).toISOString() }
      });
      expect(await getCurrentUserId()).toBe('uid-9');
    });

    it('returns null when no uid', async () => {
      browser.storage.local.get.mockResolvedValue({});
      expect(await getCurrentUserId()).toBeNull();
    });
  });

  describe('setSession', () => {
    it('persists the session under saveit_session', async () => {
      await setSession({ sessionToken: 'tok', uid: 'uid-1', email: 'a@b.com', expiresAt: '2099-01-01' });

      expect(browser.storage.local.set).toHaveBeenCalledWith({
        saveit_session: { sessionToken: 'tok', uid: 'uid-1', email: 'a@b.com', expiresAt: '2099-01-01' }
      });
    });

    it('normalizes missing email to null', async () => {
      await setSession({ sessionToken: 'tok', uid: 'uid-1', expiresAt: '2099-01-01' });

      expect(browser.storage.local.set).toHaveBeenCalledWith({
        saveit_session: { sessionToken: 'tok', uid: 'uid-1', email: null, expiresAt: '2099-01-01' }
      });
    });
  });

  describe('clearSession', () => {
    it('removes the saveit_session key', async () => {
      await clearSession();
      expect(browser.storage.local.remove).toHaveBeenCalledWith('saveit_session');
    });
  });

  describe('isSignedOut', () => {
    it('returns true when no session token', async () => {
      browser.storage.local.get.mockResolvedValue({});
      expect(await isSignedOut()).toBe(true);
    });

    it('returns false when a valid token exists', async () => {
      browser.storage.local.get.mockResolvedValue({
        saveit_session: { sessionToken: 'tok', uid: 'uid-1', expiresAt: new Date(Date.now() + 100000).toISOString() }
      });
      expect(await isSignedOut()).toBe(false);
    });
  });

  describe('isSessionExpiringSoon', () => {
    it('returns false when no session', async () => {
      browser.storage.local.get.mockResolvedValue({});
      expect(await isSessionExpiringSoon()).toBe(false);
    });

    it('returns false when expiry is far away', async () => {
      browser.storage.local.get.mockResolvedValue({
        saveit_session: { expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() }
      });
      expect(await isSessionExpiringSoon()).toBe(false);
    });

    it('returns true when expiry is within the headroom window', async () => {
      browser.storage.local.get.mockResolvedValue({
        saveit_session: { expiresAt: new Date(Date.now() + 60 * 1000).toISOString() } // 1 min
      });
      expect(await isSessionExpiringSoon()).toBe(true);
    });
  });
});

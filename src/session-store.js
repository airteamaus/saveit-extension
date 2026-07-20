// session-store.js - Opaque session-token storage shared between contexts
//
// Replaces the Firebase client SDK's IndexedDB-persisted session. The opaque
// session token issued by POST /auth/session lives in browser.storage.local,
// which both the background service worker and the newtab page read/write
// directly — no messaging needed, no per-context auth state to reconcile.

import { getStorageAPI } from './config.js';

const SESSION_KEY = 'saveit_session';

/**
 * Read the raw storage object. Returns null if absent or storage unavailable.
 * @returns {Promise<{sessionToken: string, uid: string, email: string, expiresAt: string}|null>}
 */
async function readSession() {
  const storage = getStorageAPI();
  if (!storage) {
    return null;
  }
  try {
    const result = await storage.get(SESSION_KEY);
    return result?.[SESSION_KEY] || null;
  } catch (error) {
    console.error('[session-store] Failed to read session', error);
    return null;
  }
}

/**
 * Get the current opaque session token, or null if not signed in / expired.
 * @returns {Promise<string|null>}
 */
export async function getSessionToken() {
  const session = await readSession();
  if (!session?.sessionToken) {
    return null;
  }
  if (isExpired(session.expiresAt)) {
    return null;
  }
  return session.sessionToken;
}

/**
 * Get the current user identity { uid, email }, or null if not signed in.
 * Unlike getSessionToken, this returns the uid even for a session whose
 * token has just expired — callers use it to seed the cache bootstrap so a
 * re-prompt doesn't lose the user's cached data.
 * @returns {Promise<{uid: string, email: string}|null>}
 */
export async function getCurrentUser() {
  const session = await readSession();
  if (!session?.uid) {
    return null;
  }
  return { uid: session.uid, email: session.email || null };
}

/**
 * Get just the uid, or null. Convenience for CacheManager seeding.
 * @returns {Promise<string|null>}
 */
export async function getCurrentUserId() {
  const user = await getCurrentUser();
  return user?.uid || null;
}

/**
 * Persist a freshly issued/rotated session.
 * @param {Object} session
 * @param {string} session.sessionToken - Opaque token from the backend
 * @param {string} session.uid - User id (== Google sub)
 * @param {string} [session.email]
 * @param {string} session.expiresAt - ISO timestamp from the backend
 * @returns {Promise<void>}
 */
export async function setSession({ sessionToken, uid, email, expiresAt }) {
  const storage = getStorageAPI();
  if (!storage) {
    return;
  }
  await storage.set({
    [SESSION_KEY]: { sessionToken, uid, email: email || null, expiresAt }
  });
}

/**
 * Remove the stored session (sign-out).
 * @returns {Promise<void>}
 */
export async function clearSession() {
  const storage = getStorageAPI();
  if (!storage) {
    return;
  }
  try {
    await storage.remove(SESSION_KEY);
  } catch (error) {
    console.error('[session-store] Failed to clear session', error);
  }
}

function isExpired(expiresAtIso) {
  if (!expiresAtIso) {
    return true;
  }
  return new Date(expiresAtIso).getTime() <= Date.now();
}

import { attachTelemetryContext, getSafeRedirectContext, getSafeResponseContext } from './telemetry.js';
import {
  getSessionToken,
  getCurrentUser,
  setSession,
  clearSession
} from './session-store.js';

export function createBackgroundAuth({
  config,
  browserApi,
  logger = console,
  telemetry = {}
}) {
  /**
   * Returns { user, idToken } if a valid session exists, otherwise null.
   * idToken here is the opaque session token — the backend accepts it via
   * the dual-mode auth middleware.
   */
  async function getExistingSession() {
    const sessionToken = await getSessionToken();
    if (!sessionToken) {
      return null;
    }
    const user = await getCurrentUser();
    if (!user) {
      return null;
    }
    return { user, idToken: sessionToken };
  }

  /**
   * Exchange a one-time Google ID token for an opaque session token via
   * POST /auth/session, then persist it.
   */
  async function exchangeGoogleTokenForSession(googleIdToken, authContext) {
    let response;
    try {
      response = await fetch(`${config.cloudFunctionUrl}/auth/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ google_id_token: googleIdToken })
      });
    } catch (error) {
      const sessionError = attachTelemetryContext(error, authContext);
      logger.error('Session exchange request failed', sessionError, sessionError.telemetryContext);
      throw sessionError;
    }

    if (!response.ok) {
      let message;
      try {
        const data = await response.json();
        message = data.message || data.error || `HTTP ${response.status}`;
      } catch {
        message = `HTTP ${response.status}`;
      }
      const sessionError = attachTelemetryContext(
        new Error(message),
        { ...authContext, httpStatus: response.status }
      );
      logger.error('Session exchange rejected', sessionError.telemetryContext);
      throw sessionError;
    }

    const data = await response.json();
    await setSession({
      sessionToken: data.session_token,
      uid: data.user.uid,
      email: data.user.email,
      expiresAt: data.expires_at
    });

    logger.log('Session established', { hasUser: Boolean(data.user?.uid) });
    return {
      user: data.user,
      idToken: data.session_token
    };
  }

  async function signIn() {
    // Reuse a still-valid session if we have one.
    const existing = await getExistingSession();
    if (existing) {
      logger.log('Reusing existing session');
      return existing;
    }

    const redirectURL = browserApi.identity.getRedirectURL();
    const authContext = {
      authFlow: 'google-oauth',
      interaction: 'interactive',
      runtimeId: browserApi.runtime?.id || null,
      ...getSafeRedirectContext(redirectURL)
    };

    logger.log('Launching OAuth flow', authContext);
    await telemetry.captureMessage?.(
      'OAuth flow launched',
      {
        context: 'sign-in-start',
        surface: 'extension',
        ...authContext
      },
      'warning'
    );

    const authURL = new URL('https://accounts.google.com/o/oauth2/auth');
    authURL.searchParams.set('client_id', config.oauthClientId);
    authURL.searchParams.set('response_type', 'token id_token');
    authURL.searchParams.set('redirect_uri', redirectURL);
    authURL.searchParams.set('scope', 'openid email profile');
    authURL.searchParams.set('prompt', 'select_account');

    let responseURL;
    try {
      responseURL = await browserApi.identity.launchWebAuthFlow({
        interactive: true,
        url: authURL.href
      });
    } catch (error) {
      const authError = attachTelemetryContext(error, authContext);
      logger.error('OAuth flow failed', authError, authError.telemetryContext);
      throw authError;
    }

    const responseContext = {
      ...authContext,
      ...getSafeResponseContext(responseURL)
    };

    let params;
    try {
      params = new URLSearchParams(new URL(responseURL).hash.substring(1));
    } catch (error) {
      const authError = attachTelemetryContext(error, responseContext);
      logger.error('Failed to parse OAuth response', authError, authError.telemetryContext);
      throw authError;
    }

    const googleIdToken = params.get('id_token');

    if (!googleIdToken) {
      const authError = attachTelemetryContext(
        new Error('No ID token received from OAuth'),
        {
          ...responseContext,
          hasIdToken: false
        }
      );
      logger.warn('OAuth response missing ID token', authError.telemetryContext);
      throw authError;
    }

    return await exchangeGoogleTokenForSession(googleIdToken, responseContext);
  }

  async function signOut() {
    const sessionToken = await getSessionToken();
    if (sessionToken) {
      // Best-effort server-side revocation; clearing the local session is the
      // source of truth, so a failed revoke (offline, etc.) is non-fatal.
      try {
        await fetch(`${config.cloudFunctionUrl}/auth/session`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${sessionToken}` }
        });
      } catch (error) {
        logger.warn('Session revoke request failed', { error: error.message });
      }
    }
    await clearSession();
    logger.log('Session cleared');
  }

  return {
    signIn,
    signOut
  };
}

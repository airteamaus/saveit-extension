// api-transport.js — single authenticated fetch implementation shared by the
// API facade (api-core.js) and the background service worker (background.js).
//
// Previously the URL-building, Bearer-header, error-parsing, and session-
// rotation logic was duplicated across api-core._requestWithAuth and
// background.fetchBackgroundApi. Any change to the transport contract (a new
// header, retry policy, token-refresh tweak) had to be made in both places and
// the two auth entry points could drift. This module is the one implementation;
// both call sites compose it with their own token getter and rotation callback.
//
// Pure / dependency-free: safe for the background to import without pulling in
// the full pages/search facade. parseErrorResponse and applySessionRotation
// (from api-core.js) are injected by callers rather than imported here, to keep
// the dependency arrow one-way (api-transport has no upstream imports).

/**
 * Build the full request URL, appending query params when present.
 * Matches the URLSearchParams behaviour previously inlined in both call sites.
 *
 * @param {object} args
 * @param {string} args.url - Absolute URL, or a path resolved against baseUrl.
 * @param {string} args.baseUrl - Base URL prepended when url is relative.
 * @param {object|URLSearchParams|null} [args.params] - Query params.
 * @returns {string}
 */
function buildRequestUrl({ url, baseUrl, params }) {
  const fullUrl = url.startsWith('http') ? url : `${baseUrl}${url}`;
  if (!params) return fullUrl;

  // Accept either a URLSearchParams instance or a plain object. Filter
  // null/undefined from plain objects — new URLSearchParams({k:null}) throws
  // in most environments, and the background path has always skipped them.
  let searchParams;
  if (params instanceof URLSearchParams) {
    searchParams = params;
  } else {
    searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        searchParams.set(key, String(value));
      }
    }
  }
  const qs = searchParams.toString();
  return qs ? `${fullUrl}?${qs}` : fullUrl;
}

/**
 * Single authenticated fetch. Used by the API facade and the background SW.
 *
 * @param {object} args
 * @param {string} args.url - Absolute URL or path (resolved against baseUrl).
 * @param {string} args.baseUrl - Cloud Function base URL.
 * @param {object|URLSearchParams|null} [args.params] - Query-string params.
 *   GET requests rely on these; a request body is silently dropped by the
 *   backend, so params are the only way to pass options on a GET.
 * @param {string} [args.method='GET']
 * @param {string} [args.body] - Pre-serialized request body (a JSON string).
 *   Both call sites serialize before calling, so this is passed through
 *   verbatim; Content-Type: application/json is set when a body is present.
 * @param {object} [args.headers] - Extra headers (Authorization is set here).
 * @param {function(): Promise<string|null>} args.getIdToken - Resolves the
 *   bearer token (facade uses the session token; background uses signIn).
 * @param {function(Response): Promise<void>|void} [args.onRotation] - Called
 *   with the response so the caller can read rotated session headers.
 * @param {function(Response): Promise<string>} [args.parseError] - Maps a
 *   non-ok Response to a human-readable error message. Defaults to a simple
 *   HTTP-status string; callers inject parseErrorResponse for full parity.
 * @returns {Promise<Response>} The raw fetch Response. Throws on !ok with
 *   error.status attached, matching the prior api-core behaviour.
 */
export async function requestWithAuth({
  url,
  baseUrl,
  params = null,
  method = 'GET',
  body = undefined,
  headers = {},
  getIdToken,
  onRotation,
  parseError = null
}) {
  const idToken = await getIdToken();

  const requestHeaders = {
    ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
    ...headers
  };
  if (body !== undefined) {
    requestHeaders['Content-Type'] = requestHeaders['Content-Type'] || 'application/json';
  }

  const response = await fetch(buildRequestUrl({ url, baseUrl, params }), {
    method,
    headers: requestHeaders,
    ...(body !== undefined ? { body } : {})
  });

  if (!response.ok) {
    const errorMessage = parseError
      ? await parseError(response)
      : `HTTP ${response.status}`;
    const error = new Error(errorMessage);
    error.status = response.status;
    throw error;
  }

  // Sliding session refresh: the backend rotates the token inline via response
  // headers once it crosses the refresh threshold. Best-effort — a failure here
  // does not invalidate the request that carried the rotation.
  if (onRotation) {
    await onRotation(response);
  }

  return response;
}

export { buildRequestUrl };

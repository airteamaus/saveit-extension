import { debug, debugWarn, debugError } from './config.js';

const REDACTED = '[REDACTED]';
const SENSITIVE_KEY_PATTERN = /token|authorization|cookie|secret|password|jwt|bearer/i;
const URL_KEY_PATTERN = /url|uri/i;

function formatScope(scope, message) {
  return `[${scope}] ${message}`;
}

function sanitizeString(value, key = '') {
  if (SENSITIVE_KEY_PATTERN.test(key)) {
    return REDACTED;
  }

  const trimmed = value.length > 500 ? `${value.slice(0, 500)}...` : value;
  if (!URL_KEY_PATTERN.test(key)) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return trimmed;
  }
}

function sanitizeValue(value, key = '', depth = 0) {
  if (value === null || value === undefined) {
    return value;
  }

  if (depth > 4) {
    return '[Truncated]';
  }

  if (value instanceof URL) {
    return sanitizeString(value.toString(), key);
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitizeString(value.message, key)
    };
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((entry) => sanitizeValue(entry, key, depth + 1));
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        sanitizeValue(entryValue, entryKey, depth + 1)
      ])
    );
  }

  if (typeof value === 'string') {
    return sanitizeString(value, key);
  }

  return value;
}

export function sanitizeTelemetryContext(context = {}) {
  return sanitizeValue(context);
}

export function attachTelemetryContext(error, context = {}) {
  const safeError = error instanceof Error ? error : new Error(String(error));
  const existingContext = safeError.telemetryContext && typeof safeError.telemetryContext === 'object'
    ? safeError.telemetryContext
    : {};

  safeError.telemetryContext = {
    ...existingContext,
    ...sanitizeTelemetryContext(context)
  };

  return safeError;
}

export function getSafePageContext(url, title = '') {
  const base = {
    hasPageTitle: Boolean(title),
    hasPageUrl: Boolean(url)
  };

  if (!url) {
    return base;
  }

  try {
    const parsed = new URL(url);
    return {
      ...base,
      pageOrigin: parsed.origin,
      pageHost: parsed.hostname,
      pageScheme: parsed.protocol.replace(':', '')
    };
  } catch {
    return base;
  }
}

export function getSafeRedirectContext(redirectUri) {
  const base = {
    hasRedirectUri: Boolean(redirectUri)
  };

  if (!redirectUri) {
    return base;
  }

  try {
    const parsed = new URL(redirectUri);
    return {
      ...base,
      redirectUri: parsed.toString(),
      redirectOrigin: parsed.origin,
      redirectPath: parsed.pathname,
      redirectScheme: parsed.protocol.replace(':', '')
    };
  } catch {
    return {
      ...base,
      redirectUri: sanitizeString(redirectUri, 'redirectUri')
    };
  }
}

export function getSafeResponseContext(responseUri) {
  const base = {
    hasResponseUri: Boolean(responseUri)
  };

  if (!responseUri) {
    return base;
  }

  try {
    const parsed = new URL(responseUri);
    return {
      ...base,
      responseOrigin: parsed.origin,
      responsePath: parsed.pathname,
      responseScheme: parsed.protocol.replace(':', '')
    };
  } catch {
    return base;
  }
}

export function createLogger(scope) {
  return {
    log(message, context) {
      if (context === undefined) {
        debug(formatScope(scope, message));
        return;
      }

      debug(formatScope(scope, message), sanitizeTelemetryContext(context));
    },

    warn(message, context) {
      if (context === undefined) {
        debugWarn(formatScope(scope, message));
        return;
      }

      debugWarn(formatScope(scope, message), sanitizeTelemetryContext(context));
    },

    error(message, error, context) {
      if (context === undefined) {
        debugError(formatScope(scope, message), error);
        return;
      }

      debugError(formatScope(scope, message), sanitizeTelemetryContext(context), error);
    }
  };
}

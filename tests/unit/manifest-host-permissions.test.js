import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const configPath = resolve(repoRoot, 'src', 'config.js');
const manifestPath = resolve(repoRoot, 'manifest.json');

// Extract every backend host the extension can call from src/config.js.
// We parse the source statically (rather than importing CONFIG) because CONFIG
// only exposes the *active* environment, and this check must cover ALL of them
// — a host added to staging/production must be in host_permissions regardless
// of which environment the test process happens to detect.
function backendHostsFromConfig() {
  const src = readFileSync(configPath, 'utf8');
  const hosts = new Set();
  // Match https://... cloudFunctionUrl / realtimeFunctionUrl assignments across
  // all environment blocks. Localhost (development) is intentionally excluded
  // — it needs no host_permission.
  const hostRe = /(cloudFunctionUrl|realtimeFunctionUrl):\s*'(https:\/\/[^']+)'/g;
  let m;
  while ((m = hostRe.exec(src)) !== null) {
    hosts.add(m[2]);
  }
  return [...hosts].sort();
}

function hostPermissionsFromManifest() {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  // Entries are match patterns like "https://host/*"; reduce to bare origins.
  return manifest.host_permissions
    .map((pattern) => pattern.replace(/\/\*$/, ''))
    .sort();
}

describe('manifest host_permissions cover every configured backend host', () => {
  it('lists every cloudFunctionUrl and realtimeFunctionUrl origin', () => {
    const configured = backendHostsFromConfig();
    const permitted = hostPermissionsFromManifest();

    // Sanity: the config must actually contain some real hosts, otherwise the
    // test would pass vacuously (e.g. if config.js were refactored to compute
    // hosts differently and the regex silently matched nothing).
    expect(configured.length).toBeGreaterThan(0);

    const missing = configured.filter((host) => !permitted.includes(host));
    if (missing.length > 0) {
      throw new Error(
        `Backend hosts configured in src/config.js but missing from manifest.json host_permissions.\n` +
          `The browser silently blocks fetches to unlisted origins (this once broke every SSE connection).\n` +
          `Missing:\n  ${missing.join('\n  ')}\n` +
          `host_permissions has:\n  ${permitted.join('\n  ')}`
      );
    }
  });
});

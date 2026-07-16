#!/usr/bin/env node
/**
 * amo-fetch-signed-xpi.js — makes the AMO signing step idempotent.
 *
 * AMO version submissions are irreversible and non-idempotent: once a version
 * string is uploaded it is "used up" forever, and re-submitting it fails with
 * "Version X already exists". That turned a re-triggered release (a force-moved
 * tag, a manual re-run) into a hard failure that blocked the whole pipeline.
 *
 * This script answers one question for the release workflow:
 *   "Does version $VERSION already exist on AMO, and if so can we reuse its
 *    signed XPI instead of re-signing?"
 *
 *   200 → version exists → download its signed XPI → exit 0  (reuse path)
 *   404 → not on AMO      → exit 10                          (caller runs web-ext sign)
 *   other → exit 1                                          (real failure)
 *
 * It does NOT invoke web-ext. The workflow branches on the exit code:
 *   node scripts/amo-fetch-signed-xpi.js "$VERSION" || npx web-ext sign ...
 * (exit 10 from the first command triggers the `||` fallback.)
 *
 * Env: AMO_JWT_ISSUER, AMO_JWT_SECRET (same secrets the sign step uses).
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const AMO_BASE_URL = 'https://addons.mozilla.org/api/v5/';
export const ADDON_ID = 'saveit@airteam.com.au';
// Exit code signalling "version not on AMO; fall back to signing". Picked above
// the usual 0/1 so the workflow can distinguish "needs signing" from "broke".
export const EXIT_NEEDS_SIGNING = 10;

/**
 * Mint an AMO JWT (HS256) using only Node's crypto — matches web-ext's scheme
 * (jose SignJWT) without adding a dependency. See AGENTS.md: prefer platform
 * APIs over extra libraries.
 */
export function createAmoJwt({ issuer, secret, issuedAt = Date.now(), ttlSeconds = 300 }) {
  if (!issuer || !secret) {
    throw new Error('AMO_JWT_ISSUER and AMO_JWT_SECRET are required');
  }
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = { iss: issuer, iat: Math.floor(issuedAt / 1000), exp: Math.floor(issuedAt / 1000) + ttlSeconds };
  const b64url = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const signingInput = `${b64url(header)}.${b64url(payload)}`;
  const signature = crypto.createHmac('sha256', secret).update(signingInput).digest('base64url');
  return `${signingInput}.${signature}`;
}

/**
 * Query AMO for an existing version of the add-on.
 * @returns {Promise<{status:number, fileUrl?:string}>}
 */
export async function getAmoVersion({ addonId, version, issuer, secret, baseUrl = AMO_BASE_URL, fetchImpl = fetch }) {
  const token = createAmoJwt({ issuer, secret });
  const url = new URL(`addons/addon/${addonId}/versions/${version}/`, baseUrl);
  const response = await fetchImpl(url, {
    headers: { Authorization: `JWT ${token}`, Accept: 'application/json' }
  });
  if (response.status === 404) {
    return { status: 404 };
  }
  if (!response.ok) {
    // Surface the status so the caller can decide; body is logged by the caller.
    return { status: response.status };
  }
  const data = await response.json();
  // The signed file URL lives under .file.url for a public/approved version.
  // Unlisted versions that are still pending approval have no file.url yet —
  // treat that as "not reusable" so the caller signs fresh.
  const fileUrl = data?.file?.url || null;
  return { status: 200, fileUrl };
}

/**
 * Download a signed XPI to the artifacts dir.
 * @returns {Promise<string>} the written file path
 *
 * Uses arrayBuffer() rather than response.body.pipe() because Node's fetch
 * returns a Web ReadableStream (not a Node stream) — pipe() isn't portable
 * across Node versions. XPIs are small (~1-2MB), so buffering is fine.
 */
export async function downloadSignedXpi({ fileUrl, outPath, fetchImpl = fetch, writeFile = fs.promises.writeFile }) {
  const response = await fetchImpl(fileUrl);
  if (!response.ok) {
    throw new Error(`Failed to download signed XPI: HTTP ${response.status}`);
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(outPath, buffer);
  return outPath;
}

/**
 * Orchestrates the idempotent AMO fetch for a version.
 * Throws on hard errors; returns {reused, outPath} on success.
 */
export async function fetchSignedXpiForVersion({
  version,
  issuer,
  secret,
  artifactsDir,
  addonId = ADDON_ID,
  baseUrl = AMO_BASE_URL,
  fetchImpl = fetch,
  writeFile
}) {
  const result = await getAmoVersion({ addonId, version, issuer, secret, baseUrl, fetchImpl });

  if (result.status === 404) {
    return { needsSigning: true };
  }
  if (result.status !== 200) {
    throw new Error(`AMO version lookup failed with HTTP ${result.status}`);
  }
  if (!result.fileUrl) {
    // Version exists but has no downloadable signed file yet (pending review).
    // The caller cannot reuse it, so fall back to signing rather than fail.
    return { needsSigning: true };
  }

  const outPath = path.join(artifactsDir, `saveit-${version}.xpi`);
  try {
    await downloadSignedXpi({ fileUrl: result.fileUrl, outPath, fetchImpl, writeFile });
  } catch (error) {
    // The version lookup (200 + fileUrl) said the file exists, but the download
    // failed. This happens when a prior, cancelled run left a half-submitted
    // version on AMO whose signed file is not yet downloadable (HTTP 404), or
    // the URL is transiently unreachable. Rather than fail the whole release,
    // fall back to a fresh sign: AMO will either accept it (genuine first
    // upload) or report "version already exists", which the caller surfaces.
    console.error(`⚠️  Signed file for ${version} not reusable (${error.message}); falling back to sign.`);
    return { needsSigning: true };
  }
  return { needsSigning: false, outPath };
}

// --- CLI entry point -------------------------------------------------------
async function main() {
  const version = process.argv[2];
  const issuer = process.env.AMO_JWT_ISSUER;
  const secret = process.env.AMO_JWT_SECRET;
  const artifactsDir = path.join(process.cwd(), 'web-ext-artifacts');

  if (!version) {
    console.error('Usage: node scripts/amo-fetch-signed-xpi.js <version>');
    process.exit(2);
  }
  if (!issuer || !secret) {
    console.error('❌ AMO_JWT_ISSUER and AMO_JWT_SECRET are required');
    process.exit(1);
  }

  try {
    const result = await fetchSignedXpiForVersion({ version, issuer, secret, artifactsDir });
    if (result.needsSigning) {
      console.log(`ℹ️  Version ${version} not reusable on AMO — falling back to web-ext sign.`);
      process.exit(EXIT_NEEDS_SIGNING);
    }
    console.log(`✅ Reused signed XPI for ${version} from AMO → ${result.outPath}`);
    process.exit(0);
  } catch (error) {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  }
}

// Skip CLI when imported (tests).
const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (invokedDirectly) {
  main();
}

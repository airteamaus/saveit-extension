#!/usr/bin/env node
/**
 * Upload extension to Chrome Web Store
 *
 * Usage:
 *   node scripts/upload-chrome.js [options]
 *
 * Options:
 *   --publish    Auto-publish after upload (default: false)
 *   --target     Upload target: default|trustedTesters (default: default)
 *
 * Environment variables required:
 *   CHROME_EXTENSION_ID
 *   CHROME_CLIENT_ID
 *   CHROME_CLIENT_SECRET
 *   CHROME_REFRESH_TOKEN
 *
 * Example:
 *   # Upload only (requires manual publish)
 *   node scripts/upload-chrome.js
 *
 *   # Upload and auto-publish to trusted testers
 *   node scripts/upload-chrome.js --publish --target trustedTesters
 */

import webStore from 'chrome-webstore-upload';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);
const shouldPublish = args.includes('--publish');
const target = args.includes('--target')
  ? args[args.indexOf('--target') + 1]
  : 'default';

// Load environment variables
dotenv.config({ path: '.env.chrome' });

// Validate required environment variables
const required = [
  'CHROME_EXTENSION_ID',
  'CHROME_CLIENT_ID',
  'CHROME_CLIENT_SECRET',
  'CHROME_REFRESH_TOKEN'
];

const missing = required.filter(key => !process.env[key]);
if (missing.length > 0) {
  console.error('❌ Missing required environment variables:');
  missing.forEach(key => console.error(`   - ${key}`));
  console.error('\nSet them in .env.chrome or as environment variables.');
  console.error('See docs/CHROME-WEB-STORE-SETUP.md for setup instructions.');
  process.exit(1);
}

// Get version from manifest
const manifestPath = path.join(__dirname, '..', 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const version = manifest.version;

// Find the zip file
const zipPath = path.join(__dirname, '..', 'web-ext-artifacts', `saveit-chrome-${version}.zip`);

if (!fs.existsSync(zipPath)) {
  console.error(`❌ Chrome ZIP not found: ${zipPath}`);
  console.error('\nRun "npm run build:chrome" first to create the package.');
  process.exit(1);
}

console.log('🚀 Uploading to Chrome Web Store...');
console.log(`   Extension ID: ${process.env.CHROME_EXTENSION_ID}`);
console.log(`   Version: ${version}`);
console.log(`   Package: ${path.basename(zipPath)}`);
console.log(`   Publish: ${shouldPublish ? 'Yes' : 'No (upload only)'}`);
console.log(`   Target: ${target}`);
console.log('');

// Initialize Chrome Web Store client
const client = webStore({
  extensionId: process.env.CHROME_EXTENSION_ID,
  clientId: process.env.CHROME_CLIENT_ID,
  clientSecret: process.env.CHROME_CLIENT_SECRET,
  refreshToken: process.env.CHROME_REFRESH_TOKEN,
});

// Upload the extension
async function upload() {
  try {
    // Read the zip file
    const extensionSource = fs.createReadStream(zipPath);

    // Upload
    console.log('⬆️  Uploading package...');
    const uploadResponse = await client.uploadExisting(extensionSource);

    if (uploadResponse.uploadState === 'SUCCESS') {
      console.log('✅ Upload successful!');
      console.log(`   Upload state: ${uploadResponse.uploadState}`);

      if (uploadResponse.itemError) {
        console.warn('⚠️  Upload warnings:', uploadResponse.itemError);
      }
    } else {
      console.error('❌ Upload failed:', uploadResponse.uploadState);
      if (uploadResponse.itemError) {
        console.error('   Error details:', uploadResponse.itemError);
      }
      process.exit(1);
    }

    // Publish if requested
    if (shouldPublish) {
      console.log('');
      console.log('📤 Publishing extension...');

      const publishResponse = await client.publish(target);

      if (publishResponse.status && publishResponse.status.includes('OK')) {
        console.log('✅ Publish successful!');
        console.log(`   Status: ${publishResponse.status}`);
        console.log(`   Published to: ${target}`);

        if (target === 'trustedTesters') {
          console.log('');
          console.log('ℹ️  Extension published to trusted testers.');
          console.log('   It will be available immediately to your test users.');
        } else {
          console.log('');
          console.log('ℹ️  Extension submitted for review.');
          console.log('   Review typically takes 1-3 days.');
          console.log('   Check status: https://chrome.google.com/webstore/devconsole');
        }
      } else {
        console.error('❌ Publish failed:', publishResponse.statusDetail);
        process.exit(1);
      }
    } else {
      console.log('');
      console.log('ℹ️  Upload complete. Extension NOT published.');
      console.log('   To publish:');
      console.log('   1. Go to https://chrome.google.com/webstore/devconsole');
      console.log('   2. Click "Submit for review"');
      console.log('   OR run: node scripts/upload-chrome.js --publish');
    }

    console.log('');
    console.log('✅ Done!');

  } catch (error) {
    console.error('');
    console.error('❌ Error:', error.message);

    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Details:', error.response.data);
    }

    console.error('');
    console.error('Troubleshooting:');
    console.error('- Verify credentials are correct');
    console.error('- Check Chrome Web Store API is enabled');
    console.error('- Ensure OAuth consent screen is configured');
    console.error('- See docs/CHROME-WEB-STORE-SETUP.md for help');

    process.exit(1);
  }
}

// Run upload
upload();

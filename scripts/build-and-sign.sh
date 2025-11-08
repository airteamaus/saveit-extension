#!/bin/bash

set -e

echo "🔨 Building and signing SaveIt extension..."
echo ""

# Build the extension (create .zip)
cd extension
echo "📦 Creating extension package..."
npx web-ext build --overwrite-dest

# The signed .xpi will be in web-ext-artifacts/
echo ""
echo "✅ Extension built successfully!"
echo ""
echo "📍 Location: extension/web-ext-artifacts/"
echo ""
echo "To install:"
echo "1. Open Firefox"
echo "2. Go to about:addons"
echo "3. Click the gear icon → 'Install Add-on From File'"
echo "4. Select the .zip file from web-ext-artifacts/"
echo ""
echo "Note: Self-signed extensions need Firefox Developer Edition or Nightly"
echo "Or you can sign it with Mozilla: https://addons.mozilla.org/developers/"


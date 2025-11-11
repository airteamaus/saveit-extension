#!/bin/bash
# Clear Firefox extension cache to force reload of files
# Run this when Firefox is closed

set -e

echo "🔥 Clearing Firefox extension cache..."

# Check if Firefox is running
if pgrep -x "firefox" > /dev/null; then
    echo "❌ Firefox is still running. Please close Firefox completely (Cmd+Q) and try again."
    exit 1
fi

# Clear extension storage cache
rm -rf ~/Library/Application\ Support/Firefox/Profiles/*/storage/default/moz-extension* 2>/dev/null || true
echo "✓ Cleared extension storage cache"

# Clear startup cache
rm -rf ~/Library/Application\ Support/Firefox/Profiles/*/startupCache 2>/dev/null || true
echo "✓ Cleared startup cache"

# Clear regular cache
rm -rf ~/Library/Application\ Support/Firefox/Profiles/*/cache2 2>/dev/null || true
echo "✓ Cleared disk cache"

echo ""
echo "✅ Cache cleared successfully!"
echo ""
echo "Next steps:"
echo "1. Open Firefox"
echo "2. Go to about:debugging → This Firefox"
echo "3. Click 'Reload' on the SaveIt extension"
echo "4. Open a new tab - you should see v0.12.2 in the footer"

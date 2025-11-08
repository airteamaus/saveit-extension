#!/bin/bash

echo "🚀 Starting Firefox with SaveIt extension..."
echo ""

# Create dev profile directory if it doesn't exist
PROFILE_DIR="$PWD/firefox-dev-profile"
mkdir -p "$PROFILE_DIR"

cd extension
npx web-ext run \
  --keep-profile-changes \
  --firefox-profile="$PROFILE_DIR" \
  --start-url about:debugging


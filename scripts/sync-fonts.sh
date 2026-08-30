#!/bin/bash
# Copy latin-subset variable woff2 files from @fontsource-variable packages
# into src/fonts/. The files are committed so the unpacked-extension dev flow
# needs no build step; MV3 CSP forbids fetching fonts remotely.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p src/fonts
copy() { cp "node_modules/@fontsource-variable/$1/files/$2" "src/fonts/$2"; }
copy newsreader newsreader-latin-wght-normal.woff2
copy newsreader newsreader-latin-wght-italic.woff2
copy source-sans-3 source-sans-3-latin-wght-normal.woff2
copy source-sans-3 source-sans-3-latin-wght-italic.woff2
copy jetbrains-mono jetbrains-mono-latin-wght-normal.woff2
ls -l src/fonts/

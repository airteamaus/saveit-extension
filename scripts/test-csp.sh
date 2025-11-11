#!/bin/bash
# Test for CSP violations by checking HTML files for inline scripts

set -e

echo "Checking for CSP violations..."

# Check for inline scripts in HTML files
if grep -n '<script[^>]*>[^<]' src/*.html 2>/dev/null; then
    echo "❌ Found inline scripts in HTML files (CSP violation)"
    echo "   Move inline scripts to separate .js files"
    exit 1
fi

# Check for inline event handlers (onclick, onerror, etc)
if grep -En 'on(click|load|error|change|submit|keyup|keydown|focus|blur)=' src/*.html 2>/dev/null; then
    echo "❌ Found inline event handlers in HTML files (CSP violation)"
    echo "   Use addEventListener() instead"
    exit 1
fi

# Check for style attributes (inline styles)
if grep -n 'style=' src/*.html 2>/dev/null | grep -v 'display: none' | grep -v 'display:none'; then
    echo "⚠️  Warning: Found inline styles (consider moving to CSS)"
fi

echo "✓ No CSP violations detected"

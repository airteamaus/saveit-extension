#!/bin/bash
# Pre-deployment checklist script
# Automates all checks before releasing a new version

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

echo "🔍 SaveIt Pre-Deployment Checklist"
echo "===================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

CHECKS_PASSED=0
CHECKS_FAILED=0

check_pass() {
  echo -e "${GREEN}✓${NC} $1"
  ((CHECKS_PASSED++))
}

check_fail() {
  echo -e "${RED}✗${NC} $1"
  ((CHECKS_FAILED++))
}

check_warn() {
  echo -e "${YELLOW}⚠${NC} $1"
}

# 1. Check dependencies are installed
echo "1️⃣  Checking dependencies..."
if command -v node &> /dev/null && [ -d "node_modules" ]; then
  check_pass "Node.js and dependencies installed"
else
  check_fail "Node.js or node_modules missing. Run: npm install"
  exit 1
fi

# 2. Lint check
echo ""
echo "2️⃣  Running linter..."
if npm run lint > /dev/null 2>&1; then
  check_pass "Linting passed"
else
  check_fail "Linting failed. Run: npm run lint:fix"
  npm run lint
  exit 1
fi

# 3. Run unit tests
echo ""
echo "3️⃣  Running unit tests..."
if npm test > /dev/null 2>&1; then
  check_pass "Unit tests passed"
else
  check_fail "Unit tests failed"
  npm test
  exit 1
fi

# 4. Run test coverage check
echo ""
echo "4️⃣  Checking test coverage..."
if npm run test:coverage > /dev/null 2>&1; then
  check_pass "Test coverage meets thresholds (70%+)"
else
  check_warn "Test coverage below threshold"
  npm run test:coverage
fi

# 5. Validate extension manifest
echo ""
echo "5️⃣  Validating extension manifest..."
if npx web-ext lint > /dev/null 2>&1; then
  check_pass "Manifest validation passed"
else
  check_fail "Manifest validation failed"
  npx web-ext lint
  exit 1
fi

# 6. Check version consistency
echo ""
echo "6️⃣  Checking version consistency..."
MANIFEST_VERSION=$(jq -r '.version' manifest.json)
PACKAGE_VERSION=$(jq -r '.version' package.json)
LATEST_TAG=$(git describe --tags --abbrev=0 2>/dev/null | sed 's/^v//' || echo "none")

if [ "$MANIFEST_VERSION" = "$PACKAGE_VERSION" ]; then
  check_pass "manifest.json and package.json versions match ($MANIFEST_VERSION)"
else
  check_fail "Version mismatch: manifest=$MANIFEST_VERSION, package=$PACKAGE_VERSION"
  exit 1
fi

if [ "$LATEST_TAG" != "none" ] && [ "$MANIFEST_VERSION" != "$LATEST_TAG" ]; then
  check_warn "Current version ($MANIFEST_VERSION) differs from latest tag ($LATEST_TAG)"
  echo "   This is OK if you're about to release a new version"
fi

# 7. Check for uncommitted changes
echo ""
echo "7️⃣  Checking git status..."
if [ -z "$(git status --porcelain)" ]; then
  check_pass "No uncommitted changes"
else
  check_warn "Uncommitted changes detected"
  git status --short
  read -p "Continue anyway? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

# 8. Build test
echo ""
echo "8️⃣  Testing build process..."
if npm run build > /dev/null 2>&1; then
  check_pass "Build completed successfully"
  BUILD_FILE=$(ls web-ext-artifacts/*.zip 2>/dev/null | head -n 1)
  if [ -n "$BUILD_FILE" ]; then
    BUILD_SIZE=$(du -h "$BUILD_FILE" | cut -f1)
    echo "   Build artifact: $BUILD_FILE ($BUILD_SIZE)"
  fi
else
  check_fail "Build failed"
  npm run build
  exit 1
fi

# 9. Manual testing prompts
echo ""
echo "9️⃣  Manual testing checklist..."
echo ""
echo "Please manually verify the following:"
echo ""
echo "  □ Standalone mode works (open src/database.html in browser)"
read -p "    Does standalone mode work correctly? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  check_fail "Standalone mode verification failed"
  exit 1
else
  check_pass "Standalone mode verified"
fi

echo ""
echo "  □ Extension mode works (run 'just run' and test)"
read -p "    Does extension mode work correctly? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  check_fail "Extension mode verification failed"
  exit 1
else
  check_pass "Extension mode verified"
fi

echo ""
echo "  □ Core features tested:"
echo "    - Save page via extension icon"
echo "    - View saved pages in dashboard"
echo "    - Search/filter pages"
echo "    - Delete pages"
echo "    - Click tags for discovery"
read -p "    Do all core features work? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  check_fail "Core features verification failed"
  exit 1
else
  check_pass "Core features verified"
fi

# 10. E2E tests (optional, can be slow)
echo ""
echo "🔟  E2E tests (optional)..."
read -p "Run E2E tests? This may take a few minutes (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  if npm run test:e2e > /dev/null 2>&1; then
    check_pass "E2E tests passed"
  else
    check_warn "E2E tests failed or incomplete"
    npm run test:e2e
  fi
else
  check_warn "E2E tests skipped"
fi

# Summary
echo ""
echo "===================================="
echo "Pre-deployment Check Summary"
echo "===================================="
echo -e "${GREEN}Passed: $CHECKS_PASSED${NC}"
if [ $CHECKS_FAILED -gt 0 ]; then
  echo -e "${RED}Failed: $CHECKS_FAILED${NC}"
  echo ""
  echo "❌ Pre-deployment checks FAILED. Please fix issues before deploying."
  exit 1
fi

echo ""
echo "✅ All checks passed! Safe to deploy."
echo ""
echo "Next steps:"
echo "  1. Bump version: just bump [patch|minor|major]"
echo "  2. Push with tags: git push origin main --tags"
echo "  3. GitHub Actions will build and release automatically"
echo ""

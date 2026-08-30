import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

// ---------------------------------------------------------------------------
// Org feed (idle desk index) coverage in standalone mode
// ---------------------------------------------------------------------------
// Standalone mode serves the feed from api-feed-standalone.js mocks: a public
// gmail.com scope (so the kicker + one-time disclosure render), deterministic
// votes, and the first mock row flagged mine:true (disabled chevron). That
// makes the whole surface e2e-testable under file:// with no backend.
//
// No localStorage reset is needed between tests: Playwright gives every test
// a fresh browser context, so the disclosure state starts clean each time and
// the reload inside the disclosure test exercises real persistence (a
// beforeEach addInitScript would re-run on that reload and wipe the dismissal
// it is supposed to verify).
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const newtabPath = path.resolve(__dirname, '../../src/newtab.html');

test.describe('Org Feed Voting', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`file://${newtabPath}`);
    await page.waitForSelector('#saved-pages-results');
  });

  test('idle desk renders the org feed with a public scope kicker', async ({ page }) => {
    await page.waitForSelector('.feed-row');
    await expect(page.locator('#feed-scope-kicker-slot')).toContainText('Everyone using Gmail — public');
  });

  test('public-feed disclosure shows once and stays dismissed', async ({ page }) => {
    await page.waitForSelector('.feed-disclosure');
    await page.click('.feed-disclosure-dismiss');
    await expect(page.locator('#feed-disclosure-slot')).toBeEmpty();
    // Dismissal persists in localStorage, so the reload must not re-show it.
    await page.reload();
    await page.waitForSelector('.feed-row');
    await expect(page.locator('#feed-disclosure-slot')).toBeEmpty();
  });

  test('voting toggles the count and chevron state on an org-mate row', async ({ page }) => {
    await page.waitForSelector('.feed-row');
    // Mock row 0 is "mine" (disabled), so the first enabled chevron is an
    // org-mate's row with deterministic mock votes.
    const votable = page.locator('.feed-vote:not([disabled])').first();
    const before = await votable.locator('.feed-vote-count').innerText();
    await votable.click();
    await expect(votable).toHaveAttribute('aria-pressed', 'true');
    const after = await votable.locator('.feed-vote-count').innerText();
    expect(Number(after)).toBe(Number(before) + 1);
    await votable.click();
    await expect(votable).toHaveAttribute('aria-pressed', 'false');
    const restored = await votable.locator('.feed-vote-count').innerText();
    expect(Number(restored)).toBe(Number(before));
  });

  test('own row shows points but a disabled chevron', async ({ page }) => {
    await page.waitForSelector('.feed-row');
    // Mock row 0 is "mine": the count renders but self-votes are refused.
    const ownRow = page.locator('.feed-row').first();
    await expect(ownRow.locator('.feed-vote-count')).toBeVisible();
    await expect(ownRow.locator('.feed-vote')).toBeDisabled();
  });

  test('typing a search query hides the feed section until the desk is idle again', async ({ page }) => {
    await page.waitForSelector('.feed-row');
    await page.fill('#saved-pages-search-input', 'something');
    await page.waitForTimeout(400); // 250ms search debounce
    await expect(page.locator('[data-section="feed"]')).toHaveCount(0);
  });

  // Deploy-order bridge: an old backend without /feed must leave the desk on
  // the personal list (the seam stands in for the 404).
  test('feed unavailable falls back to the personal list on the idle desk', async ({ page }) => {
    await page.addInitScript(() => {
      globalThis.MOCK_FEED_UNAVAILABLE = true;
    });
    await page.goto(`file://${newtabPath}`);
    await page.waitForSelector('#saved-pages-results .index-row');
    await expect(page.locator('[data-section="feed"]')).toHaveCount(0);
    await expect(page.locator('.feed-row')).toHaveCount(0);
    await expect(page.locator('#feed-scope-kicker-slot')).toBeEmpty();
  });
});

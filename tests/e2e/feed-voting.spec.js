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
    await expect(page.locator('#feed-scope-kicker-slot')).toContainText(
      'Everyone using Gmail — public'
    );
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

  // Hover reveal regression: the date only yields its slot when the row has
  // actions to show. Own feed rows have the full management set; org-mates'
  // rows have no action slot at all, so their date must stay put.
  test('own feed row reveals the full action set on hover; org-mate rows keep their date', async ({
    page
  }) => {
    await page.waitForSelector('.feed-row');
    const ownRow = page.locator('.feed-row').first();
    await ownRow.hover();
    for (const action of [
      'feed-edit',
      'feed-pin',
      'feed-privacy',
      'feed-projects',
      'feed-delete'
    ]) {
      await expect(ownRow.locator(`[data-action="${action}"]`)).toBeVisible();
    }
    await expect
      .poll(async () =>
        ownRow.locator('.index-row-date').evaluate((el) => getComputedStyle(el).opacity)
      )
      .toBe('0');

    const mateRow = page.locator('.feed-row').nth(1);
    await mateRow.hover();
    await expect(mateRow.locator('.index-row-actions')).toHaveCount(0);
    await expect
      .poll(async () =>
        mateRow.locator('.index-row-date').evaluate((el) => getComputedStyle(el).opacity)
      )
      .toBe('1');
  });

  test('pin and edit from my feed row work in place', async ({ page }) => {
    await page.waitForSelector('.feed-row');
    const ownRow = page.locator('.feed-row').first();
    const ownId = await ownRow.getAttribute('data-page-id');

    // Edit first (mock row 0 is the only own row): inline form, retitled.
    await ownRow.hover();
    await ownRow.locator('[data-action="feed-edit"]').click();
    const input = ownRow.locator('.feed-edit-form input[name="title"]');
    await expect(input).toBeVisible();
    await input.fill('Renamed from the desk');
    await ownRow.locator('.saved-pages-drawer-edit-save').click();
    await expect(ownRow.locator('.index-row-title')).toContainText('Renamed from the desk');

    // Then pin: the row hands off to the launch strip above and leaves the feed.
    await ownRow.hover();
    await ownRow.locator('[data-action="feed-pin"]').click();
    await expect(page.locator(`.feed-row[data-page-id="${ownId}"]`)).toHaveCount(0);
  });

  test('the privacy eye on my feed row makes the save private, and back', async ({ page }) => {
    await page.waitForSelector('.feed-row');
    const ownRow = page.locator('.feed-row').first();
    await expect(ownRow.locator('.index-row-scope-tag')).toContainText('Shared');

    // Hover first: the actions slot is pointer-gated until the row is
    // hovered (the date owns the slot otherwise).
    await ownRow.hover();
    await ownRow.locator('[data-action="feed-privacy"]').click();
    await expect(ownRow.locator('.index-row-scope-tag')).toContainText('Only you');
    await expect(ownRow.locator('.index-row-privacy-btn')).toHaveAttribute('aria-pressed', 'true');

    // The row re-rendered on toggle — re-hover before the reverse click.
    await ownRow.hover();
    await ownRow.locator('[data-action="feed-privacy"]').click();
    await expect(ownRow.locator('.index-row-scope-tag')).toContainText('Shared');
    await expect(ownRow.locator('.index-row-privacy-btn')).toHaveAttribute('aria-pressed', 'false');
  });

  // Drawer regression lock: the personal list's full action set still reveals.
  test('personal-list rows still reveal their action buttons on hover', async ({ page }) => {
    await page.addInitScript(() => {
      globalThis.MOCK_FEED_UNAVAILABLE = true;
    });
    await page.goto(`file://${newtabPath}`);
    const row = page.locator('#saved-pages-results .index-row.has-actions').first();
    await row.waitFor();
    await row.hover();
    await expect
      .poll(async () =>
        row.locator('.index-row-actions').evaluate((el) => getComputedStyle(el).opacity)
      )
      .toBe('1');
    await expect(row.locator('[data-action="pin"]')).toBeVisible();
  });

  // Stacking regression (Rich's Brave session): the date and actions share a
  // grid cell, and the hover-faded date is STILL hit-testable. If paint order
  // ever puts the date above the buttons, every button except the leftmost
  // (edit) falls through to the date and navigates the row. Assert hit-testing
  // at every button's center resolves into that button, on both surfaces.
  async function assertButtonsWinHitTesting(page, rowSelector, actions) {
    const row = page.locator(rowSelector).first();
    await row.waitFor();
    await row.hover();
    for (const action of actions) {
      const hitInside = await row
        .locator(`[data-action="${action}"]`)
        .evaluate((el, act) => {
          const box = el.getBoundingClientRect();
          const at = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
          return Boolean(at?.closest(`[data-action="${act}"]`));
        }, action);
      expect(hitInside, `${action} must be hit-test-topmost at its center`).toBe(true);
    }
  }

  test('every personal-list action button wins hit-testing over the shared date slot', async ({
    page
  }) => {
    await page.addInitScript(() => {
      globalThis.MOCK_FEED_UNAVAILABLE = true;
    });
    await page.goto(`file://${newtabPath}`);
    await assertButtonsWinHitTesting(page, '#saved-pages-results .index-row.has-actions', [
      'edit',
      'pin',
      'toggle-privacy',
      'projects',
      'delete'
    ]);
  });

  test('every own-feed-row action button wins hit-testing over the shared date slot', async ({
    page
  }) => {
    await page.goto(`file://${newtabPath}`);
    await assertButtonsWinHitTesting(page, '.feed-row', [
      'feed-edit',
      'feed-pin',
      'feed-privacy',
      'feed-projects',
      'feed-delete'
    ]);
  });

  test('typing a search query hides the feed section until the desk is idle again', async ({
    page
  }) => {
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

import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const newtabPath = path.resolve(__dirname, '../../src/newtab.html');

async function openStandaloneNewtab(page) {
  await page.goto(`file://${newtabPath}`);
  await page.waitForSelector('#project-sidebar');
  await page.waitForSelector('#saved-pages-results');
}

async function showAllPages(page) {
  await page.locator('.project-nav-item[data-project-id=""]').click();
  await expect(page.locator('.project-nav-item[data-project-id=""]')).toHaveClass(/is-active/);
  await page.waitForSelector('.saved-pages-drawer-card');
}

test.describe('Standalone Mode', () => {
  test.beforeEach(async ({ page }) => {
    await openStandaloneNewtab(page);
  });

  test('should render the full-page saved pages shell with all pages selected by default', async ({ page }) => {
    await expect(page.locator('#saved-pages-page')).toBeVisible();
    await expect(page.locator('#saved-pages-search-input')).toBeVisible();
    await expect(page.locator('#project-sidebar')).toContainText('Pinned');
    await expect(page.locator('#project-sidebar')).toContainText('All pages');
    await expect(page.locator('.project-nav-item[data-project-id=""]')).toHaveClass(/is-active/);
    // All pages is the default scope, so the mock pages render as cards.
    await expect(page.locator('.saved-pages-drawer-card').first()).toBeVisible();

    // The "Collections" heading is gone; every nav row carries a # channel prefix.
    await expect(page.locator('.project-sidebar-title')).toHaveCount(0);
    const rowCount = await page.locator('.project-nav-row').count();
    const hashCount = await page.locator('.project-nav-hash').count();
    expect(hashCount).toBe(rowCount);
    // Section labels carry colored dots (personal blue, shared green).
    const dotCount = await page.locator('.project-nav-section-dot').count();
    expect(dotCount).toBeGreaterThanOrEqual(1);
  });

  test('should search via the semantic pane, hiding local cards', async ({ page }) => {
    await showAllPages(page);

    await page.fill('#saved-pages-search-input', 'JavaScript');

    // Searching hides local saved-page cards and shows the semantic results
    // pane (the dog loading state is covered by unit tests; here we assert the
    // resolved semantic view).
    const semanticSection = page.locator('[data-section="semantic"]');
    await expect(semanticSection).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-section="pages"]')).toHaveCount(0, { timeout: 5000 });
    await expect(semanticSection.locator('.saved-pages-drawer-card').first()).toContainText('JavaScript');
  });

  test('should render an inline semantic results section when searching', async ({ page }) => {
    await showAllPages(page);

    // Before searching, the semantic section is not present.
    expect(await page.locator('[data-section="semantic"]').count()).toBe(0);

    await page.fill('#saved-pages-search-input', 'JavaScript');

    // The inline semantic section appears below the saved-page matches with
    // its own heading, regardless of whether the mock returned any results.
    const semanticSection = page.locator('[data-section="semantic"]');
    await expect(semanticSection).toBeVisible({ timeout: 5000 });
    await expect(semanticSection).toContainText('From across everything');

    // Clearing the search removes the semantic section again.
    await page.fill('#saved-pages-search-input', '');
    await expect(page.locator('[data-section="semantic"]')).toHaveCount(0, { timeout: 5000 });
  });

  test('a tag search shows the semantic pane and hides the local saved-page cards', async ({ page }) => {
    await showAllPages(page);

    // Before searching, local saved-page cards are visible.
    await expect(page.locator('.saved-pages-drawer-card').first()).toBeVisible();

    // Clicking a tag runs a semantic search.
    await page.locator('.tag-search-link').first().click();

    // The semantic section owns the full pane with its heading; the local
    // saved-page cards are hidden (local results are a subset of the semantic
    // matches, so they're not shown separately).
    const semanticSection = page.locator('[data-section="semantic"]');
    await expect(semanticSection).toBeVisible({ timeout: 5000 });
    await expect(semanticSection).toContainText('From across everything');

    // The local pages section is gone entirely.
    await expect(page.locator('[data-section="pages"]')).toHaveCount(0, { timeout: 5000 });
  });

  test('should switch themes', async ({ page }) => {
    await page.evaluate(() => {
      const userProfile = document.getElementById('hero-user-menu');
      const userDropdown = document.getElementById('hero-user-dropdown');

      if (userProfile) userProfile.classList.remove('hidden');
      if (userDropdown) userDropdown.classList.remove('hidden');
    });

    const lightButton = page.locator('button[data-theme="light"]');
    const darkButton = page.locator('button[data-theme="dark"]');
    const autoButton = page.locator('button[data-theme="auto"]');

    await darkButton.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(darkButton).toHaveClass(/active/);

    await lightButton.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(lightButton).toHaveClass(/active/);

    await autoButton.click();
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);
    await expect(autoButton).toHaveClass(/active/);
  });

  test('should create and assign a project from the page editor', async ({ page }) => {
    await showAllPages(page);

    const firstCard = page.locator('.saved-pages-drawer-card').first();
    await firstCard.locator('.btn-projects').click();
    await expect(page.locator('#project-editor-dialog')).not.toHaveClass(/hidden/);

    await page.fill('#project-editor-search-input', 'Playwright project');
    await page.getByRole('button', { name: 'Create "Playwright project"' }).click();

    await expect(page.locator('#project-sidebar')).toContainText('Playwright project');
    await expect(firstCard.locator('.saved-pages-drawer-card-projects')).toContainText('Playwright project');
  });

  test('should scope results when selecting a project', async ({ page }) => {
    await showAllPages(page);

    const projectButton = page.locator('.project-nav-item[data-project-id="project-saveit-product"]');
    await projectButton.click();

    await expect(projectButton).toHaveClass(/is-active/);
    await expect(page.locator('.saved-pages-drawer-card').first()).toContainText('SaveIt product');
  });

  test('should edit a page title and description inline', async ({ page }) => {
    await showAllPages(page);

    // Cards are editable from the unfiltered browse view (search hides them
    // behind the semantic pane).
    const card = page.locator('.saved-pages-drawer-card').first();
    const originalTitle = await card.locator('.saved-pages-drawer-card-title').textContent();
    await card.locator('.saved-pages-drawer-edit-btn').click();

    await card.locator('input[name="title"]').fill('Edited Himalayan Journey');
    await card.locator('textarea[name="description"]').fill('Updated description from Playwright.');
    await card.locator('.saved-pages-drawer-edit-save').click();

    // The edited card is still in the unfiltered list with its new values.
    const editedCard = page
      .locator('.saved-pages-drawer-card')
      .filter({ hasText: 'Edited Himalayan Journey' })
      .first();
    await expect(editedCard).toBeVisible();
    await expect(editedCard.locator('.saved-pages-drawer-card-title')).toContainText('Edited Himalayan Journey');
    await expect(editedCard.locator('.saved-pages-drawer-card-summary')).toContainText('Updated description from Playwright.');

    void originalTitle;
  });

  test('tags on cards keep roughly one character of horizontal space between them', async ({ page }) => {
    await showAllPages(page);

    // Find a card that actually renders multiple tags (item 5 in mock data
    // has 2 topic tags + 3 manual tags), then read the flex gap from CSS.
    const card = page
      .locator('.saved-pages-drawer-card')
      .filter({ hasText: 'Large Language Models' })
      .first();
    await expect(card).toBeVisible();

    const gap = await card.locator('.saved-pages-drawer-card-tags').evaluate(el =>
      parseFloat(getComputedStyle(el).gap || getComputedStyle(el).columnGap || '0')
    );
    // Bumped from 4px to 6px so there is ~1ch of breathing room.
    expect(gap).toBeGreaterThanOrEqual(6);
  });

  test('hovering a card action button does not change its size or offset', async ({ page }) => {
    await showAllPages(page);
    const card = page.locator('.saved-pages-drawer-card').first();
    const pinBtn = card.locator('.saved-pages-drawer-pin-btn');

    const before = await pinBtn.boundingBox();
    await pinBtn.hover();
    const after = await pinBtn.boundingBox();

    // The button must not translate or resize on hover. Before the fix the
    // child button had translateY(-1px); allow only sub-pixel rounding noise.
    const tolerance = 0.5;
    expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(after.width - before.width)).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(tolerance);
  });

  test('collection action icons are visible against the row when hovered', async ({ page }) => {
    await openStandaloneNewtab(page);
    // A collection row that carries the per-row actions (rename/share/archive).
    const row = page.locator('.project-nav-row.has-actions').first();
    await expect(row).toBeVisible();

    // CSS hides the actions until hover on fine pointers; hovering the row
    // reveals them (they fade in via opacity). The icon stroke color that
    // makes them readable here is the button's REST color.
    await row.hover();
    const action = row.locator('.project-nav-action').first();
    await expect(action).toBeVisible();

    const alpha = (css) => {
      // Modern syntax (Firefox returns this for color-mix): color(srgb r g b / a)
      const modern = css.match(/color\(srgb\s+[\d.\s-]+\/\s*([\d.]+)\)/i);
      if (modern) return parseFloat(modern[1]);
      // Legacy rgba()/rgb() syntax.
      const m = css.match(/rgba?\(([^)]+)\)/);
      if (!m) return 0;
      const parts = m[1].split(',').map(Number);
      return parts.length === 4 ? parts[3] : 1;
    };

    const restColor = await action.evaluate(el => getComputedStyle(el).color);
    // Fix: rest color was --color-text-light (faint) and disappeared over the
    // hovered row tint; it is now full-strength --color-text (opaque, dark).
    expect(alpha(restColor)).toBeGreaterThan(0);

    // Hovering the action itself gives it a real backing tint (the old
    // hover background fell back to the transparent chip-bg).
    await action.hover();
    const hoverBg = await action.evaluate(el => getComputedStyle(el).backgroundColor);
    expect(alpha(hoverBg)).toBeGreaterThan(0);
  });

  test('collection icons render as currentColor masks and theming follows the button', async ({ page }) => {
    await openStandaloneNewtab(page);
    const row = page.locator('.project-nav-row.has-actions').first();
    await row.hover();
    const renameIcon = row.locator('.project-action-icon--rename');
    const archiveIcon = row.locator('.project-action-icon--archive');
    await expect(renameIcon).toBeVisible();

    // Icons are masked PNGs painted with currentColor: the fill comes from the
    // button's color, so the icon's background-color must be opaque (otherwise
    // the mask paints nothing). This is what keeps them visible without baking
    // a color into the PNG.
    const iconBg = await renameIcon.evaluate(el => getComputedStyle(el).backgroundColor);
    expect(iconBg).toMatch(/rgba?\(/);
    expect(iconBg).not.toContain('0)'); // not transparent

    // currentColor proof #1: in dark mode the icon paints light (the text
    // color flips). A black-on-transparent PNG without masking would stay dark
    // and be invisible here. Compare sums rather than an absolute threshold so
    // the assertion is about the theme flip, not an exact palette value.
    const lightSum = await renameIcon.evaluate(el => {
      const [, r, g, b] = getComputedStyle(el).color.match(/rgba?\(([^,]+),\s*([^,]+),\s*([^,)]+)/).map(Number);
      return r + g + b;
    });
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await row.hover();
    const darkSum = await renameIcon.evaluate(el => {
      const [, r, g, b] = getComputedStyle(el).color.match(/rgba?\(([^,]+),\s*([^,]+),\s*([^,)]+)/).map(Number);
      return r + g + b;
    });
    expect(darkSum).toBeGreaterThan(lightSum);

    // currentColor proof #2: the archive icon goes red on hover via
    // .project-action-archive:hover { color: var(--color-danger) }, and that
    // must flow through the mask into the icon's background-color.
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    await archiveIcon.hover();
    // Give the :hover state and currentColor recomputation a tick to settle
    // before reading the masked icon's paint color.
    await page.waitForTimeout(150);
    const archiveRed = await archiveIcon.evaluate(el => {
      const css = getComputedStyle(el).backgroundColor;
      const rgb = css.match(/rgba?\(([^,]+),\s*([^,]+),\s*([^,)]+)/);
      return rgb ? Number(rgb[1]) : 0;
    });
    expect(archiveRed).toBeGreaterThan(150); // red channel dominant (#dc2626 = 220)
  });
});

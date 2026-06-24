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
    await expect(page.locator('#project-sidebar')).toContainText('Collections');
    await expect(page.locator('#project-sidebar')).toContainText('Pinned');
    await expect(page.locator('#project-sidebar')).toContainText('All pages');
    await expect(page.locator('.project-nav-item[data-project-id=""]')).toHaveClass(/is-active/);
    // All pages is the default scope, so the mock pages render as cards.
    await expect(page.locator('.saved-pages-drawer-card').first()).toBeVisible();
  });

  test('should filter all pages results with search', async ({ page }) => {
    await showAllPages(page);

    await page.fill('#saved-pages-search-input', 'JavaScript');
    await page.waitForTimeout(400);

    const cards = page.locator('.saved-pages-drawer-card');
    expect(await cards.count()).toBeGreaterThan(0);
    await expect(cards.first()).toContainText('JavaScript');
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

    await page.fill('#saved-pages-search-input', 'Epic Motorcycle Journey');
    await page.waitForTimeout(400);

    const card = page.locator('.saved-pages-drawer-card').first();
    await card.locator('.saved-pages-drawer-edit-btn').click();

    await card.locator('input[name="title"]').fill('Edited Himalayan Journey');
    await card.locator('textarea[name="description"]').fill('Updated description from Playwright.');
    await card.locator('.saved-pages-drawer-edit-save').click();

    await page.fill('#saved-pages-search-input', 'Edited Himalayan Journey');
    await page.waitForTimeout(400);

    const editedCard = page.locator('.saved-pages-drawer-card').first();
    await expect(editedCard.locator('.saved-pages-drawer-card-title')).toContainText('Edited Himalayan Journey');
    await expect(editedCard.locator('.saved-pages-drawer-card-summary')).toContainText('Updated description from Playwright.');
  });
});

import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const newtabPath = path.resolve(__dirname, '../../src/newtab.html');

async function openDrawer(page) {
  await page.click('#dashboard-toggle-btn');
  await expect(page.locator('#dashboard-drawer')).not.toHaveClass(/hidden/);
  await page.waitForSelector('.dashboard-drawer-card');
}

test.describe('Standalone Mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`file://${newtabPath}`);
    await page.waitForSelector('#dashboard-toggle-btn');
  });

  test('should display the standalone new-tab shell', async ({ page }) => {
    await expect(page.locator('.logo-hero')).toContainText('SaveIt');
    await expect(page.locator('#search-input')).toBeVisible();
    await expect(page.locator('#hero-sign-in-btn')).toBeVisible();
  });

  test('should open the drawer with projects and saved pages', async ({ page }) => {
    await openDrawer(page);

    await expect(page.locator('#project-sidebar')).toContainText('Collections');
    await expect(page.locator('#project-sidebar')).toContainText('SaveIt product');
    await expect(page.locator('.dashboard-drawer-card').first()).toBeVisible();
  });

  test('should filter drawer results with search', async ({ page }) => {
    await openDrawer(page);

    await page.fill('#dashboard-drawer-search-input', 'JavaScript');
    await page.waitForTimeout(400);

    const filteredCount = await page.locator('.dashboard-drawer-card').count();
    expect(filteredCount).toBeGreaterThan(0);
    const cardText = await page.locator('.dashboard-drawer-card').first().textContent();
    expect(cardText.toLowerCase()).toContain('javascript');
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

  test('should create and assign a project from the drawer editor', async ({ page }) => {
    await openDrawer(page);

    await page.locator('.btn-projects').first().click();
    await expect(page.locator('#project-editor-dialog')).not.toHaveClass(/hidden/);

    await page.fill('#project-editor-search-input', 'Playwright project');
    await page.getByRole('button', { name: 'Create "Playwright project"' }).click();

    await expect(page.locator('#project-sidebar')).toContainText('Playwright project');
    await expect(page.locator('.dashboard-drawer-card').first()).toContainText('Playwright project');
  });

  test('should scope results when selecting a project', async ({ page }) => {
    await openDrawer(page);

    const projectButton = page.locator('.project-nav-item[data-project-id="project-saveit-product"]');
    await projectButton.click();

    await expect(projectButton).toHaveClass(/is-active/);
    await expect(page.locator('.dashboard-drawer-card').first()).toContainText('SaveIt product');
  });
});

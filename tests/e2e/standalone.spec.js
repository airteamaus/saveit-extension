import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const newtabPath = path.resolve(__dirname, '../../src/newtab.html');

test.describe('Standalone Mode', () => {
  test.beforeEach(async ({ page }) => {
    // Load standalone dashboard
    await page.goto(`file://${newtabPath}`);
    await page.waitForLoadState('networkidle');
  });

  test('should display mock data', async ({ page }) => {
    // Wait for cards to render
    await page.waitForSelector('.saved-page-card', { timeout: 5000 });

    // Check that cards are rendered
    const cards = await page.locator('.saved-page-card').count();
    expect(cards).toBeGreaterThan(0);

    // Check stats
    const stats = await page.locator('#stats').textContent();
    expect(stats).toContain('pages saved');
  });

  test('should show mode indicator as Development Mode', async ({ page }) => {
    const modeLabel = await page.locator('#mode-label').textContent();
    expect(modeLabel).toContain('Development Mode');
    expect(modeLabel).toContain('mock data');
  });

  test('should allow searching pages', async ({ page }) => {
    // Wait for initial render
    await page.waitForSelector('.saved-page-card');
    const initialCount = await page.locator('.saved-page-card').count();

    // Search for specific term
    await page.fill('#search', 'JavaScript');
    await page.waitForTimeout(500); // Wait for debounce

    // Check filtered results
    const filteredCount = await page.locator('.saved-page-card').count();
    expect(filteredCount).toBeLessThanOrEqual(initialCount);
    expect(filteredCount).toBeGreaterThan(0);

    // Verify search term appears in results
    const firstCard = await page.locator('.saved-page-card').first();
    const cardText = await firstCard.textContent();
    expect(cardText.toLowerCase()).toContain('javascript');
  });

  test('should clear search', async ({ page }) => {
    await page.waitForSelector('.saved-page-card');

    // Enter search
    await page.fill('#search', 'Python');
    await page.waitForTimeout(500);

    // Clear search
    await page.click('#clear-search');
    await page.waitForTimeout(300);

    // Verify search input is empty
    const searchValue = await page.inputValue('#search');
    expect(searchValue).toBe('');

    // Verify clear button is hidden
    const clearButton = page.locator('#clear-search');
    await expect(clearButton).toHaveCSS('display', 'none');
  });

  test('should show empty state for no results', async ({ page }) => {
    await page.waitForSelector('.saved-page-card');

    // Search for non-existent term
    await page.fill('#search', 'xyznonexistent12345');
    await page.waitForTimeout(500);

    // Check for empty state
    const emptyState = page.locator('.empty-state');
    await expect(emptyState).toBeVisible();
    await expect(emptyState).toContainText('No matching pages');
  });

  test('should open page card in new tab', async ({ page, context }) => {
    await page.waitForSelector('.saved-page-card');

    // Set up listener for new tab
    const pagePromise = context.waitForEvent('page');

    // Click on first card
    await page.locator('.saved-page-card').first().click();

    // Wait for new page
    const newPage = await pagePromise;
    await newPage.waitForLoadState();

    // Verify URL was opened
    expect(newPage.url()).toBeTruthy();
    expect(newPage.url()).not.toBe('about:blank');

    await newPage.close();
  });

  test('should switch themes', async ({ page }) => {
    // Get theme buttons
    const lightButton = page.locator('[data-theme="light"]');
    const darkButton = page.locator('[data-theme="dark"]');
    const autoButton = page.locator('[data-theme="auto"]');

    // Switch to dark
    await darkButton.click();
    const darkTheme = await page.locator('html').getAttribute('data-theme');
    expect(darkTheme).toBe('dark');
    await expect(darkButton).toHaveClass(/active/);

    // Switch to light
    await lightButton.click();
    const lightTheme = await page.locator('html').getAttribute('data-theme');
    expect(lightTheme).toBe('light');
    await expect(lightButton).toHaveClass(/active/);

    // Switch to auto (removes attribute)
    await autoButton.click();
    const autoTheme = await page.locator('html').getAttribute('data-theme');
    expect(autoTheme).toBeFalsy();
    await expect(autoButton).toHaveClass(/active/);
  });

  test('should enter discovery mode when clicking tag', async ({ page }) => {
    await page.waitForSelector('.saved-page-card');

    // Click on an AI tag
    const tag = page.locator('.ai-tag').first();
    await tag.click();

    // Wait for discovery view
    await page.waitForSelector('.discovery-header');

    // Check discovery header is shown
    const header = page.locator('.discovery-header');
    await expect(header).toBeVisible();
    await expect(header).toContainText('Discovery:');

    // Check back button exists
    const backButton = page.locator('#back-to-main');
    await expect(backButton).toBeVisible();
  });

  test('should return from discovery mode', async ({ page }) => {
    await page.waitForSelector('.saved-page-card');

    // Enter discovery mode
    await page.locator('.ai-tag').first().click();
    await page.waitForSelector('.discovery-header');

    // Click back button
    await page.click('#back-to-main');
    await page.waitForTimeout(300);

    // Verify we're back to main view (no discovery header)
    const discoveryHeader = page.locator('.discovery-header');
    await expect(discoveryHeader).not.toBeVisible();

    // Verify cards are still shown
    const cards = page.locator('.saved-page-card');
    await expect(cards.first()).toBeVisible();
  });

  test('should show about dialog', async ({ page }) => {
    page.on('dialog', async dialog => {
      expect(dialog.type()).toBe('alert');
      expect(dialog.message()).toContain('SaveIt Dashboard');
      expect(dialog.message()).toContain('Development');
      await dialog.accept();
    });

    await page.click('#about-link');
    await page.waitForTimeout(500);
  });
});

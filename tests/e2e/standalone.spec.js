import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const newtabPath = path.resolve(__dirname, '../../src/newtab.html');

test.describe('Standalone Mode', () => {
  test.beforeEach(async ({ page }) => {
    // Set up console logging to debug loading issues
    page.on('console', msg => {
      const type = msg.type();
      const text = msg.text();
      console.log(`[BROWSER ${type.toUpperCase()}]`, text);
    });

    page.on('pageerror', err => {
      console.error('[PAGE ERROR]', err.message);
      console.error(err.stack);
    });

    // Load standalone dashboard
    await page.goto(`file://${newtabPath}`);
    // Note: networkidle is unreliable with file:// protocol, especially in parallel tests
    // We rely on window.dashboardReady signal instead

    // Wait for dashboard to fully initialize (critical for headless mode)
    try {
      await page.waitForFunction(() => window.dashboardReady === true, { timeout: 10000 });
      console.log('[TEST] Dashboard ready signal received');
    } catch (error) {
      console.error('[TEST] Dashboard initialization timeout');

      // Check if scripts loaded and mock data is available
      const debugInfo = await page.evaluate(() => {
        return {
          hasBrowser: typeof browser !== 'undefined',
          hasMockData: typeof MOCK_DATA !== 'undefined',
          mockDataLength: typeof MOCK_DATA !== 'undefined' ? MOCK_DATA.length : 0,
          hasAPI: typeof API !== 'undefined',
          isExtension: typeof API !== 'undefined' ? API.isExtension : null,
          hasComponents: typeof Components !== 'undefined',
          hasSaveItDashboard: typeof SaveItDashboard !== 'undefined',
          dashboardReady: window.dashboardReady,
          dashboard: typeof window.dashboard !== 'undefined'
        };
      });
      console.log('[DEBUG INFO]', debugInfo);
      throw error;
    }
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
    // Get theme buttons (use button selector to avoid matching html element)
    const lightButton = page.locator('button[data-theme="light"]');
    const darkButton = page.locator('button[data-theme="dark"]');
    const autoButton = page.locator('button[data-theme="auto"]');

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

  test('should filter by tag when clicking', async ({ page }) => {
    await page.waitForSelector('.saved-page-card');
    const initialCount = await page.locator('.saved-page-card').count();

    // Wait for AI tags to be visible and clickable
    await page.waitForSelector('.ai-tag', { state: 'visible' });

    // Click on an AI tag
    const firstTag = page.locator('.ai-tag').first();
    await firstTag.click();

    // Wait for tag to be marked as active
    await expect(firstTag).toHaveClass(/active/);

    // Wait for results to update (may take a moment for similarity search)
    await page.waitForTimeout(500);

    // Verify pages are still shown (similarity search should return results)
    const filteredCount = await page.locator('.saved-page-card').count();
    expect(filteredCount).toBeGreaterThan(0);

    // Stats should show filtered count
    const stats = await page.locator('#stats').textContent();
    expect(stats).toMatch(/\d+ (of \d+ )?pages?/);
  });

  test('should clear tag filter when clicking tag again', async ({ page }) => {
    await page.waitForSelector('.saved-page-card');
    const initialCount = await page.locator('.saved-page-card').count();

    // Wait for AI tags and click one
    await page.waitForSelector('.ai-tag', { state: 'visible' });
    const firstTag = page.locator('.ai-tag').first();
    await firstTag.click();
    await page.waitForTimeout(500);

    // Tag should be active
    await expect(firstTag).toHaveClass(/active/);

    // Click tag again to clear filter
    await firstTag.click();
    await page.waitForTimeout(300);

    // Tag should no longer be active
    await expect(firstTag).not.toHaveClass(/active/);

    // All cards should be shown again
    const finalCount = await page.locator('.saved-page-card').count();
    expect(finalCount).toBe(initialCount);
  });

  test('should show about dialog', async ({ page }) => {
    page.on('dialog', async dialog => {
      expect(dialog.type()).toBe('alert');
      expect(dialog.message()).toContain('SaveIt');
      expect(dialog.message()).toContain('Development');
      expect(dialog.message()).toContain('AI to read and semantically index');
      await dialog.accept();
    });

    await page.click('#about-link');
    await page.waitForTimeout(500);
  });
});

// Visual inspection harness — loads the standalone new-tab page (mock data,
// no extension/backend) and captures screenshots of key states so a reviewer
// (human or agent) can see the rendered UI. Throwaway tool, not a test.
//
// Run: node scripts/screenshot-standalone.mjs
// Uses the project's installed Playwright (firefox, headless).

import path from 'path';
import { fileURLToPath } from 'url';
import { firefox } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const newtabPath = path.resolve(__dirname, '../src/newtab.html');
const outDir = path.resolve(__dirname, '../screenshots');

const VIEWPORT = { width: 1440, height: 900 };

async function openStandalone(page) {
  await page.goto(`file://${newtabPath}`);
  await page.waitForSelector('#project-sidebar');
  await page.waitForSelector('#saved-pages-results');
  // Let the mock data hydrate and the first render settle.
  await page.waitForTimeout(800);
}

async function shot(page, name, opts = {}) {
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: opts.fullPage ?? false });
  console.log(`  ✓ ${name} → ${path.relative(process.cwd(), file)}`);
}

const browser = await firefox.launch();
const context = await browser.newContext({ viewport: VIEWPORT });
const page = await context.newPage();

try {
  console.log('Capturing standalone UI states...');

  // 1. Initial / home view (the sparse shell — should show on idle load).
  await openStandalone(page);
  await shot(page, '01-home-initial');

  // 2. Home view, dark mode.
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await page.waitForTimeout(300);
  await shot(page, '02-home-dark');
  await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));

  // 3. Browse view — click "All pages" (the existing pattern flips to browse).
  await page.locator('.project-nav-item[data-project-id=""]').click();
  await page.waitForTimeout(600);
  await shot(page, '03-browse-all-pages');

  // 4. Browse view, scrolled — shows the card list density.
  await page.locator('#saved-pages-results').evaluate(el => (el.scrollTop = 400));
  await page.waitForTimeout(200);
  await shot(page, '04-browse-scrolled');

  // 5. Search-active — semantic pane.
  await page.locator('#saved-pages-results').evaluate(el => (el.scrollTop = 0));
  await page.fill('#saved-pages-search-input', 'JavaScript');
  await page.waitForSelector('[data-section="semantic"]', { timeout: 5000 });
  await page.waitForTimeout(500);
  await shot(page, '05-search-semantic');

  // 6. Clear search, select a project scope (sidebar).
  await page.fill('#saved-pages-search-input', '');
  await page.waitForTimeout(300);
  const projectNav = page.locator('.project-nav-item[data-project-id="project-saveit-product"]');
  if (await projectNav.count()) {
    await projectNav.click();
    await page.waitForTimeout(500);
    await shot(page, '06-scope-project');
  }

  // 7. Card hover state — materiality check (force :hover on first card).
  await page.locator('.project-nav-item[data-project-id=""]').click();
  await page.waitForTimeout(400);
  const firstCard = page.locator('.saved-pages-drawer-card').first();
  if (await firstCard.count()) {
    await firstCard.hover();
    await page.waitForTimeout(300);
    // Capture just the card region for hover detail.
    const box = await firstCard.boundingBox();
    if (box) {
      await page.screenshot({
        path: path.join(outDir, '07-card-hover.png'),
        clip: { x: box.x - 8, y: box.y - 8, width: box.width + 16, height: box.height + 16 }
      });
      console.log('  ✓ 07-card-hover');
    }
  }

  // 8. Toolbar popup (the Phase 3 parity surface), light + dark.
  // The popup is a separate HTML file; load it directly.
  const popupPath = path.resolve(__dirname, '../src/toolbar-popup.html');
  await page.goto(`file://${popupPath}`);
  await page.waitForTimeout(400);
  await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));
  await page.waitForTimeout(200);
  await page.setViewportSize({ width: 360, height: 520 });
  await shot(page, '08-toolbar-popup-light');
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await page.waitForTimeout(200);
  await shot(page, '09-toolbar-popup-dark');

  console.log('\nDone. Screenshots in ./screenshots/');
} finally {
  await browser.close();
}

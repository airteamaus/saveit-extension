import { test, expect, chromium } from '@playwright/test';
import nodeFs from 'node:fs';
import nodePath from 'node:path';
import nodeOs from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'url';

const fs = nodeFs;
const path = nodePath;
const os = nodeOs;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

// Build an unpacked Chrome extension (Chrome-flavored manifest + src/) into a
// temp dir that Chromium can load via --load-extension.
function buildUnpackedChromeExtension() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'saveit-warming-test-'));
  const extDir = path.join(tempRoot, 'extension');
  fs.mkdirSync(path.join(extDir, 'src'), { recursive: true });
  // Use cp -R for portability across Node versions (fs.cpSync is Node 16.7+).
  execFileSync('cp', ['-R', path.join(repoRoot, 'src') + '/.', path.join(extDir, 'src')]);

  const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'manifest.json'), 'utf-8'));
  // Chrome-flavored manifest: drop Firefox-specific bits.
  delete manifest.browser_specific_settings;
  if (manifest.background?.scripts) {
    delete manifest.background.scripts;
  }
  fs.writeFileSync(
    path.join(extDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n'
  );
  return extDir;
}

// Real extension-mode E2E for the post-login warming flow. Loads the actual
// extension in Chromium (so the real auth gate, module system, and warming code
// run), then drives the flow via the ?debug=1 seam with a controlled getList.
async function launchWithExtension() {
  const extDir = buildUnpackedChromeExtension();
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'saveit-warming-profile-'));
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false, // Chromium extension loading requires headed mode (or new headless)
    args: [
      `--disable-extensions-except=${extDir}`,
      `--load-extension=${extDir}`,
      '--no-first-run',
      '--no-default-browser-check'
    ]
  });
  // Chromium "new headless" supports extensions; if headless:true fails to load,
  // the caller will see no extension. We keep headless:false for reliability.
  return { context, extDir };
}

test.describe('post-login cache warming (real extension, Chromium)', () => {
  test('warming bar advances per batch, then hands off to cards', async () => {
    const { context } = await launchWithExtension();
    try {
      // Open the extension's new-tab page with the debug seam.
      const page = await context.newPage();
      page.on('console', (msg) => {
        if (msg.text().includes('WARM')) process.stdout.write(`${msg.text()}\n`);
      });
      page.on('pageerror', (err) => process.stdout.write(`[PAGEERROR] ${err.message}\n`));
      await page.goto('chrome://newtab/?debug=1', { waitUntil: 'load' });

      // Confirm the extension's new-tab override is active and the debug seam
      // exposed the app. (chrome://newtab should redirect to our extension page.)
      await page.waitForFunction(
        () => globalThis.__saveit?.app?.savedPagesStore,
        null,
        { timeout: 15000 }
      );

      // Install a controlled multi-batch getList: forces a real two-batch
      // warm-up with hasNextPage transitions — the exact path the warming UI drives.
      await page.evaluate(() => {
        const win = window;
        const makePages = (count, start) => Array.from({ length: count }, (_, i) => ({
          id: `p-${start + i}`,
          title: `Page ${start + i}`,
          url: `https://example.com/${start + i}`
        }));

        let callCount = 0;
        const store = globalThis.__saveit.app.savedPagesStore;
        store.options.getList = async () => {
          callCount += 1;
          await new win.Promise((r) => win.setTimeout(r, 150));
          if (callCount === 1) {
            return {
              pages: makePages(50, 0),
              pagination: { total: 90, hasNextPage: true, nextCursor: 'p-49' },
              meta: { fromCache: false }
            };
          }
          return {
            pages: makePages(40, 50),
            pagination: { total: 90, hasNextPage: false, nextCursor: null },
            meta: { fromCache: false }
          };
        };
      });

      // Arm + trigger the warm-up exactly as the interactive sign-in button does.
      // Set a fake current user so canHydrateDrawerWithWarmCache (which gates
      // loadDrawerBasePages) passes — getCurrentUser reads window.firebaseAuth.
      // Then load() opens the drawer (so isDrawerOpen() is true for the
      // subscriber's warming branch) and triggers loadDrawerBasePages -> hydrate.
      // Drive the warm-up: open the drawer (so the subscriber's isDrawerOpen()
      // check passes while events flow), arm the warm-up, and hydrate directly.
      // The store + subscriber + renderer are the production code under test;
      // we bypass only the OAuth/gate plumbing (already covered by unit tests).
      await page.evaluate(async () => {
        const win = window;
        win.firebaseAuth = { currentUser: { uid: 'test-user', email: 'test@example.com' } };
        const app = globalThis.__saveit.app;
        app.drawerController.open();
        app.savedPagesStore.reset({ emit: false });
        app.savedPagesStore.setLazy(false);
        await app.savedPagesStore.hydrate();
      });

      // The warming pane must appear with a partial % (per-batch rendering).
      await page.waitForFunction(
        () => {
          const pane = document.querySelector('.saved-pages-warming-pane');
          const pct = Number.parseInt(
            document.querySelector('.saved-pages-warming-percent')?.textContent || '',
            10
          );
          return pane && Number.isFinite(pct) && pct > 0 && pct < 100;
        },
        null,
        { timeout: 15000 }
      );

      // After the 100% completion pause, cards must render and the pane must go.
      await expect(
        page.locator('.saved-pages-drawer-card').first()
      ).toBeVisible({ timeout: 10000 });
      await expect(page.locator('.saved-pages-warming-pane')).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
});

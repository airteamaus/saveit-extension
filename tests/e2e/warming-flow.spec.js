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

  test('logout then interactive login shows the warming UI, then cards', async () => {
    // Reproduces the "left with 'No pages in All pages' empty state after
    // logout -> login" symptom. Drives the real handleSignIn -> handleSignedIn
    // chain (not direct hydrate) so the full lifecycle is exercised.
    const { context } = await launchWithExtension();
    try {
      const page = await context.newPage();
      await page.goto('chrome://newtab/?debug=1', { waitUntil: 'load' });
      await page.waitForFunction(
        () => globalThis.__saveit?.app?.savedPagesStore,
        null,
        { timeout: 15000 }
      );

      // Install a controlled multi-batch getList. Track call count globally so
      // we can confirm hydrate actually invoked it.
      await page.evaluate(() => {
        const win = window;
        const makePages = (count, start) => Array.from({ length: count }, (_, i) => ({
          id: `p-${start + i}`,
          title: `Page ${start + i}`,
          url: `https://example.com/${start + i}`
        }));
        const store = globalThis.__saveit.app.savedPagesStore;
        win.__getListCalls = 0;
        store.options.getList = async () => {
          win.__getListCalls += 1;
          await new win.Promise((r) => win.setTimeout(r, 150));
          if (win.__getListCalls === 1) {
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

      // Simulate the interactive sign-in flow end-to-end:
      //   handleSignIn fires onInteractiveSignIn (-> setLazy(false))
      //   then OAuth "completes" -> onAuthStateChanged -> handleSignedIn
      await page.evaluate(async () => {
        const win = window;
        const app = globalThis.__saveit.app;

        // Arm the warm-up exactly as the Sign-in button would.
        app.savedPagesStore.setLazy(false);

        // OAuth "completes": set the user so getCurrentUser() returns it.
        win.firebaseAuth = { currentUser: { uid: 'test-user', email: 'test@example.com' } };

        // handleSignedIn: resets the store and triggers loadDrawerResults,
        // which (with hasInitialized=false) calls loadDrawerBasePages -> hydrate.
        try {
          await app.drawerController.handleSignedIn();
          win.console.log('[FLOW] handleSignedIn resolved ok');
        } catch (e) {
          win.console.log('[FLOW] handleSignedIn threw: ' + e);
        }
      });

      // handleSignedIn runs the cold-load path: warming pane -> hydrate -> cards.
      // The warming pane must appear. (Per-batch partial % is asserted in the
      // dedicated warming test; here we confirm the pane renders at all after a
      // logout->login, then hands off to cards.)
      await expect(page.locator('.saved-pages-warming-pane')).toBeVisible({ timeout: 15000 });

      // No-flicker assertion: once cards appear, the warming pane must NEVER
      // come back. The pre-refactor bug was cards painting mid-warm (first
      // batch), then the warming dog overwriting them (late prefetch batch) and
      // getting stuck. Sample the DOM across the transition and assert the
      // sequence is strictly: warming → cards (never cards → warming).
      let sawCards = false;
      let flickeredBackToWarming = false;
      for (let s = 0; s < 40; s++) {
        const dom = await page.evaluate(() => ({
          warming: !!document.querySelector('.saved-pages-warming-pane'),
          cards: document.querySelectorAll('.saved-pages-drawer-card').length
        }));
        if (dom.cards > 0) sawCards = true;
        if (sawCards && dom.warming) flickeredBackToWarming = true;
        if (sawCards && !dom.warming) break;
        await page.waitForTimeout(50);
      }
      expect(flickeredBackToWarming, 'cards must never be overwritten by the warming pane').toBe(false);

      // ...then hand off to cards.
      await expect(page.locator('.saved-pages-drawer-card').first()).toBeVisible({ timeout: 10000 });
      await expect(page.locator('.saved-pages-warming-pane')).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test('session restoration (4 tabs, 1s apart) shows cards, never the warming UI', async () => {
    // Regression guard for the bug where the warming UI flashed over the user's
    // existing cards on every newtab open with a persisted login. After the fix,
    // setLazy(false) is only called from the interactive Sign-in button — never
    // from session restoration — so opening new tabs while logged in must render
    // cards directly with no warming pane.
    const { context } = await launchWithExtension();
    try {
      const results = [];

      for (let i = 0; i < 4; i++) {
        if (i > 0) {
          await new Promise((r) => setTimeout(r, 1000));
        }

        const page = await context.newPage();
        await page.goto('chrome://newtab/?debug=1', { waitUntil: 'load' });
        await page.waitForFunction(
          () => globalThis.__saveit?.app?.savedPagesStore,
          null,
          { timeout: 15000 }
        );

        // Probe the store's lazy default IMMEDIATELY after app exposure,
        // before any test interaction. Must be true (commit #15's lazy opt-out).
        const initialLazy = await page.evaluate(() => {
          return globalThis.__saveit.app.savedPagesStore.options.lazy;
        });
        expect(initialLazy, `tab ${i + 1} store must default to lazy`).toBe(true);

        // Install a fast single-batch getList so hydrate resolves quickly.
        await page.evaluate(() => {
          const win = window;
          const makePages = (count, start) => Array.from({ length: count }, (_, j) => ({
            id: `p-${start + j}`,
            title: `Page ${start + j}`,
            url: `https://example.com/${start + j}`
          }));
          const store = globalThis.__saveit.app.savedPagesStore;
          store.options.getList = async () => ({
            pages: makePages(20, 0),
            pagination: { total: 20, hasNextPage: false, nextCursor: null },
            meta: { fromCache: false }
          });
        });

        // Simulate SESSION RESTORATION: logged-in user, but do NOT call
        // setLazy(false) (only the interactive Sign-in button does that).
        // Open the drawer + hydrate, exactly as onAuthStateChanged -> handleSignedIn
        // -> loadDrawerBasePages would on a real session restore.
        await page.evaluate(async () => {
          window.firebaseAuth = { currentUser: { uid: 'test-user', email: 'test@example.com' } };
          const app = globalThis.__saveit.app;
          app.drawerController.open();
          await app.savedPagesStore.hydrate();
        });

        // Sample the DOM over a short window to catch any warming-pane flash.
        let sawWarmingPane = false;
        for (let s = 0; s < 10; s++) {
          const dom = await page.evaluate(() => ({
            warmingPane: !!document.querySelector('.saved-pages-warming-pane'),
            cards: document.querySelectorAll('.saved-pages-drawer-card').length
          }));
          if (dom.warmingPane) sawWarmingPane = true;
          if (dom.cards > 0) break;
          await page.waitForTimeout(30);
        }

        const finalDom = await page.evaluate(() => ({
          warmingPane: !!document.querySelector('.saved-pages-warming-pane'),
          cards: document.querySelectorAll('.saved-pages-drawer-card').length
        }));

        results.push({ tab: i + 1, sawWarmingPane, finalDom });
        await page.close();
      }

      for (const r of results) {
        process.stdout.write(
          `[TAB ${r.tab}] sawWarmingPane=${r.sawWarmingPane} final=${JSON.stringify(r.finalDom)}\n`
        );
        expect(r.sawWarmingPane, `tab ${r.tab} should never show the warming pane`).toBe(false);
        expect(r.finalDom.cards, `tab ${r.tab} should render cards`).toBeGreaterThan(0);
        expect(r.finalDom.warmingPane, `tab ${r.tab} warming pane must be absent`).toBe(false);
      }
    } finally {
      await context.close();
    }
  });
});

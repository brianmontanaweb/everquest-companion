/**
 * Headless Electron E2E for the CUSTOMIZABLE SIDE NAVIGATION (Tasks 1-8).
 *
 * WHY THIS IS AN E2E AND NOT A UNIT TEST. `tests/navLayout.test.mts` already pins the pure model
 * — `moveRow`, `toggleHidden`, `parseNavLayout`, the default/`vocab` degrade rules — under plain
 * node. Every claim left is about the REAL left drawer reacting to a control in a DIFFERENT React
 * subtree (Preferences -> Navigation) with NO reload, over `useSyncExternalStore`:
 *
 *   1. a fresh install draws every row, Overview first, and no "More";
 *   2. switching a row off in Preferences pulls it out of the main list and into the "More"
 *      collapse — which is `unmountOnExit`, so the row is ABSENT from the DOM until "More" opens —
 *      and the row is still fully navigable from there;
 *   3. a reorder in Preferences lands in the live drawer;
 *   4. compact density shrinks the rail and drops the row labels, the testids surviving;
 *   5. "Reset to default" restores every row and clears the stored key;
 *   6. the layout survives a `page.reload()`.
 *
 * ONE LAUNCH drives 1-5 in sequence (each step leaves the store where the next one wants it) and
 * step 6 adds a single reload. WAIT FOR CONDITIONS, NEVER `sleep` — `settle` / `settleGone` only:
 * this box's engine timing is slow and variable, and a hidden window can starve `rAF`.
 *
 * Run: npm run test:e2e -- nav-customization
 */
import type { Page } from 'playwright-core'
import {
  buildIfStale,
  check,
  countOf,
  dumpArtifacts,
  failures,
  note,
  reportRun,
  settle,
  settleGone
} from './appHarness.mjs'
import { mainWindow, makeUserData, removeUserData } from './appWindow.mjs'
import { launchOnFixture } from './logFixture.mjs'
import { openPrefs, openSection } from './prefsFirstPaintSteps.mjs'

const NAV = (v: string): string => `[data-testid="nav-${v}"]`
const CFG = (s: string): string => `[data-testid="nav-cfg-${s}"]`
const MORE = '[data-testid="nav-more"]'
const PANE = '[data-testid="pref-navigation"]'

/** The first-run analytics bar sits over the whole content area; every spec clears it the same way. */
async function dismissFirstRunNotice(page: Page): Promise<void> {
  const notice = '[data-testid="telemetry-notice"]'
  await page.waitForSelector(notice, { timeout: 30_000 }).catch(() => undefined)
  if ((await countOf(page, notice)) === 0) return
  await page.click('[data-testid="telemetry-notice-off"]')
  await settleGone(page, notice, { timeoutMs: 8_000 })
}

/** Open Preferences and switch the rail to the Navigation section. */
async function openNav(page: Page): Promise<void> {
  await openPrefs(page)
  await openSection(page, 'navigation', PANE)
}

/**
 * The `nav-*` testids in the drawer's MAIN list, in visual order — Overview first, then the user's
 * order. EXCLUDES the "More" button and everything inside its Collapse (open or closed), and the
 * bottom block (Customize / Send feedback / Preferences render in their own `<List>`s, siblings of
 * the main one, so a scoped `querySelectorAll` never reaches them).
 */
function mainNavOrder(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const list = document.querySelector('.MuiDrawer-paper .MuiList-root')
    if (!list) return []
    return [...list.querySelectorAll('[data-testid^="nav-"]')]
      .filter((el) => !el.closest('.MuiCollapse-root'))
      .map((el) => el.getAttribute('data-testid') ?? '')
      .filter((id) => id !== 'nav-more')
  })
}

/** The drawer paper's rendered width — ~220 comfortable, ~56 compact. */
function drawerWidth(page: Page): Promise<number> {
  return page.evaluate(
    () => (document.querySelector('.MuiDrawer-paper') as HTMLElement | null)?.clientWidth ?? 0
  )
}

/** The renderer-local "where was I" key, written on every view change (`appViews.ts` VIEW_KEY). */
function viewKey(page: Page): Promise<string | null> {
  return page.evaluate(() => localStorage.getItem('eq.view'))
}

/** The stored layout blob, or `null` — a default layout is an ABSENT key (navLayout.ts). */
function storedLayout(page: Page): Promise<string | null> {
  return page.evaluate(() => localStorage.getItem('eq.nav.layout'))
}

// ── 1. default ────────────────────────────────────────────────────────────────────────────
async function stepDefault(page: Page): Promise<void> {
  check('a fresh install shows no "More" row', (await countOf(page, MORE)) === 0)
  const order = await mainNavOrder(page)
  check('Overview is the first row in the drawer', order[0] === 'nav-overview', order.join(','))
  for (const v of ['combat', 'timers', 'buffs']) {
    check(`${v} is a row in the main list`, (await countOf(page, NAV(v))) === 1)
  }
}

// ── 2. hide -> overflow -> navigate ───────────────────────────────────────────────────────
async function stepHideToOverflow(page: Page): Promise<void> {
  await openNav(page)
  await page.click(CFG('show-timers'), { timeout: 15_000 })
  const gone = await settle(() => countOf(page, NAV('timers')), (n) => n === 0, { timeoutMs: 10_000 })
  check('switching Timers off pulls it out of the main list', gone === 0)
  check('…and a "More" row appears in its place', (await countOf(page, MORE)) === 1)

  await page.click(MORE, { timeout: 15_000 })
  const back = await settle(() => countOf(page, NAV('timers')), (n) => n === 1, { timeoutMs: 10_000 })
  check('expanding "More" brings the hidden row back into the DOM', back === 1)

  await page.click(NAV('timers'), { timeout: 15_000 })
  const view = await settle(() => viewKey(page), (v) => v === 'timers', { timeoutMs: 10_000 })
  check('a hidden row is still fully navigable from "More"', view === 'timers', String(view))
  check(
    '…and "More" wears the selected state while a hidden view is up',
    await page.evaluate((s) => document.querySelector(s)?.classList.contains('Mui-selected') === true, MORE)
  )
}

// ── 3. reorder ───────────────────────────────────────────────────────────────────────────
async function stepReorder(page: Page): Promise<void> {
  await openNav(page)
  const before = await mainNavOrder(page)
  await page.click(CFG('up-mobs'), { timeout: 15_000 })
  const after = await settle(
    () => mainNavOrder(page),
    (o) => JSON.stringify(o) !== JSON.stringify(before),
    { timeoutMs: 10_000 }
  )
  check(
    'nudging Mobs up in Preferences reorders the live drawer',
    after.indexOf('nav-mobs') >= 0 && after.indexOf('nav-mobs') < before.indexOf('nav-mobs'),
    `${before.join(',')} -> ${after.join(',')}`
  )
}

// ── 4. compact density ───────────────────────────────────────────────────────────────────
async function stepCompact(page: Page): Promise<void> {
  await openNav(page)
  const wide = await drawerWidth(page)
  check('the drawer starts at its comfortable width', wide > 120, `${wide}px`)

  await page.click(`${CFG('density')} input[value="compact"]`, { timeout: 15_000 })
  const narrow = await settle(() => drawerWidth(page), (w) => w > 0 && w < wide, { timeoutMs: 10_000 })
  check('compact density shrinks the rail', narrow < wide, `${wide}px -> ${narrow}px`)

  const combat = await page.evaluate((sel) => {
    const btn = document.querySelector(`.MuiDrawer-paper ${sel}`)
    return { present: !!btn, labelled: !!btn?.querySelector('.MuiListItemText-root') }
  }, NAV('combat'))
  check('…and the Combat row drops its text label', combat.present && !combat.labelled, JSON.stringify(combat))
  check('…while the row is still addressable by testid', (await countOf(page, NAV('combat'))) === 1)
}

// ── 5. reset ─────────────────────────────────────────────────────────────────────────────
async function stepReset(page: Page): Promise<void> {
  await openNav(page)
  await page.click(CFG('reset'), { timeout: 15_000 })
  const more = await settle(() => countOf(page, MORE), (n) => n === 0, { timeoutMs: 10_000 })
  check('"Reset to default" returns every hidden row to the main list', more === 0)

  const stored = await storedLayout(page)
  check('…and clears the stored layout (a fresh install writes no key)', stored === null, String(stored))
  check(
    '…and the reset button disables itself once the layout is default again',
    await page.evaluate(
      (s) => (document.querySelector(s) as HTMLButtonElement | null)?.disabled === true,
      CFG('reset')
    )
  )
}

// ── 6. persistence across a reload ───────────────────────────────────────────────────────
// The assertion is PERSISTENCE, so it is stated against the main list rather than DOM presence:
// "More" may still be expanded from step 2 (its open state is component-local and never reset),
// which would keep a hidden row mounted inside the Collapse — orthogonal to whether the layout
// survives the reload.
async function stepPersistsReload(page: Page): Promise<void> {
  await openNav(page)
  await page.click(CFG('show-buffs'), { timeout: 15_000 })
  const hidden = await settle(
    () => mainNavOrder(page),
    (o) => !o.includes('nav-buffs'),
    { timeoutMs: 10_000 }
  )
  check('switching Buffs off drops it from the main list', !hidden.includes('nav-buffs'), hidden.join(','))
  check('…and "More" is there to hold it', (await countOf(page, MORE)) === 1)

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForSelector(NAV('preferences'), { timeout: 60_000 })

  const afterReload = await mainNavOrder(page)
  check('the hidden row is still hidden after a reload', !afterReload.includes('nav-buffs'), afterReload.join(','))
  check('…with "More" still in the drawer to reach it', (await countOf(page, MORE)) === 1)
}

async function main(): Promise<void> {
  buildIfStale()
  const consoleErrors: string[] = []
  const userData = makeUserData()
  const launch = await launchOnFixture('e2e-telemetry.log', { userData })
  try {
    const page = await mainWindow(launch.app)
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text())
    })
    page.on('pageerror', (e) => consoleErrors.push(String(e)))

    await dismissFirstRunNotice(page)
    await stepDefault(page)
    await stepHideToOverflow(page)
    await stepReorder(page)
    await stepCompact(page)
    await stepReset(page)
    await stepPersistsReload(page)
    if (failures.length) await dumpArtifacts(page, 'nav-customization-FAIL')
  } finally {
    await launch.close()
    await removeUserData(userData)
  }

  check('no renderer console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))
  if (failures.length === 0) {
    note('one launch: hide -> "More" -> navigate, a live reorder, compact, reset, then a reload — no relaunch')
  }
  reportRun()
}

main().catch((err: unknown) => {
  console.error('e2e: harness error —', err)
  process.exitCode = 1
})

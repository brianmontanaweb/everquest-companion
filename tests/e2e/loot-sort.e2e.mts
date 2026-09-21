/**
 * Headless Electron integration test for THE LOOT SORT HEADERS BEING REACHABLE (JOS-127).
 *
 * THE BUG, as a 0.14.0 user hit it: you could not change the Loot page's order off "Last looted".
 * The Sort select sat in the toolbar; the surfaces stacked immediately BELOW it — the
 * notable-pickups strip and the first rows of the ledger — anchored `placement="top"`,
 * INTERACTIVE item cards (`lib/KnownItemTooltip`, up to 380px wide). A card opened upward
 * across the toolbar, and because an interactive MUI tooltip keeps `pointer-events: auto` while
 * it is up, the click aimed at the select landed on the card instead. The owner's direction was
 * removal: fewer tooltips, and never text that can sit over an interactive control.
 *
 * THE TOOLBAR SELECT ITSELF IS GONE NOW (2026-09-21): sorting moved into the grouped table's own
 * column headers (`SortHeadCell`, lootSort.ts), so the control this spec must prove reachable is
 * the sort header row, not a dropdown. The JOS-127 history above still applies — the surfaces that
 * used to eat the click did not go away when the select did — so the spec still hovers the same
 * anchors and checks the same geometry, now against the header.
 *
 * WHY THIS NEEDS A BROWSER AT ALL. `tests/tooltipCursor.test.mts` already pins the code shape —
 * no file that draws the ledger may mount a popper — and that guard is the one that cannot rot.
 * But "the code mounts no Tooltip" and "the control is clickable" are different claims, and only
 * the second is what the user reported. This spec asserts the second directly: hover the exact
 * anchors that used to open the card, then ask the DOM what is actually on top of the default
 * sort header (`elementFromPoint`), then change the order with real clicks.
 *
 * WHAT IT READS (JOS-29): `tests/fixtures/e2e-deep-link.log` — the committed fixture whose loot
 * lines already fill this ledger for `deep-link-back.e2e.mts`. Reusing it costs no new cut and no
 * live log; the strip step is guarded with a `note` because whether a pickup is NOTABLE depends
 * on an item-knowledge lookup, which is allowed to come back empty on an offline machine.
 *
 * MEASURED AGAINST THE BROKEN CODE (2026-08-09, this fixture, this harness): reverting only the
 * renderer half of the fix turns "hovering the notable-pickups chip opens no tooltip popper at
 * all" red — `poppers=1` — and green again with it. Say which of the two checks earns that: the
 * POPPER COUNT is the one that reproduced. The `elementFromPoint` check beside it passed even
 * while the card was up, because where a popper lands is a function of the window's size and this
 * window is a fixed 1280 that the owner's is not. So the geometry check is the statement of what
 * the user is owed (their click reaches the header) and the count is the tripwire that catches
 * the regression at any width. Neither is redundant, and neither is the whole guard —
 * `tests/tooltipCursor.test.mts` pins the code shape that makes both true.
 *
 * WHY IT NEVER TAKES THE SCREEN: `EQ_E2E=1` (src/main/e2e.ts) shows no window, skips the
 * single-instance lock, and points `userData` at a throwaway temp dir minted per launch.
 *
 * Run: `npm run test:e2e -- loot-sort`.
 */
import type { Page } from 'playwright-core'
import {
  buildIfStale,
  check,
  countOf,
  dumpArtifacts,
  failures,
  hoverAt,
  note,
  reportRun,
  settleStable,
  waitHydrated,
} from './appHarness.mjs'
import { mainWindow } from './appWindow.mjs'
import { launchOnFixture } from './logFixture.mjs'
// The app-wide timeslice's loot half (JOS-130) — next door, like every other step module here.
// `stepNewSession` is JOS-436's, and it rides this spec for the same reason: it is a LEDGER
// surface, and it needs the ledger in the state a user first sees it in.
import { stepLootSlice, stepNewSession } from './sliceSteps.mjs'
// JOS-322's step, next door again: the SAME button, now proving it moves the combat engine's own
// Overall picker as well as the ledger's. It rides this spec because this is where the button is.
import { stepOneClickSplitsBoth } from './sessionSplitSteps.mjs'

const GRID = '[data-testid="overview-grid"]'
const LOOT_LIST = '[data-testid="loot-list"]'
const LOOT_ROW = '[data-testid="loot-row"]'
/** The item NAME inside a row — the anchor the item card used to hang from. */
const LOOT_NAME = '[data-testid="loot-item-name"]'
/** The default-sorted header — the control a hover card must never cover (JOS-127). */
const SORT = '[data-testid="loot-sort-count"]'
/** Any MUI tooltip popper, whoever mounted it. The ledger must mount none. */
const POPPER = '.MuiTooltip-popper'
/** A notable-pickups chip: the other anchor that used to open a card over the toolbar. */
const PICKUP = '[data-testid="loot-list"] .MuiChip-clickable'

function appears(page: Page, sel: string, ms = 20_000): Promise<boolean> {
  return page.waitForSelector(sel, { timeout: ms }).then(
    () => true,
    () => false,
  )
}

/**
 * What is REALLY on top of the default sort header right now — the tag of whatever
 * `elementFromPoint` finds at its centre, and whether that node is inside the header.
 *
 * This is the assertion the ticket is about. A `countOf(POPPER) === 0` alone would pass on a
 * popper that mounted somewhere harmless; asking the geometry says the thing the user cares
 * about, which is that their click reaches the header.
 */
function whatCoversSort(page: Page): Promise<{ tag: string; inside: boolean }> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel)
    if (!el) return { tag: 'none', inside: false }
    const r = el.getBoundingClientRect()
    const hit = document.elementFromPoint(
      Math.round(r.left + r.width / 2),
      Math.round(r.top + r.height / 2),
    )
    if (!hit) return { tag: 'none', inside: false }
    return { tag: hit.tagName.toLowerCase(), inside: el.contains(hit) || hit === el }
  }, SORT)
}

/** What the header row says about sorting, read from the DOM the user sees. */
function headerState(
  page: Page,
  sel: string,
): Promise<{ total: number; visibleIcons: number; active: string[] }> {
  return page.evaluate((s) => {
    const labels = [...document.querySelectorAll<HTMLElement>(s)]
    const visibleIcons = labels.filter((l) => {
      const icon = l.querySelector('.MuiTableSortLabel-icon')
      return icon !== null && parseFloat(getComputedStyle(icon).opacity) > 0.2
    }).length
    const active = labels
      .filter((l) => l.dataset.active === 'true')
      .map((l) => l.dataset.testid ?? '')
    return { total: labels.length, visibleIcons, active }
  }, sel)
}

/**
 * Whether a sortable header's label fits inside its `<th>` — the fixed-layout columns each state a
 * percentage width, and a long label plus its always-visible icon must still fit without clipping.
 */
function headerFit(
  page: Page,
  sel: string,
): Promise<{ testId: string; scrollWidth: number; clientWidth: number }[]> {
  return page.evaluate((s) => {
    const labels = [...document.querySelectorAll<HTMLElement>(s)]
    return labels.map((l) => ({
      testId: l.dataset.testid ?? '',
      scrollWidth: l.scrollWidth,
      clientWidth: l.closest('th')?.clientWidth ?? 0,
    }))
  }, sel)
}

/** `aria-sort` on the <th> that holds a label — what assistive tech is told. */
function ariaSortOf(page: Page, label: string): Promise<string | null> {
  return page.evaluate(
    (s) => document.querySelector(s)?.closest('th')?.getAttribute('aria-sort') ?? null,
    label,
  )
}

/**
 * The item names currently painted, top to bottom, and whether they read A→Z — decided with the
 * PAGE's own `localeCompare` rather than Node's, since the renderer sorts (`byText`, lootSort.ts)
 * with the browser's ICU and a Node-side check could disagree with it on some locale's collation.
 */
function paintedOrder(page: Page): Promise<{ names: string[]; atoZ: boolean }> {
  return page.evaluate((s) => {
    const names = [...document.querySelectorAll<HTMLElement>(s)].map((n) => n.innerText.trim())
    const atoZ = names.every((n, i) => i === 0 || names[i - 1].localeCompare(n) <= 0)
    return { names, atoZ }
  }, LOOT_NAME)
}

/**
 * THE FEATURE, END TO END: every header says it sorts (an icon visible WITHOUT hovering), a click
 * sorts by that column, a second click flips it, and the choice is remembered.
 */
async function stepHeaderSort(
  page: Page,
  prefix: string,
  expected: number,
  defaultKey: string,
): Promise<void> {
  const sel = `[data-testid^="${prefix}-"]`
  const s = await headerState(page, sel)
  check(
    `${prefix}: ${String(expected)} sortable headers`,
    s.total === expected,
    `found ${String(s.total)}`,
  )
  check(
    `${prefix}: every sortable header shows its icon without hovering`,
    s.visibleIcons === s.total,
    `${String(s.visibleIcons)}/${String(s.total)} visible`,
  )
  check(
    `${prefix}: the default sort is ${defaultKey}`,
    s.active.join() === `${prefix}-${defaultKey}`,
    s.active.join(),
  )

  // HEADER FIT: a long label plus its always-visible ⇅ must not be clipped by its column's stated
  // width — a clipped header reads as a bug even though nothing here is functionally broken.
  const fit = await headerFit(page, sel)
  const clipped = fit.filter((f) => f.scrollWidth > f.clientWidth)
  check(
    `${prefix}: no sortable header label is clipped by its column`,
    clipped.length === 0,
    clipped
      .map(
        (f) =>
          `${f.testId} scrollWidth=${String(f.scrollWidth)}>clientWidth=${String(f.clientWidth)}`,
      )
      .join(', '),
  )
  console.log(
    `${prefix}: header fit — ` +
      fit
        .map(
          (f) =>
            `${f.testId}: scrollWidth=${String(f.scrollWidth)} clientWidth=${String(f.clientWidth)}`,
        )
        .join(', '),
  )

  const item = `[data-testid="${prefix}-item"]`
  await page.click(item, { timeout: 15_000 })
  const active = await settleStable(async () => (await headerState(page, sel)).active.join(), {
    timeoutMs: 6000,
  })
  check(`${prefix}: clicking Item makes it the sort`, active === `${prefix}-item`, active)
  check(
    `${prefix}: …ascending, and the <th> says so`,
    (await ariaSortOf(page, item)) === 'ascending',
  )
  const { names, atoZ } = await settleStable(() => paintedOrder(page), { timeoutMs: 6000 })
  check(
    `${prefix}: …and the painted rows are A→Z`,
    names.length > 0 && atoZ,
    names.slice(0, 5).join(' | '),
  )

  await page.click(item, { timeout: 15_000 })
  const flipped = await settleStable(() => ariaSortOf(page, item), { timeoutMs: 6000 })
  check(
    `${prefix}: a second click flips it to descending`,
    flipped === 'descending',
    String(flipped),
  )

  // Leave the table in its default order — the slice/session steps after this read the ledger.
  await page.click(`[data-testid="${prefix}-${defaultKey}"]`, { timeout: 15_000 })
  const restored = await settleStable(async () => (await headerState(page, sel)).active.join(), {
    timeoutMs: 6000,
  })
  check(`${prefix}: back on the default sort`, restored === `${prefix}-${defaultKey}`, restored)
}

/** Land, let the startup replay finish, and open the Loot tab on its ledger. */
async function stepReady(page: Page): Promise<void> {
  if (!check('the app lands on the Overview', await appears(page, GRID, 60_000))) {
    throw new Error('never landed on Overview — nothing below can be asserted')
  }
  const { snap } = await waitHydrated(page)
  if (!check('hydration completes (the replay has filled the loot ledger)', !snap.hydrating)) {
    throw new Error('still hydrating — nothing below can be asserted')
  }
  await page.click('[data-testid="nav-loot"]', { timeout: 15_000 })
  if (!check('the Loot tab opens on its ledger', await appears(page, LOOT_LIST))) {
    throw new Error('no loot ledger — nothing below can be asserted')
  }
  check('…with the grouped table’s sortable headers mounted', await appears(page, SORT))
}

/**
 * HOVER THE ANCHORS THAT USED TO EAT THE CLICK, then look at what is over the header.
 *
 * `settleStable` on the popper count is how the absence is asserted (wave E3's law): wait for the
 * reading to stop moving — which covers the shared Tooltip's `enterDelay` several times over —
 * and only then claim nothing is there.
 */
async function stepNothingCoversSort(page: Page, sel: string, what: string): Promise<void> {
  if ((await countOf(page, sel)) === 0) {
    note(`no ${what} in this run — that anchor could not be hovered`)
    return
  }
  if (!(await hoverAt(page, sel, 0.5, 0.5))) {
    note(`could not put the pointer on the ${what}`)
    return
  }
  const poppers = await settleStable(() => countOf(page, POPPER), { timeoutMs: 4000 })
  check(
    `hovering the ${what} opens no tooltip popper at all`,
    poppers === 0,
    `poppers=${String(poppers)}`,
  )
  const cover = await whatCoversSort(page)
  check(
    `…and the sort header is still the topmost thing at its own centre (${what})`,
    cover.inside,
    `elementFromPoint hit <${cover.tag}>`,
  )
}

/** The rows are still the drill-down's way in — removing the hover must not have cost the click. */
async function stepRowStillDrills(page: Page): Promise<void> {
  if ((await countOf(page, LOOT_ROW)) === 0) {
    note('the ledger has no row to open this run')
    return
  }
  await page.click(LOOT_ROW, { timeout: 15_000 })
  check(
    'a ledger row still opens that item’s drill-down',
    await appears(page, '[data-testid="loot-detail"]'),
  )
}

async function main(): Promise<void> {
  buildIfStale()

  console.log('launch: hidden Electron (EQ_E2E=1) against tests/fixtures/e2e-deep-link.log…')
  // `log` is the staged copy the app is tailing — JOS-436's step LOOTS SOMETHING through it, which
  // is the only way to prove a new session accrues from the click rather than from the last line
  // the fixture happened to carry.
  const { app, close, log } = await launchOnFixture('e2e-deep-link.log')

  let page: Page | null = null
  try {
    page = await mainWindow(app)
    const consoleErrors: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text())
    })
    page.on('pageerror', (e) => consoleErrors.push(String(e)))

    await stepReady(page)
    await stepNothingCoversSort(page, LOOT_NAME, 'first row’s item name')
    await stepNothingCoversSort(page, PICKUP, 'notable-pickups chip')
    await stepHeaderSort(page, 'loot-sort', 6, 'count')
    const stored = await page.evaluate(() => localStorage.getItem('eq.lootSort'))
    check(
      'the grouped sort is remembered for the next launch',
      stored === '{"key":"count","dir":"desc"}',
      String(stored),
    )
    // BEFORE the drill: that step takes the pane over and the ledger unmounts with it. The slice
    // control is a ledger surface, and it must be read in the state a user first sees.
    await stepLootSlice(page)
    // AFTER the slice step, which reads the ledger on `All` and needs it untouched, and BEFORE the
    // drill, which unmounts the whole bar. It leaves the ledger back on `All` for that step.
    await stepNewSession(page, log)
    // AFTER it, because it presses the same button a second time and reads the DELTA — and still
    // before the drill, which unmounts the whole bar.
    await stepOneClickSplitsBoth(page, log)
    await stepRowStillDrills(page)

    check(
      'no renderer console errors',
      consoleErrors.length === 0,
      consoleErrors.slice(0, 3).join(' | '),
    )

    await dumpArtifacts(page, failures.length ? 'loot-sort-FAIL' : 'loot-sort-pass')
  } finally {
    await close()
  }

  reportRun()
}

main().catch((err: unknown) => {
  console.error('e2e: harness error —', err)
  process.exitCode = 1
})

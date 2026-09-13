/**
 * Headless Electron test for THE WINDOW REMEMBERING ITS SIZE (JOS-248).
 *
 * Report 01KZSYHKZDERT9P4YAFJN4N3QP (v0.22.0): can the app save its window size. The policy is
 * pure and pinned next door — tests/windowState.test.mts covers what is worth remembering (a
 * maximized window, a minimized one, a destroyed one, the debounce's coalescing) and
 * tests/displayFit.test.mts covers the geometry against monitor arrangements this machine does not
 * have. Three claims are left over, and every one of them is about a REAL WINDOW IN A REAL
 * PROCESS:
 *
 *   1. A fresh install comes up at TODAY'S DEFAULT SIZE, exactly. The requirement is a promise
 *      about the window a first-time user gets, and the only honest evidence is that window.
 *   2. A size and position chosen in one process is the size and position the NEXT process opens
 *      at. That is a claim about a file outliving the app that wrote it, so it is two launches
 *      over one userData dir — a reload would prove nothing.
 *   3. A rectangle on a monitor that no longer exists comes up ON SCREEN, and the store STILL
 *      REMEMBERS IT. Both halves matter: the clamp is what is SHOWN, never what is STORED, or a
 *      single launch with the cable out would silently destroy the layout the user chose (JOS-187's
 *      ruling for the overlays, which this window now shares).
 *
 * THE LOST MONITOR IS SUPPLIED HONESTLY, not simulated: a stored rectangle at x=9000, which is off
 * every display this machine has for the same reason the reporter's was off theirs. It is written
 * into the store BETWEEN launches, with no app running — electron-store rewrites the whole file
 * from its in-memory copy on any `set`, so an edit made underneath a live app would be a race with
 * every unrelated setting.
 *
 * WHAT THIS SPEC DELIBERATELY DOES NOT COVER: the maximize restore. `maximize()` is documented to
 * SHOW a window that is not being shown, and `EQ_E2E=1` exists precisely so that no window is ever
 * put over the user's game — so the restore lives inside that guard in windows.ts and this harness
 * must not reach around it. The two halves it would prove are pinned where they can be: that a
 * maximized window is remembered as its NORMAL bounds plus the flag (windowState.test.mts), and
 * that the flag is what `ready-to-show` acts on (source, one branch).
 *
 * Run: `npm run test:e2e -- window-bounds`
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ElectronApplication } from 'playwright-core'
import { buildIfStale, check, note, reportRun, settle } from './appHarness.mjs'
import { closeWindows, mainWindow, makeUserData, removeUserData } from './appWindow.mjs'
import { launchOnFixture, stageFixture } from './logFixture.mjs'
import { DEFAULT_MAIN_WINDOW_SIZE } from '../../src/main/windowState'

/** A window rectangle, as Electron hands it over. */
interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

/** Where the main window is, and whether one display's work area holds all of it. */
interface Placement {
  bounds: Bounds | null
  onScreen: boolean
}

/** The store file this launch reads and writes — `STORE_NAME` in src/main/channel.ts, which cannot
 *  be imported here (it reaches Electron). A rename that forgot this line fails the spec loudly. */
const STORE_FILE = 'everquest-companion-progress.json'

/** The size a fresh install has always had, as the source states it. */
const DEFAULT_SIZE = DEFAULT_MAIN_WINDOW_SIZE

/** Where this spec puts the window, standing in for the user's own drag + resize. Comfortably
 *  inside any display this suite can run on, and clear of the 900x600 minimums. */
const CHOSEN: Bounds = { x: 120, y: 80, width: 1040, height: 720 }

/** A rectangle on no display this machine has — the reporter's second monitor, after the fact. */
const LOST_MONITOR: Bounds = { x: 9000, y: 9000, width: 1040, height: 720 }

const key = (b: Bounds | null): string => (b ? `${b.x},${b.y} ${b.width}x${b.height}` : '(none)')

/**
 * The MAIN window as main itself sees it, with `onScreen` answered where the question belongs:
 * only the main process can ask `screen` what displays exist. Identified by what it is NOT — the
 * overlays and the cursor ring load pages of their own — because this window's own URL differs
 * between a dev server and a built bundle.
 */
function mainPlacement(app: ElectronApplication): Promise<Placement> {
  return app.evaluate(({ BrowserWindow, screen }) => {
    const w = BrowserWindow.getAllWindows().find((win) => {
      const url = win.webContents.getURL()
      return !url.includes('overlay.html') && !url.includes('cursor.html')
    })
    if (!w) return { bounds: null, onScreen: false }
    const b = w.getBounds()
    const onScreen = screen.getAllDisplays().some((d) => {
      const a = d.workArea
      return (
        b.x >= a.x &&
        b.y >= a.y &&
        b.x + b.width <= a.x + a.width &&
        b.y + b.height <= a.y + a.height
      )
    })
    return { bounds: b, onScreen }
  })
}

/** Move + resize the main window, standing in for the drag and the corner pull. */
async function placeMainWindow(app: ElectronApplication, target: Bounds): Promise<void> {
  await app.evaluate(({ BrowserWindow }, b) => {
    const w = BrowserWindow.getAllWindows().find((win) => {
      const url = win.webContents.getURL()
      return !url.includes('overlay.html') && !url.includes('cursor.html')
    })
    w?.setBounds(b)
  }, target)
}

/** What the STORE says, read from the file the app left behind. Never while an app is running. */
function storedBounds(userData: string): (Bounds & { maximized?: boolean }) | null {
  const raw = JSON.parse(readFileSync(join(userData, STORE_FILE), 'utf8')) as {
    windowBounds?: Bounds & { maximized?: boolean }
  }
  return raw.windowBounds ?? null
}

/** Write a remembered rectangle into the store, keeping every other setting — the state an
 *  unplugged monitor leaves behind, applied with nothing running. */
function writeStoredBounds(userData: string, bounds: Bounds): void {
  const path = join(userData, STORE_FILE)
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
  raw.windowBounds = bounds
  writeFileSync(path, JSON.stringify(raw, null, 2), 'utf8')
}

const same = (a: Bounds | null, b: Bounds): boolean =>
  a !== null && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height

async function main(): Promise<void> {
  buildIfStale()

  // ONE dir across three launches, because every assertion here is that it OUTLIVES a process.
  // ONE staged log, so the launches are comparable in everything except the window.
  const userData = makeUserData()
  const log = stageFixture('e2e-telemetry.log')

  console.log('launch 1: fresh userData — the default size, then a move and a resize…')
  const first = await launchOnFixture(log, { userData })
  try {
    await mainWindow(first.app)
    const fresh = await mainPlacement(first.app)
    check(
      `a fresh install opens at today's default size, exactly — ${String(DEFAULT_SIZE.width)}x${String(DEFAULT_SIZE.height)}`,
      fresh.bounds?.width === DEFAULT_SIZE.width && fresh.bounds.height === DEFAULT_SIZE.height,
      key(fresh.bounds),
    )
    await placeMainWindow(first.app, CHOSEN)
    const moved = await settle(
      () => mainPlacement(first.app),
      (p) => same(p.bounds, CHOSEN),
      {
        timeoutMs: 10_000,
      },
    )
    check('the window can be put somewhere else', same(moved.bounds, CHOSEN), key(moved.bounds))
    // The user's own exit: closing the window is what flushes the debounced save (and `app.quit()`
    // — the path Playwright's own close takes — is covered by the `before-quit` flush beside it).
    await closeWindows(first.app)
  } finally {
    await first.close()
  }

  const written = storedBounds(userData)
  check('closing the window writes down where it was left', same(written, CHOSEN), key(written))
  check(
    '…and an ordinary window is remembered without a maximized flag',
    written?.maximized === undefined,
    String(written?.maximized),
  )

  console.log('launch 2: same userData — does the window come back where it was…')
  const second = await launchOnFixture(log, { userData })
  try {
    await mainWindow(second.app)
    const arrived = await mainPlacement(second.app)
    check(
      'a relaunch opens at the remembered size AND position — nothing in this spec has moved it',
      same(arrived.bounds, CHOSEN),
      key(arrived.bounds),
    )
    await closeWindows(second.app)
  } finally {
    await second.close()
  }
  check(
    'a launch that never touched the window leaves the remembered rectangle alone',
    same(storedBounds(userData), CHOSEN),
    key(storedBounds(userData)),
  )

  // ── the lost monitor ───────────────────────────────────────────────────────────────────────
  writeStoredBounds(userData, LOST_MONITOR)
  console.log('launch 3: the remembered monitor is gone — does the window still come up…')
  const third = await launchOnFixture(log, { userData })
  try {
    await mainWindow(third.app)
    const rescued = await mainPlacement(third.app)
    check(
      'a window remembered on a monitor that no longer exists comes up ON a display that does',
      rescued.onScreen,
      key(rescued.bounds),
    )
    check(
      '…at the size the user chose — only the position had to be overruled',
      rescued.bounds?.width === LOST_MONITOR.width && rescued.bounds.height === LOST_MONITOR.height,
      key(rescued.bounds),
    )
    await closeWindows(third.app)
  } finally {
    await third.close()
  }
  const kept = storedBounds(userData)
  check(
    'the clamp is what is SHOWN, never what is STORED — plugging the monitor back in restores it',
    same(kept, LOST_MONITOR),
    key(kept),
  )

  await removeUserData(userData)
  await log.dispose()
  note(
    'three real launches over one userData dir — the persistence claims are restarts, not reloads',
  )
  reportRun()
}

main().catch((err: unknown) => {
  console.error('e2e: harness error —', err)
  process.exitCode = 1
})

# Customizable Side Navigation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. `tasks/todo.md` is the compact tracker; this file is the detail.

**Goal:** Let a user reorder the left nav rows, hide rows they don't use (into a "More" menu), and switch the drawer to a compact icon-only rail — all from a new Preferences → Navigation section, persisted locally and carried in the settings-share bundle.

**Architecture:** A pure, node-tested vocabulary module (`navLayout.ts`) decides what a stored layout string *means* and how it degrades — the exact shape of `features/gear/gearPrefs.ts`. A renderer storage half (`lib/rawPref.ts`, extracted from `useCombatPrefs.ts`) gives every mounted reader a live `useSyncExternalStore` view of the `localStorage` value, so a change made in Preferences reaches `NavDrawer` in another subtree without a reload. `NavDrawer` renders `overview` (pinned first) + the user-ordered visible rows + a "More" collapse for hidden rows; `Preferences → Navigation` is the editor.

**Tech stack:** Electron + electron-vite, TypeScript, React 18, MUI v5. Unit tests: `node:test` + `tsx` (`tests/*.test.mts`). E2E: playwright-core `_electron` (`tests/e2e/*.e2e.mts`, auto-discovered).

**Spec:** This file, section "## Design" below. (Repo convention would also place a copy under `docs/plans/nav-customization.md`; kept here per the `/plan` command's `tasks/` instruction.)

## Global Constraints

- **Node not on PATH in fresh shells** — prepend `C:\Program Files\nodejs`, `C:\Program Files\git\bin`, `C:\Program Files\GitHub CLI` before running `npm`/`node`/`git`/`gh`.
- **Keep the tree buildable** — `npm run dev` (watch) must keep compiling between edits. Create any imported file (even an empty stub) before writing the import.
- **`npm run typecheck` (node + web) and `npm run lint` must pass before a task is done.** Lint enforces `max-lines 400` (code mass, blanks+comments excluded), `max-lines-per-function 100`, `complexity 12`, `max-depth 3`, `max-params 4`.
- **Node-tested pure modules use RELATIVE value imports**, never `@shared/*` / `@renderer/*` aliases (the node runner resolves no alias for values). Type-only imports may keep the alias.
- **A stored value degrades, it never errors** (JOS-105): every parser here takes `unknown` / `string | null` and answers with something the UI can render — absent, empty, malformed JSON, an unknown key, a repeat all resolve to a usable value, never a throw and never a blank drawer.
- **`VIEW_LABELS` in `appViews.ts` stays the single source of a tab's name.** This feature does not add row renaming.
- **Default layout must render the drawer byte-identical to today's** — same rows, same order, same testids — so the ~58 existing e2e specs that click `[data-testid="nav-<view>"]` keep passing untouched.
- **Do not edit `AGENTS.md`** — its distillation is the integrator's job, never a worker's. The load-bearing "one row per destination" note lives in `NavDrawer.tsx` and is updated there (Task 9).
- **Commits:** conventional-commit messages, end every commit body with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`. Work on a branch, never on `main`.

---

## Design

### What "customize" covers

| Capability | In scope | Notes |
|---|---|---|
| Reorder rows | ✅ | Up/down arrows in Preferences (no drag-and-drop library in the repo). |
| Hide / show rows | ✅ | Hidden rows move to a "More" collapse at the bottom of the drawer — still reachable, deep links & Back unaffected. |
| Compact / icon-only density | ✅ | ~56px icon rail with tooltips vs. the 220px labelled drawer. |
| Rename rows | ❌ | Out of scope — `VIEW_LABELS` stays authoritative. |

### Which rows are customizable

`CUSTOMIZABLE_VIEWS` (default order): `combat, mobs, loot, gear, maps, bosses, posky, alerts, leveling, buffs, timers`.

- **`overview`** — pinned first: not reorderable, not hideable (it is `DEFAULT_VIEW`; a fresh launch must always land on a visible row).
- **`preferences` and "Send feedback"** — pinned in the bottom block, unchanged.
- **`triage`** (owner-only) — untouched; still appended separately behind `OWNER_TOOLS`.
- **The Gear row** — one row (`view: 'gear'`), reorders/hides as a unit; the in-area tab bar (JOS-324) is untouched. Its `area`/`opens` behaviour is preserved.

### Persistence

- `localStorage["eq.nav.layout"]` = JSON `{ order: string[]; hidden: string[]; vocab: string[] }`. Machine-class view preference — never crosses IPC (the `gearPrefs.ts` idiom).
  - `vocab` records which rows the user was *asked about* when they saved. A row added in a later release is **shown by default** for a user who customized before it existed — the `LEGACY_GEAR_CONTROLS` lesson (`gearPrefs.ts`). A bare `string[]` (order only) is read as a pre-`vocab` value.
- `localStorage["eq.nav.density"]` = `"comfortable" | "compact"`; absent ⇒ `"comfortable"`.
- Fresh-install shape (default order, nothing hidden) serializes to an **absent key**, so an explicit "Reset to default" leaves the store exactly as a fresh install found it.

### Settings-share bundle

Add `eq.nav.layout` and `eq.nav.density` to `UI_PREF_SPECS` (`src/shared/shareSchema.ts`), both `merge: 'replace'` (a structured layout cannot be unioned; `replace` prefs are opt-in on import). The bundle mechanism already reads/writes raw `localStorage` by key (`lib/uiPrefs.ts`); `resolveNavLayout` sanitizes whatever a stranger's bundle carried on the way in. Imported values apply on next mount / relaunch (same as the existing `eq.combat.scope` bundle key).

### File map

| File | Responsibility |
|---|---|
| `src/renderer/src/components/navLayout.ts` **(new)** | Pure vocabulary: `CUSTOMIZABLE_VIEWS`, parse / resolve / mutate / serialize. No React, no DOM, no storage. |
| `tests/navLayout.test.mts` **(new)** | Every default / guard / degrade / mutate branch, under plain node. |
| `src/renderer/src/lib/rawPref.ts` **(new)** | The `localStorage` + `useSyncExternalStore` + cross-window `storage` machinery, extracted verbatim from `useCombatPrefs.ts`. |
| `src/renderer/src/features/combat/useCombatPrefs.ts` **(modify)** | Re-export `useRawPref`/`useBoolPref` from `lib/rawPref.ts`; import `subscribe`/`notifyAll` from there for `useMeterScope`. |
| `src/renderer/src/components/useNavPrefs.ts` **(new)** | `useNavLayout()` / `useNavDensity()` hooks over `rawPref` + `navLayout`. |
| `src/renderer/src/components/NavDrawer.tsx` **(modify)** | `ROWS` array → `ROW_META` record; user-ordered visible rows; "More" overflow; compact density; "Customize…" row; law comment. |
| `src/renderer/src/features/preferences/NavigationSetting.tsx` **(new)** | `navigationSection()` descriptor + the editor card. |
| `src/renderer/src/features/preferences/PreferencesView.tsx` **(modify)** | Insert `navigationSection()` after `appearanceSection()`. |
| `src/shared/shareSchema.ts` **(modify)** | Two `UI_PREF_SPECS` rows. |
| `tests/shareProfiles.test.mts` **(modify)** | Round-trip assertion for the two new keys. |
| `tests/e2e/nav-customization.e2e.mts` **(new)** | Hide → overflow → navigate; reorder; compact; reset; persistence across reload. |

### Checkpoints

- **After Task 4** — drawer renders from the layout model with the default producing today's drawer exactly. Full e2e suite green with zero spec edits. *Stop for review.*
- **After Task 7** — feature complete in the UI (overflow + compact + editor). *Stop for review.*
- **After Task 9** — new e2e green, typecheck + lint + full unit suite green. *Stop for review.*

---

## Task 1: `navLayout.ts` — pure layout model

**Files:**
- Create: `src/renderer/src/components/navLayout.ts`
- Test: `tests/navLayout.test.mts`

**Interfaces:**
- Consumes: `View` type from `../appViews` (type-only import; alias `@renderer` not needed — relative path).
- Produces:
  - `NAV_LAYOUT_KEY = 'eq.nav.layout'`, `NAV_DENSITY_KEY = 'eq.nav.density'`
  - `CUSTOMIZABLE_VIEWS: readonly View[]`
  - `type NavDensity = 'comfortable' | 'compact'`, `DEFAULT_NAV_DENSITY: NavDensity`
  - `readNavDensity(raw: string | null): NavDensity`
  - `parseNavLayout(raw: string | null): { order: View[]; hidden: View[] }` — `order` is the full row list incl. hidden, resolved against today's vocabulary; `hidden` is the subset to keep off the main list.
  - `toMainOverflow(parsed: { order: View[]; hidden: View[] }): { main: View[]; overflow: View[] }`
  - `resolveNavLayout(raw: string | null): { main: View[]; overflow: View[] }` — `toMainOverflow(parseNavLayout(raw))`
  - `moveRow(order: readonly View[], view: View, dir: -1 | 1): View[]`
  - `toggleHidden(hidden: readonly View[], view: View): View[]`
  - `serializeNavLayout(order: readonly View[], hidden: readonly View[]): string | null`
  - `isDefaultLayout(order: readonly View[], hidden: readonly View[]): boolean`

- [ ] **Step 1: Write the failing test**

Create `tests/navLayout.test.mts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CUSTOMIZABLE_VIEWS,
  DEFAULT_NAV_DENSITY,
  isDefaultLayout,
  moveRow,
  parseNavLayout,
  readNavDensity,
  resolveNavLayout,
  serializeNavLayout,
  toggleHidden
} from '../src/renderer/src/components/navLayout'

const DEFAULT_ORDER = [...CUSTOMIZABLE_VIEWS]

test('overview / preferences / feedback / triage are NOT customizable', () => {
  for (const v of ['overview', 'preferences', 'feedback', 'triage']) {
    assert.ok(!(CUSTOMIZABLE_VIEWS as readonly string[]).includes(v), `${v} is pinned`)
  }
})

test('no stored layout is the default order with nothing hidden', () => {
  assert.deepEqual(resolveNavLayout(null), { main: DEFAULT_ORDER, overflow: [] })
  assert.deepEqual(resolveNavLayout(''), { main: DEFAULT_ORDER, overflow: [] })
  assert.deepEqual(resolveNavLayout('not json'), { main: DEFAULT_ORDER, overflow: [] })
  assert.deepEqual(resolveNavLayout('{"order":123}'), { main: DEFAULT_ORDER, overflow: [] })
})

test('a stored order is honoured, unknown ids drop, repeats collapse, missing ids append in default order', () => {
  const raw = JSON.stringify({ order: ['timers', 'combat', 'nope', 'timers'], hidden: [], vocab: DEFAULT_ORDER })
  const { order } = parseNavLayout(raw)
  assert.deepEqual(order.slice(0, 2), ['timers', 'combat'])
  // every customizable view still present exactly once, remainder in default order
  assert.deepEqual([...order].sort(), [...DEFAULT_ORDER].sort())
  assert.equal(new Set(order).size, order.length)
})

test('a hidden row leaves the main list and appears in overflow (default order)', () => {
  const raw = JSON.stringify({ order: DEFAULT_ORDER, hidden: ['timers', 'maps'], vocab: DEFAULT_ORDER })
  const { main, overflow } = resolveNavLayout(raw)
  assert.ok(!main.includes('timers') && !main.includes('maps'))
  assert.deepEqual(overflow, DEFAULT_ORDER.filter((v) => v === 'maps' || v === 'timers'))
})

test('a row the user never ruled on (not in stored vocab) is shown even if listed hidden', () => {
  // stranger's / older bundle: hides 'timers' but its vocab predates 'buffs'
  const raw = JSON.stringify({ order: ['combat'], hidden: ['timers', 'buffs'], vocab: ['combat', 'timers'] })
  const { main, overflow } = resolveNavLayout(raw)
  assert.ok(!main.includes('timers'), 'a hide the user actually made stands')
  assert.ok(main.includes('buffs'), 'a row not in their vocab is shown, not hidden')
  assert.ok(!overflow.includes('buffs'))
})

test('a bare array is read as order-only (pre-vocab), nothing hidden', () => {
  const { main, overflow } = resolveNavLayout(JSON.stringify(['timers', 'combat']))
  assert.equal(overflow.length, 0)
  assert.equal(main[0], 'timers')
})

test('moveRow swaps with the neighbour and clamps at the ends', () => {
  const o = [...DEFAULT_ORDER]
  assert.deepEqual(moveRow(o, o[2], -1)[1], o[2])
  assert.deepEqual(moveRow(o, o[0], -1), o, 'first row up is a no-op')
  assert.deepEqual(moveRow(o, o[o.length - 1], 1), o, 'last row down is a no-op')
})

test('toggleHidden adds then removes', () => {
  assert.deepEqual(toggleHidden([], 'timers'), ['timers'])
  assert.deepEqual(toggleHidden(['timers'], 'timers'), [])
})

test('the default layout serializes to null (absent key)', () => {
  assert.equal(serializeNavLayout(DEFAULT_ORDER, []), null)
  assert.ok(isDefaultLayout(DEFAULT_ORDER, []))
  assert.equal(typeof serializeNavLayout([...DEFAULT_ORDER].reverse(), []), 'string')
  assert.ok(!isDefaultLayout(DEFAULT_ORDER, ['timers']))
})

test('a serialized non-default layout round-trips through parse', () => {
  const order = moveRow([...DEFAULT_ORDER], 'timers', -1)
  const raw = serializeNavLayout(order, ['maps'])
  assert.ok(raw)
  const parsed = parseNavLayout(raw)
  assert.deepEqual(parsed.order, order)
  assert.deepEqual(parsed.hidden, ['maps'])
})

test('readNavDensity: absent / unknown ⇒ comfortable; explicit compact stands', () => {
  assert.equal(readNavDensity(null), DEFAULT_NAV_DENSITY)
  assert.equal(readNavDensity('comfortable'), 'comfortable')
  assert.equal(readNavDensity('compact'), 'compact')
  assert.equal(readNavDensity('huge'), DEFAULT_NAV_DENSITY)
})
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `node --import tsx --test tests/navLayout.test.mts`
Expected: FAIL — cannot find module `navLayout`.

- [ ] **Step 3: Implement `navLayout.ts`**

```ts
// navLayout.ts — WHAT A STORED SIDE-NAV LAYOUT MEANS, with no React, no DOM and no storage.
//
// The `features/gear/gearPrefs.ts` shape, for the nav drawer: the vocabulary and the degrade
// rules live here so `tests/navLayout.test.mts` can drive every branch under plain node; the
// storage half is `components/useNavPrefs.ts` over `lib/rawPref.ts`.
//
// TWO LAWS FROM gearPrefs, both load-bearing:
//   - ABSENT IS NOT EMPTY. No stored value ⇒ the app's default (every row, default order). A
//     serialized default is written as an ABSENT KEY, so "Reset to default" leaves the store as
//     a fresh install found it.
//   - A ROW THE USER NEVER RULED ON IS SHOWN. `vocab` records the rows offered when the layout
//     was saved; a row added in a later release (or absent from a stranger's bundle) is shown
//     even if it appears in `hidden`, because the user was never asked. (LEGACY_GEAR_CONTROLS.)

import type { View } from '../appViews'

export const NAV_LAYOUT_KEY = 'eq.nav.layout'
export const NAV_DENSITY_KEY = 'eq.nav.density'

/**
 * The rows a user may reorder and hide, in default (editorial) order. Overview is pinned first
 * and is NOT here; Preferences and "Send feedback" are pinned in the drawer's bottom block; the
 * owner-only Triage row is appended separately. The Gear row is one entry — it moves and hides
 * as a unit and its in-area tab bar (JOS-324) is untouched.
 */
export const CUSTOMIZABLE_VIEWS = [
  'combat', 'mobs', 'loot', 'gear', 'maps', 'bosses', 'posky', 'alerts', 'leveling', 'buffs', 'timers'
] as const satisfies readonly View[]

const CUSTOMIZABLE: ReadonlySet<string> = new Set<string>(CUSTOMIZABLE_VIEWS)
const DEFAULT_ORDER: readonly View[] = CUSTOMIZABLE_VIEWS

export type NavDensity = 'comfortable' | 'compact'
export const DEFAULT_NAV_DENSITY: NavDensity = 'comfortable'

export function readNavDensity(raw: string | null): NavDensity {
  return raw === 'compact' || raw === 'comfortable' ? raw : DEFAULT_NAV_DENSITY
}

interface StoredNavLayout {
  order: string[]
  hidden: string[]
  vocab: string[]
}

/** A stored blob, or `null` — accepts the `{order,hidden,vocab}` shape and the bare-array
 *  (order-only, pre-vocab) shape; anything else is "nothing stored". */
function readStored(raw: string | null): StoredNavLayout | null {
  if (raw === null || raw === '') return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (Array.isArray(parsed)) {
    return { order: parsed.filter((v): v is string => typeof v === 'string'), hidden: [], vocab: [] }
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const o = parsed as Record<string, unknown>
  if (!Array.isArray(o.order)) return null
  const asStrings = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  return { order: asStrings(o.order), hidden: asStrings(o.hidden), vocab: asStrings(o.vocab) }
}

/** Stored order → the full row list: known ids in stored order, deduped, then every remaining
 *  customizable view appended in default order. */
function fullOrder(storedOrder: readonly string[]): View[] {
  const seen = new Set<string>()
  const out: View[] = []
  for (const v of storedOrder) {
    if (CUSTOMIZABLE.has(v) && !seen.has(v)) {
      seen.add(v)
      out.push(v as View)
    }
  }
  for (const v of DEFAULT_ORDER) if (!seen.has(v)) out.push(v)
  return out
}

export function parseNavLayout(raw: string | null): { order: View[]; hidden: View[] } {
  const stored = readStored(raw)
  if (!stored) return { order: [...DEFAULT_ORDER], hidden: [] }
  const order = fullOrder(stored.order)
  const vocab = new Set(stored.vocab)
  // A hide counts only for a row that WAS in the vocabulary the user saved against. A bare array
  // carries no vocab and no hidden list, so this is empty for it.
  const hidden = order.filter((v) => stored.hidden.includes(v) && vocab.has(v))
  return { order, hidden }
}

export function toMainOverflow(parsed: { order: View[]; hidden: View[] }): { main: View[]; overflow: View[] } {
  const hidden = new Set<string>(parsed.hidden)
  return {
    main: parsed.order.filter((v) => !hidden.has(v)),
    overflow: DEFAULT_ORDER.filter((v) => hidden.has(v))
  }
}

export function resolveNavLayout(raw: string | null): { main: View[]; overflow: View[] } {
  return toMainOverflow(parseNavLayout(raw))
}

/** Swap a row with its neighbour. Returns the SAME array reference when nothing moved (first up,
 *  last down, id not found), so a no-op click writes nothing. */
export function moveRow(order: readonly View[], view: View, dir: -1 | 1): View[] {
  const i = order.indexOf(view)
  const j = i + dir
  if (i === -1 || j < 0 || j >= order.length) return order as View[]
  const next = [...order]
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}

export function toggleHidden(hidden: readonly View[], view: View): View[] {
  return hidden.includes(view) ? hidden.filter((v) => v !== view) : [...hidden, view]
}

export function isDefaultLayout(order: readonly View[], hidden: readonly View[]): boolean {
  return hidden.length === 0 && order.length === DEFAULT_ORDER.length && order.every((v, i) => v === DEFAULT_ORDER[i])
}

/** …and back to a string, or `null` for "store nothing" — the default layout is what a fresh
 *  install has, so an explicit reset writes an absent key. `vocab` is always today's full list. */
export function serializeNavLayout(order: readonly View[], hidden: readonly View[]): string | null {
  if (isDefaultLayout(order, hidden)) return null
  const cleanOrder = fullOrder(order)
  const cleanHidden = cleanOrder.filter((v) => hidden.includes(v))
  return JSON.stringify({ order: cleanOrder, hidden: cleanHidden, vocab: [...CUSTOMIZABLE_VIEWS] })
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `node --import tsx --test tests/navLayout.test.mts`
Expected: PASS (all tests).

- [ ] **Step 5: typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/navLayout.ts tests/navLayout.test.mts
git commit -m "feat(nav): pure layout model for customizable side navigation"
```

---

## Task 2: Extract `lib/rawPref.ts` from `useCombatPrefs.ts`

Behaviour-preserving refactor. The `localStorage` + `useSyncExternalStore` + cross-window `storage` machinery is about to get a third consumer (the nav drawer), so it moves to `lib/`.

**Files:**
- Create: `src/renderer/src/lib/rawPref.ts`
- Modify: `src/renderer/src/features/combat/useCombatPrefs.ts`

**Interfaces:**
- Produces from `lib/rawPref.ts`: `subscribe(cb: () => void): () => void`, `notifyAll(): void`, `useRawPref(key: string): [string | null, (v: string | null) => void]`, `useBoolPref(key: string, dflt: boolean): [boolean, (v: boolean) => void]`.
- `useCombatPrefs.ts` keeps exporting `useRawPref`, `useBoolPref`, `useCombinePetRow`, `useHiddenChartLines`, `useMeterScope`, `COMBINE_PET_ROW_KEY` unchanged (re-export the two primitives).

- [ ] **Step 1: Create `lib/rawPref.ts` with the moved code**

Move, verbatim, from `useCombatPrefs.ts`: the `listeners` set, `notifyAll`, `subscribe`, `read`, `write`, `useRawPref`, `useBoolPref`. Header:

```ts
// rawPref.ts — one live view of a renderer localStorage key, shared by every mounted reader in
// this window AND every other window of this origin.
//
// Extracted verbatim from features/combat/useCombatPrefs.ts (which still re-exports it) when the
// side-nav customization gained a third consumer. The mechanism and its measurement are unchanged
// — read that file's header for why a same-document setItem needs `notifyAll` and a cross-window
// one is served by the 'storage' event.

import { useCallback, useSyncExternalStore } from 'react'

const listeners = new Set<() => void>()

export function notifyAll(): void {
  for (const l of [...listeners]) l()
}

export function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  if (listeners.size === 1) window.addEventListener('storage', notifyAll)
  return () => {
    listeners.delete(cb)
    if (listeners.size === 0) window.removeEventListener('storage', notifyAll)
  }
}

function read(key: string, dflt: boolean): boolean {
  const v = localStorage.getItem(key)
  return v === null ? dflt : v === '1'
}

export function useRawPref(key: string): [string | null, (v: string | null) => void] {
  const value = useSyncExternalStore<string | null>(
    subscribe,
    () => localStorage.getItem(key),
    () => null
  )
  const set = useCallback(
    (v: string | null) => {
      if (v === null) localStorage.removeItem(key)
      else localStorage.setItem(key, v)
      notifyAll()
    },
    [key]
  )
  return [value, set]
}

function write(key: string, v: boolean): void {
  localStorage.setItem(key, v ? '1' : '0')
  notifyAll()
}

export function useBoolPref(key: string, dflt: boolean): [boolean, (v: boolean) => void] {
  const value = useSyncExternalStore(subscribe, () => read(key, dflt), () => dflt)
  const set = useCallback((v: boolean) => write(key, v), [key])
  return [value, set]
}
```

- [ ] **Step 2: Rewrite `useCombatPrefs.ts` to consume it**

Delete the moved code. Replace with:

```ts
import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { notifyAll, subscribe, useBoolPref, useRawPref } from '../../lib/rawPref'
import {
  DEFAULT_METER_SCOPE, HIDDEN_LINES_KEY, METER_SCOPE_KEY,
  parseHiddenLines, readMeterScope, serializeHiddenLines, toggleHiddenLine, type ChartLineKey
} from './combatPrefs'
import type { MeterScope } from '@shared/roster'

export { useBoolPref, useRawPref } from '../../lib/rawPref'
export const COMBINE_PET_ROW_KEY = 'eq.combat.petRow'
// …useCombinePetRow, useHiddenChartLines, useMeterScope unchanged (they already only reference
// useBoolPref / useRawPref / subscribe / notifyAll, now imported).
```

Keep the existing doc comments on `useCombinePetRow` / `useHiddenChartLines` / `useMeterScope` and the `COMBINE_PET_ROW_KEY` comment. `useMeterScope` still uses `subscribe` + `notifyAll` — now imported.

- [ ] **Step 3: Run the combat unit suite**

Run: `node --import tsx --test tests/combatPrefs.test.mts`
Expected: PASS (unchanged — it only tests `combatPrefs.ts`).

- [ ] **Step 4: typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: clean. Confirm no other file imported the now-moved internals (grep `from './useCombatPrefs'` and `from '../combat/useCombatPrefs'` — all should still resolve via the re-exports).

- [ ] **Step 5: Full unit suite (behaviour-preserving gate)**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/lib/rawPref.ts src/renderer/src/features/combat/useCombatPrefs.ts
git commit -m "refactor(prefs): extract rawPref localStorage hook from useCombatPrefs"
```

---

## Task 3: `useNavPrefs.ts` — the storage hooks

**Files:**
- Create: `src/renderer/src/components/useNavPrefs.ts`

**Interfaces:**
- Consumes: `useRawPref` from `../lib/rawPref`; everything from `./navLayout`.
- Produces:
  - `useNavLayout(): { main: View[]; overflow: View[]; order: View[]; hidden: View[]; move: (v: View, dir: -1 | 1) => void; toggle: (v: View) => void; reset: () => void }`
  - `useNavDensity(): [NavDensity, (d: NavDensity) => void]`

- [ ] **Step 1: Implement**

```ts
// useNavPrefs.ts — the storage half of side-nav customization: a live view of `eq.nav.layout`
// and `eq.nav.density` for every reader in the window (the drawer) and the writer in another
// subtree (Preferences). Over lib/rawPref, the same cross-subtree mechanism the combat prefs use.

import { useCallback, useMemo } from 'react'
import { useRawPref } from '../lib/rawPref'
import type { View } from '../appViews'
import {
  DEFAULT_NAV_DENSITY, NAV_DENSITY_KEY, NAV_LAYOUT_KEY, type NavDensity,
  moveRow, parseNavLayout, readNavDensity, serializeNavLayout, toMainOverflow, toggleHidden
} from './navLayout'

export function useNavLayout(): {
  main: View[]; overflow: View[]; order: View[]; hidden: View[]
  move: (v: View, dir: -1 | 1) => void
  toggle: (v: View) => void
  reset: () => void
} {
  const [raw, setRaw] = useRawPref(NAV_LAYOUT_KEY)
  const { order, hidden } = useMemo(() => parseNavLayout(raw), [raw])
  const { main, overflow } = useMemo(() => toMainOverflow({ order, hidden }), [order, hidden])

  const write = useCallback(
    (nextOrder: readonly View[], nextHidden: readonly View[]) => {
      setRaw(serializeNavLayout(nextOrder, nextHidden))
    },
    [setRaw]
  )
  const move = useCallback((v: View, dir: -1 | 1) => write(moveRow(order, v, dir), hidden), [order, hidden, write])
  const toggle = useCallback((v: View) => write(order, toggleHidden(hidden, v)), [order, hidden, write])
  const reset = useCallback(() => setRaw(null), [setRaw])

  return { main, overflow, order, hidden, move, toggle, reset }
}

export function useNavDensity(): [NavDensity, (d: NavDensity) => void] {
  const [raw, setRaw] = useRawPref(NAV_DENSITY_KEY)
  const density = readNavDensity(raw)
  const set = useCallback((d: NavDensity) => setRaw(d === DEFAULT_NAV_DENSITY ? null : d), [setRaw])
  return [density, set]
}
```

- [ ] **Step 2: typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: clean. (No unit test — it is a thin storage wrapper; covered by the Task 9 e2e. This matches `useCombatPrefs.ts`, which is also not node-tested.)

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/useNavPrefs.ts
git commit -m "feat(nav): useNavLayout / useNavDensity storage hooks"
```

---

## Task 4: `NavDrawer` renders from the layout model (default = today's drawer)

The risky task: after this, the drawer is data-driven but the *default* output is byte-identical. **Checkpoint after this task.**

**Files:**
- Modify: `src/renderer/src/components/NavDrawer.tsx`

**Interfaces:**
- Consumes: `useNavLayout` from `./useNavPrefs`; `CUSTOMIZABLE_VIEWS` from `./navLayout`.
- Produces: `DRAWER_WIDTH` export unchanged (220). `NavRow` interface loses the `view` field (moves to a keyed record) — internal only.

- [ ] **Step 1: Replace `ROWS` array with a `ROW_META` record**

Turn the `NavRow` interface into per-view metadata (no `view` field — the key is the view), and the `ROWS` list into a `Record`:

```ts
/** A row's fixed metadata — its icon, optional trailing chip, and (for the Gear area) the
 *  several views it stands for plus which one it opens. The row's LABEL comes from VIEW_LABELS
 *  and its ORDER / VISIBILITY are now the user's (useNavPrefs / navLayout). */
interface NavRowMeta {
  icon: JSX.Element
  badge?: JSX.Element
  area?: readonly View[]
  opens?: () => View
}

const ROW_META: Record<Extract<View, 'overview'> | (typeof CUSTOMIZABLE_VIEWS)[number], NavRowMeta> = {
  overview: { icon: <SpaceDashboardIcon /> },
  combat: { icon: <BarChartIcon /> },
  mobs: { icon: <PetsIcon /> },
  loot: { icon: <ReceiptLongIcon /> },
  gear: { icon: <CheckroomIcon />, badge: BETA, area: GEAR_AREA_VIEWS, opens: loadGearTab },
  maps: { icon: <MapIcon /> },
  bosses: { icon: <EmojiEventsIcon /> },
  posky: { icon: <ShieldMoonIcon /> },
  alerts: { icon: <NotificationsActiveIcon /> },
  leveling: { icon: <TrendingUpIcon /> },
  buffs: { icon: <AutoFixHighIcon /> },
  timers: { icon: <TimerIcon /> }
}
```

Rewrite the big `ROWS` comment block (lines ~64–108) to state the new law:

```ts
// THE DRAWER IS USER-ORDERED NOW (see components/navLayout.ts). Overview is still pinned first —
// it is DEFAULT_VIEW and a launch must land on a visible row — and Preferences / "Send feedback"
// are still pinned in the bottom block. Everything between them is `CUSTOMIZABLE_VIEWS`: the user
// picks the order and can move any of them into the "More" collapse. The editorial defaults that
// used to live in this array's order (Overview leads; Loot beside Mobs — JOS-324's One Coin Four
// Faces put Gear next; Timers beside Buffs) are the DEFAULT of CUSTOMIZABLE_VIEWS, which is what
// a fresh install and "Reset to default" both produce. The law that survives unchanged: a row is
// a DESTINATION — one nav row per real place you can go, and the Gear row is still one row over
// an in-area tab bar (JOS-324), moved and hidden as a unit.
```

`NavRowButton` now takes `view` (the row's own view id) explicitly plus `meta`:

```ts
function NavRowButton({ view, meta, current, compact, onSelect }: {
  view: View
  meta: NavRowMeta
  current: View
  compact: boolean
  onSelect: (v: View) => void
}): JSX.Element {
  const button = (
    <ListItemButton
      data-testid={`nav-${view}`}
      selected={meta.area ? meta.area.includes(current) : current === view}
      onClick={() => onSelect(meta.opens ? meta.opens() : view)}
      sx={compact ? { justifyContent: 'center', px: 1 } : undefined}
    >
      <ListItemIcon sx={compact ? { minWidth: 0 } : undefined}>{meta.icon}</ListItemIcon>
      {!compact && <ListItemText primary={VIEW_LABELS[view]} />}
      {!compact && meta.badge}
    </ListItemButton>
  )
  return compact ? <Tooltip title={VIEW_LABELS[view]} placement="right">{button}</Tooltip> : button
}
```

(`compact` is always `false` until Task 6 — pass `false` for now so this task stays parity-only. Add the `Tooltip` import.)

- [ ] **Step 2: Drive the main list from `useNavLayout`**

In `NavDrawer`:

```ts
const { main } = useNavLayout()
// …
<List>
  <NavRowButton view="overview" meta={ROW_META.overview} current={view} compact={false} onSelect={onSelect} />
  {main.map((v) => (
    <NavRowButton key={v} view={v} meta={ROW_META[v]} current={view} compact={false} onSelect={onSelect} />
  ))}
  {/* UNRELEASED / OWNER-ONLY triage block unchanged */}
  {OWNER_TOOLS && ( /* …existing triage NavRowButton, adapted to the new props: view="triage",
      meta={{ icon: <RuleFolderIcon />, badge: <Chip … /> }} … */ )}
</List>
```

Keep the `PREFERENCES` row and "Send feedback" row in the bottom `Box` exactly as they are (adapt to the new `NavRowButton` signature: `view="preferences"`, `meta={{ icon: <SettingsIcon /> }}`).

- [ ] **Step 3: Run the full e2e suite — zero spec edits**

Run: `npm run test:e2e`
Expected: PASS. Every `nav-*` testid still present, same order, `overview` first. If any spec fails, the default layout is not parity — fix `navLayout.ts` / `ROW_META` order, do not touch the spec.

- [ ] **Step 4: typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: clean. If `NavDrawer` (the function) trips `max-lines-per-function`, extract the `<List>` body into a `NavMainList` component in the same file.

- [ ] **Step 5: Commit + CHECKPOINT**

```bash
git add src/renderer/src/components/NavDrawer.tsx
git commit -m "refactor(nav): render drawer rows from the layout model (default unchanged)"
```

**STOP. Report to the human: drawer is data-driven, full e2e green with no spec changes. Await go-ahead.**

---

## Task 5: `NavDrawer` — the "More" overflow collapse

**Files:**
- Modify: `src/renderer/src/components/NavDrawer.tsx`

- [ ] **Step 1: Add the overflow block**

```ts
import { useState } from 'react'
import Collapse from '@mui/material/Collapse'
import ExpandLess from '@mui/icons-material/ExpandLess'
import ExpandMore from '@mui/icons-material/ExpandMore'
import MoreHorizIcon from '@mui/icons-material/MoreHoriz'
```

In `NavDrawer`:

```ts
const { main, overflow } = useNavLayout()
const [moreOpen, setMoreOpen] = useState(false)
const currentInOverflow = overflow.includes(view)
const showMoreExpanded = moreOpen || currentInOverflow
```

A small component in the same file:

```ts
function NavOverflow({ views, current, expanded, onToggleExpand, onSelect }: {
  views: readonly View[]
  current: View
  expanded: boolean
  onToggleExpand: () => void
  onSelect: (v: View) => void
}): JSX.Element {
  return (
    <>
      <ListItemButton data-testid="nav-more" selected={views.includes(current)} onClick={onToggleExpand}>
        <ListItemIcon><MoreHorizIcon /></ListItemIcon>
        <ListItemText primary="More" />
        {expanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
      </ListItemButton>
      <Collapse in={expanded} unmountOnExit>
        <List disablePadding sx={{ pl: 1 }}>
          {views.map((v) => (
            <NavRowButton key={v} view={v} meta={ROW_META[v]} current={current} compact={false} onSelect={onSelect} />
          ))}
        </List>
      </Collapse>
    </>
  )
}
```

Render it at the end of the main `<List>`, only when `overflow.length > 0`:

```ts
{overflow.length > 0 && (
  <NavOverflow
    views={overflow}
    current={view}
    expanded={showMoreExpanded}
    onToggleExpand={() => setMoreOpen((o) => !o)}
    onSelect={onSelect}
  />
)}
```

Note: `unmountOnExit` keeps the collapsed overflow rows out of the DOM, so a spec that hides `timers` and then asserts `nav-timers` is *absent* from the main list works, and expanding "More" brings it back.

- [ ] **Step 2: Manual smoke via `npm run dev`**

Temporarily set `localStorage['eq.nav.layout'] = JSON.stringify({order:[...],hidden:['timers'],vocab:[...]})` in devtools (or wait for Task 7's UI). Confirm: `timers` gone from main list, "More" row appears, clicking it reveals `timers`, clicking `timers` navigates and "More" shows selected.

- [ ] **Step 3: typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/NavDrawer.tsx
git commit -m "feat(nav): 'More' overflow menu for hidden nav rows"
```

---

## Task 6: `NavDrawer` — compact density + "Customize…" row

**Files:**
- Modify: `src/renderer/src/components/NavDrawer.tsx`

**Interfaces:**
- Produces: `COMPACT_DRAWER_WIDTH = 56` export; `navDrawerWidth(density: NavDensity): number`.

- [ ] **Step 1: Density-aware width and rows**

```ts
import TuneIcon from '@mui/icons-material/Tune'
import { useNavDensity } from './useNavPrefs'

export const DRAWER_WIDTH = 220
export const COMPACT_DRAWER_WIDTH = 56
export function navDrawerWidth(density: NavDensity): number {
  return density === 'compact' ? COMPACT_DRAWER_WIDTH : DRAWER_WIDTH
}
```

In `NavDrawer`:

```ts
const [density] = useNavDensity()
const compact = density === 'compact'
const width = navDrawerWidth(density)
```

- Pass `compact` to every `NavRowButton` (main list, overflow, triage, preferences) and to the "More" row (in compact: icon-only + tooltip "More", no `ExpandLess/More` chevron, no `ListItemText`).
- Drawer `sx`: replace the two `DRAWER_WIDTH` literals with `width`.
- "Send feedback" row: same compact treatment (tooltip, no text).
- `UpdateChip` at the foot: it renders text — in compact, wrap in a tooltip and show only its icon, OR hide it entirely in compact (simpler; pick hide). Add a one-line comment either way.

- [ ] **Step 2: Add the "Customize…" row**

Just above the `<Divider />` in the bottom `Box`:

```ts
<ListItemButton data-testid="nav-customize" onClick={() => prefs.openSection('navigation')}>
  <ListItemIcon>{compact ? <Tooltip title="Customize navigation" placement="right"><TuneIcon /></Tooltip> : <TuneIcon />}</ListItemIcon>
  {!compact && <ListItemText primary="Customize…" />}
</ListItemButton>
```

(`prefs: PrefsRouting` is already a prop of `NavDrawer`. `openSection` takes a free string — no allowlist.)

- [ ] **Step 3: typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: clean. If `NavDrawer` trips `max-lines-per-function` or the file trips `max-lines 400`, split the bottom block into a `NavFooter` component in the same file.

- [ ] **Step 4: Full e2e suite (compact is off by default — still parity)**

Run: `npm run test:e2e`
Expected: PASS. Default density is comfortable, so the drawer is unchanged; the "Customize…" and (absent) "More" rows do not collide with any `nav-<view>` testid.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/NavDrawer.tsx
git commit -m "feat(nav): compact icon-only density and a 'Customize…' row"
```

---

## Task 7: Preferences → Navigation section

**Files:**
- Create: `src/renderer/src/features/preferences/NavigationSetting.tsx`
- Modify: `src/renderer/src/features/preferences/PreferencesView.tsx`

**Interfaces:**
- Consumes: `useNavLayout`, `useNavDensity` from `../../components/useNavPrefs`; `CUSTOMIZABLE_VIEWS` from `../../components/navLayout`; `VIEW_LABELS` from `../../appViews`; `PrefSection` type from `./PreferencesView`.
- Produces: `navigationSection(): PrefSection` (id `'navigation'`), `NavigationSetting(): JSX.Element`.

- [ ] **Step 1: Implement `NavigationSetting.tsx`**

```tsx
// NavigationSetting — Preferences → Navigation. Reorder the left nav, move rows into the "More"
// menu, and switch the drawer to a compact icon rail. Machine-class view prefs (localStorage,
// no IPC) — the same idiom as the Gear column/filter pickers.
//
// The descriptor lives with the card (perfSection / graphicsSection pattern): PreferencesView is
// at its factoring ceiling, and the words a user types to find this ("sidebar", "reorder",
// "hide tab", "compact") belong beside the control.
//
// ONE BORDER: PreferencesView wraps each item in an outlined Paper, so this renders bare Stacks.

import type { JSX } from 'react'
import {
  Button, FormControlLabel, IconButton, List, ListItem, ListItemText,
  Radio, RadioGroup, Stack, Switch, Typography
} from '@mui/material'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import ViewSidebarIcon from '@mui/icons-material/ViewSidebar'
import { CUSTOMIZABLE_VIEWS, isDefaultLayout } from '../../components/navLayout'
import { useNavDensity, useNavLayout } from '../../components/useNavPrefs'
import { VIEW_LABELS } from '../../appViews'
import type { PrefSection } from './PreferencesView'

export function navigationSection(): PrefSection {
  return {
    id: 'navigation',
    label: 'Navigation',
    icon: <ViewSidebarIcon fontSize="small" />,
    items: [
      {
        id: 'nav-layout',
        label: 'Side navigation',
        keywords:
          'navigation nav sidebar side bar drawer rail menu rows tabs reorder order arrange move hide show remove tab more overflow customize customise compact icons icon only density collapse layout left',
        content: <NavigationSetting />
      }
    ]
  }
}

export function NavigationSetting(): JSX.Element {
  const { order, hidden, move, toggle, reset } = useNavLayout()
  const [density, setDensity] = useNavDensity()
  const atDefault = isDefaultLayout(order, hidden)

  return (
    <Stack spacing={2} data-testid="pref-navigation">
      <Stack spacing={0.5}>
        <Typography variant="body2">Rows</Typography>
        <Typography variant="caption" color="text.secondary">
          Reorder the left nav, or switch a row off to move it into the “More” menu. Overview,
          Preferences and Send feedback always stay put.
        </Typography>
      </Stack>

      <List disablePadding>
        {order.map((v, i) => {
          const shown = !hidden.includes(v)
          return (
            <ListItem
              key={v}
              data-testid={`nav-cfg-row-${v}`}
              disableGutters
              secondaryAction={
                <Switch
                  size="small"
                  data-testid={`nav-cfg-show-${v}`}
                  checked={shown}
                  onChange={() => toggle(v)}
                  inputProps={{ 'aria-label': `Show ${VIEW_LABELS[v]}` }}
                />
              }
            >
              <IconButton
                size="small"
                data-testid={`nav-cfg-up-${v}`}
                disabled={i === 0}
                onClick={() => move(v, -1)}
                aria-label={`Move ${VIEW_LABELS[v]} up`}
              >
                <KeyboardArrowUpIcon fontSize="small" />
              </IconButton>
              <IconButton
                size="small"
                data-testid={`nav-cfg-down-${v}`}
                disabled={i === order.length - 1}
                onClick={() => move(v, 1)}
                aria-label={`Move ${VIEW_LABELS[v]} down`}
              >
                <KeyboardArrowDownIcon fontSize="small" />
              </IconButton>
              <ListItemText
                primary={VIEW_LABELS[v]}
                sx={{ pl: 1, opacity: shown ? 1 : 0.5 }}
              />
            </ListItem>
          )
        })}
      </List>

      <Stack spacing={0.5}>
        <Typography variant="body2">Density</Typography>
        <RadioGroup
          row
          data-testid="nav-cfg-density"
          value={density}
          onChange={(e) => setDensity(e.target.value === 'compact' ? 'compact' : 'comfortable')}
        >
          <FormControlLabel value="comfortable" control={<Radio size="small" />} label="Comfortable" />
          <FormControlLabel value="compact" control={<Radio size="small" />} label="Compact (icons only)" />
        </RadioGroup>
      </Stack>

      <Button
        data-testid="nav-cfg-reset"
        size="small"
        variant="outlined"
        disabled={atDefault}
        onClick={reset}
        sx={{ alignSelf: 'flex-start' }}
      >
        Reset to default
      </Button>
    </Stack>
  )
}
```

Note: `CUSTOMIZABLE_VIEWS` import may be unused if not referenced — drop it if lint flags. Keep `isDefaultLayout` (used).

- [ ] **Step 2: Register the section in `PreferencesView.tsx`**

Add the import beside the other "descriptor with its card" imports:

```ts
// Same arrangement (nav customization): the Navigation section names itself beside the card that
// renders it. See ./NavigationSetting.tsx.
import { navigationSection } from './NavigationSetting'
```

In `buildSections`, insert `navigationSection()` immediately after `appearanceSection()`:

```ts
    appearanceSection(),
    navigationSection(),
    combatSection(),
```

- [ ] **Step 3: typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 4: Manual smoke via `npm run dev`**

Open Preferences → Navigation. Reorder a row → drawer reorders live. Toggle a row off → drawer moves it under "More" live. Compact → drawer collapses live. Reset → drawer restored, button disables.

- [ ] **Step 5: Commit + CHECKPOINT**

```bash
git add src/renderer/src/features/preferences/NavigationSetting.tsx src/renderer/src/features/preferences/PreferencesView.tsx
git commit -m "feat(nav): Preferences → Navigation editor (reorder / hide / density / reset)"
```

**STOP. Report: feature complete in the UI. Await go-ahead.**

---

## Task 8: Carry nav layout in the settings-share bundle

**Files:**
- Modify: `src/shared/shareSchema.ts`
- Modify: `tests/shareProfiles.test.mts`

- [ ] **Step 1: Write the failing test**

In `tests/shareProfiles.test.mts`, extend the UI-prefs round-trip coverage (near line 357). Add:

```ts
test('nav layout and density ride the bundle and apply on replace', () => {
  const layout = JSON.stringify({ order: ['timers', 'combat'], hidden: ['maps'], vocab: ['combat', 'maps', 'timers'] })
  const ui = { 'eq.nav.layout': layout, 'eq.nav.density': 'compact' }
  const body = buildSettingsBody({ /* …existing helper args… */ }, ui) // match the file's existing pattern
  assert.equal(body.ui?.['eq.nav.layout'], layout)
  assert.equal(body.ui?.['eq.nav.density'], 'compact')
})
```

Match whatever helper `tests/shareProfiles.test.mts` already uses to assemble a body and to assert the whitelist (the existing assertion `UI_PREF_SPECS.map((s) => s.key).sort()` at line ~384 will need the two new keys added to its expected array — update it).

- [ ] **Step 2: Run it, verify it fails**

Run: `node --import tsx --test tests/shareProfiles.test.mts`
Expected: FAIL — new keys not in `UI_PREF_SPECS`.

- [ ] **Step 3: Add the two specs to `UI_PREF_SPECS`**

In `src/shared/shareSchema.ts`, append to `UI_PREF_SPECS`:

```ts
  // Side navigation LAYOUT (order + hidden rows) and DENSITY. Both are machine-class view prefs
  // like the combat scope above; 'replace' because a structured layout cannot be unioned, so
  // import is opt-in. `resolveNavLayout` (renderer) sanitizes whatever a stranger's bundle
  // carried — an unknown row id, a stale vocab — on the way in.
  { key: 'eq.nav.layout', label: 'Side navigation layout', merge: 'replace' },
  { key: 'eq.nav.density', label: 'Side navigation density', merge: 'replace' }
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `node --import tsx --test tests/shareProfiles.test.mts`
Expected: PASS.

- [ ] **Step 5: Full unit suite + typecheck + lint**

Run: `npm test && npm run typecheck && npm run lint`
Expected: PASS / clean. (Watch for any snapshot-style test that enumerates `UI_PREF_SPECS` length — update its expectation.)

- [ ] **Step 6: Commit**

```bash
git add src/shared/shareSchema.ts tests/shareProfiles.test.mts
git commit -m "feat(nav): carry side-nav layout and density in the settings bundle"
```

---

## Task 9: E2E spec + law comment

**Files:**
- Create: `tests/e2e/nav-customization.e2e.mts`
- Modify: `src/renderer/src/components/NavDrawer.tsx` (comment only — the "one row per destination" note, if not already fully rewritten in Task 4)

**Interfaces:**
- Consumes: the e2e harness — `tests/e2e/appHarness.mjs` (`buildIfStale`/`buildIfStale`, `check`, `countOf`, `settle`, `settleGone`, `note`, `reportRun`, `failures`, `dumpArtifacts`), `tests/e2e/appWindow.mjs` (`mainWindow`, `makeUserData`, `removeUserData`), `tests/e2e/logFixture.mjs` (`launchOnFixture`, `stageFixture`). Model on `tests/e2e/text-size.e2e.mts`.

- [ ] **Step 1: Write the spec**

```ts
/**
 * Headless Electron E2E for CUSTOMIZABLE SIDE NAVIGATION.
 *
 * WHY E2E: every claim is about the real drawer reacting to a control in another React subtree
 * (Preferences) with no reload — `tests/navLayout.test.mts` already pins the pure model. This
 * spec asserts: a hidden row leaves the main list and is reachable under "More"; a reorder lands;
 * compact shrinks the rail; reset restores; and the layout survives a reload.
 *
 * Run: npm run test:e2e -- nav-customization
 */
import type { Page } from 'playwright-core'
import {
  buildIfStale, check, countOf, dumpArtifacts, failures, note, reportRun, settle, settleGone
} from './appHarness.mjs'
import { mainWindow, makeUserData, removeUserData } from './appWindow.mjs'
import { launchOnFixture, stageFixture } from './logFixture.mjs'

const NAV = (v: string): string => `[data-testid="nav-${v}"]`
const RAIL = '[data-testid="prefs-rail-navigation"]'
const PANE = '[data-testid="pref-navigation"]'

async function dismissFirstRunNotice(page: Page): Promise<void> {
  const notice = '[data-testid="telemetry-notice"]'
  await page.waitForSelector(notice, { timeout: 30_000 }).catch(() => undefined)
  if ((await countOf(page, notice)) === 0) return
  await page.click('[data-testid="telemetry-notice-off"]')
  await settleGone(page, notice, { timeoutMs: 8_000 })
}

async function openNav(page: Page): Promise<void> {
  await page.click(NAV('preferences'), { timeout: 30_000 })
  await page.click(RAIL, { timeout: 15_000 })
  await page.waitForSelector(PANE, { timeout: 15_000 })
}

/** The nav row ids in visual order, main list only (excludes the "More" collapse contents). */
function mainOrder(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const list = document.querySelector('.MuiDrawer-paper .MuiList-root')
    if (!list) return []
    return [...list.children]
      .map((el) => el.querySelector('[data-testid^="nav-"]')?.getAttribute('data-testid') ?? '')
      .filter((id) => id.startsWith('nav-') && id !== 'nav-more')
  })
}

async function stepDefault(page: Page): Promise<void> {
  check('a fresh install shows every nav row and no "More"', (await countOf(page, '[data-testid="nav-more"]')) === 0)
  check('overview is first', (await mainOrder(page))[0] === 'nav-overview')
  for (const v of ['combat', 'timers', 'buffs']) {
    check(`${v} is in the drawer`, (await countOf(page, NAV(v))) === 1)
  }
}

async function stepHideToOverflow(page: Page): Promise<void> {
  await openNav(page)
  await page.click('[data-testid="nav-cfg-show-timers"]', { timeout: 15_000 })
  await settle(() => countOf(page, NAV('timers')), (n) => n === 0, { timeoutMs: 10_000 })
  check('hiding Timers removes it from the main list', (await countOf(page, NAV('timers'))) === 0)
  check('…and a "More" row appears', (await countOf(page, '[data-testid="nav-more"]')) === 1)
  await page.click('[data-testid="nav-more"]', { timeout: 15_000 })
  await settle(() => countOf(page, NAV('timers')), (n) => n === 1, { timeoutMs: 10_000 })
  await page.click(NAV('timers'), { timeout: 15_000 })
  // assert we actually navigated — the timers view has its own testid; use whatever it is
  await page.waitForSelector('[data-testid="timers-view"]', { timeout: 15_000 }).catch(() => undefined)
  check('a hidden row is still fully navigable from "More"',
    (await page.evaluate(() => localStorage.getItem('eq.view'))) === 'timers')
}

async function stepReorder(page: Page): Promise<void> {
  await openNav(page)
  const before = await mainOrder(page)
  await page.click('[data-testid="nav-cfg-up-mobs"]', { timeout: 15_000 })
  await settle(() => mainOrder(page), (o) => JSON.stringify(o) !== JSON.stringify(before), { timeoutMs: 10_000 })
  const after = await mainOrder(page)
  check('moving Mobs up swaps it past its neighbour in the live drawer',
    after.indexOf('nav-mobs') < before.indexOf('nav-mobs'), `${before.join(',')} -> ${after.join(',')}`)
}

async function stepCompact(page: Page): Promise<void> {
  await openNav(page)
  const wide = await page.evaluate(() => document.querySelector('.MuiDrawer-paper')?.clientWidth ?? 0)
  await page.click('[data-testid="nav-cfg-density"] input[value="compact"]', { timeout: 15_000 })
  const narrow = await settle(
    () => page.evaluate(() => document.querySelector('.MuiDrawer-paper')?.clientWidth ?? 0),
    (w) => w > 0 && w < wide, { timeoutMs: 10_000 }
  )
  check('compact density shrinks the rail', narrow < wide, `${wide}px -> ${narrow}px`)
  check('…and the row labels are gone', (await page.evaluate(() =>
    !!document.querySelector('.MuiDrawer-paper [data-testid="nav-combat"]') &&
    !document.querySelector('.MuiDrawer-paper [data-testid="nav-combat"] .MuiListItemText-root'))))
  check('…while the row is still clickable by testid', (await countOf(page, NAV('combat'))) === 1)
}

async function stepReset(page: Page): Promise<void> {
  await openNav(page)
  await page.click('[data-testid="nav-cfg-reset"]', { timeout: 15_000 })
  await settle(() => countOf(page, '[data-testid="nav-more"]'), (n) => n === 0, { timeoutMs: 10_000 })
  check('reset restores every row to the main list', (await countOf(page, '[data-testid="nav-more"]')) === 0)
  check('…and clears the stored layout', (await page.evaluate(() => localStorage.getItem('eq.nav.layout'))) === null)
  check('…and the reset button disables itself',
    await page.evaluate(() => (document.querySelector('[data-testid="nav-cfg-reset"]') as HTMLButtonElement)?.disabled === true))
}

async function stepPersistsReload(page: Page): Promise<void> {
  await openNav(page)
  await page.click('[data-testid="nav-cfg-show-buffs"]', { timeout: 15_000 })
  await settle(() => countOf(page, NAV('buffs')), (n) => n === 0, { timeoutMs: 10_000 })
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForSelector(NAV('preferences'), { timeout: 60_000 })
  check('a hidden row is still hidden after a reload', (await countOf(page, NAV('buffs'))) === 0)
  check('…with "More" still present', (await countOf(page, '[data-testid="nav-more"]')) === 1)
}

async function main(): Promise<void> {
  buildIfStale()
  const consoleErrors: string[] = []
  const userData = makeUserData()
  const log = stageFixture('e2e-telemetry.log')
  const app = await launchOnFixture(log, { userData })
  try {
    const page = await mainWindow(app.app)
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })
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
    await app.close()
    await removeUserData(userData)
    await log.dispose()
  }
  check('no renderer console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))
  if (consoleErrors.length === 0) note('one launch: reorder / hide / compact / reset all applied live, plus a reload')
  reportRun()
}

main().catch((err: unknown) => {
  console.error('e2e: harness error —', err)
  process.exitCode = 1
})
```

**Before writing:** open an existing spec (`tests/e2e/text-size.e2e.mts`, `tests/e2e/overview.e2e.mts`) and confirm the exact harness import names and the fixture helper (`e2e-telemetry.log` is the standard staged log). Confirm the Timers view's real content testid (grep `data-testid` in `src/renderer/src/features/timers/TimersView.tsx`) and use it in `stepHideToOverflow` — fall back to the `eq.view` localStorage assertion, which is unconditional.

- [ ] **Step 2: Run the spec**

Run: `npm run test:e2e -- nav-customization`
Expected: PASS, all `check`s green, "no renderer console errors".

- [ ] **Step 3: Confirm the `NavDrawer` law comment is rewritten**

Verify the block described in Task 4 Step 1 is in place (order/visibility are user-owned; Gear is one row; a row is a destination). If Task 4 left it partial, finish it now.

- [ ] **Step 4: Full verification gauntlet**

Run: `npm run typecheck && npm run lint && npm test && npm run test:e2e`
Expected: all green. The full e2e sweep confirms no existing spec regressed.

- [ ] **Step 5: Commit + FINAL CHECKPOINT**

```bash
git add tests/e2e/nav-customization.e2e.mts src/renderer/src/components/NavDrawer.tsx
git commit -m "test(nav): e2e for reorder / hide / compact / reset; finalise drawer law comment"
```

**STOP. Report: full gauntlet green. Feature ready for integration review.**

---

## Self-Review (completed at plan-writing time)

**Spec coverage:**
- Reorder → Tasks 1 (`moveRow`), 3 (`move`), 6/4 (drawer order), 7 (arrows), 9 (e2e). ✅
- Hide/show + overflow → Tasks 1 (`toggleHidden`, `toMainOverflow`), 5 ("More"), 7 (switches), 9. ✅
- Compact density → Tasks 1 (`readNavDensity`), 3 (`useNavDensity`), 6 (width/tooltips), 7 (radio), 9. ✅
- Overview / Preferences / feedback pinned → Task 1 (`CUSTOMIZABLE_VIEWS` excludes them; test asserts it), Task 4 (overview prepended, bottom block untouched). ✅
- `vocab` degradation for future rows / stranger bundles → Task 1 (`parseNavLayout`, test). ✅
- Settings bundle → Task 8. ✅
- Cross-subtree live update → Tasks 2, 3 (`rawPref`), 9 (e2e asserts live). ✅
- Default = today's drawer → Task 4 Step 3 (full e2e, zero spec edits). ✅

**Placeholder scan:** the `tests/shareProfiles.test.mts` helper call in Task 8 Step 1 is marked "match the file's existing pattern" because that file's assembly helper name must be read from the file — the surrounding assertions (whitelist array, `body.ui` keys) are concrete. The Timers content testid in Task 9 is marked to confirm, with an unconditional `eq.view` fallback assertion given. No other placeholders.

**Type consistency:** `moveRow`/`toggleHidden`/`serializeNavLayout`/`parseNavLayout`/`resolveNavLayout`/`toMainOverflow`/`isDefaultLayout`/`readNavDensity` names are identical across Tasks 1, 3, 7. `NavRowMeta` (Task 4) is used in Tasks 4–6. `navDrawerWidth`/`COMPACT_DRAWER_WIDTH` defined and used in Task 6. `useNavLayout` return shape (`main/overflow/order/hidden/move/toggle/reset`) defined in Task 3, consumed in Tasks 4, 5, 7.

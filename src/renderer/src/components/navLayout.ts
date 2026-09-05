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

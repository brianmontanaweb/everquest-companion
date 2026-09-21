// THE Loot tables' sort orders, pure — both tables, driven by their column headers.
//
// Each table's order is a `ColumnSort` ({ key, dir }) that a header click produces through
// `nextSort`. This module owns every comparator, so the renderer's only `.sort()` over loot rows
// lives here, over the structural `Sortable*` shapes below — owner ruling 4's boundary law, ahead
// of JOS-459 cutover ledger item 3 (no served view source answers this yet).
//
// WHY THIS IS ITS OWN MODULE: lootGrouping imports lootItemData → data/index → `@shared/profiles`, a
// VALUE import that does not resolve outside the bundler, so node can never load it. The orders are
// the part worth pinning, so they live where `npm test` can reach them.
//
// EVERY COMPARATOR IS TOTAL. EQ log timestamps are SECOND-resolution, so a corpse that yields three
// items writes three lines with the same `ts` — ties are the common case. Each comparator runs its
// column, then fixed tiebreaks, and the grouped one bottoms out in the unique row key.
//
// BLANK TEXT SORTS LAST in both directions: an item with no known source is not "before A", and
// flipping to Z→A must not drag every blank row to the top. An inventory-only row (no loot history
// at all) is the numeric equivalent of a blank under the `count`/`last`/`zones` columns — see
// `sortGroupedRows` — and sinks the same way.
//
// THE FLAT LEDGER'S FINAL TIEBREAK IS LEDGER POSITION, NEVER TEXT. `filterLootEvents` hands this
// module its rows already reversed into newest-first, so a lower input index is a NEWER event —
// exactly like the engine's `loot.ledger`, whose default sort is `(at desc, seq desc)` and which
// bottoms out on `seq` for the same reason (`engine/crates/engined/src/views/loot.rs`): a corpse
// that drops three items in the same second still has a real order, the order the log wrote them
// in, and text is not it. `sortFlatEvents` decorates each row with its input index, sorts, and
// undecorates — see `byPosition` below for exactly what "same direction" means for the `time` column.
//
// JOS-459 CUTOVER NOTE: once the flat ledger takes a served sort descriptor instead of sorting here,
// its comparator will not be this one. The engine's own sort forbids locale collation (determinism
// is cacheability — `loot.rs`'s own header states the rule for its formatted cells) and ties texts
// on `seq` rather than on a collated string, so an item/from/zone order this module returns can
// differ from the engine's for two rows a locale collates as equal but `seq` does not. That
// difference is known and expected, not a bug to chase when the cutover lands.

export type SortDir = 'asc' | 'desc'

export interface ColumnSort<K extends string> {
  key: K
  dir: SortDir
}

/** The grouped table's columns, in header order. */
export type GroupedSortKey = 'item' | 'count' | 'inv' | 'source' | 'zones' | 'last'
/** The flat ledger's columns, in header order. */
export type FlatSortKey = 'time' | 'item' | 'from' | 'zone'

/** The direction a column takes on its FIRST click: numbers and times biggest/newest first, words
 *  A→Z. A second click on the active column flips it. */
export const GROUPED_FIRST_DIR: Readonly<Record<GroupedSortKey, SortDir>> = {
  item: 'asc',
  count: 'desc',
  inv: 'desc',
  source: 'asc',
  zones: 'desc',
  last: 'desc',
}
export const FLAT_FIRST_DIR: Readonly<Record<FlatSortKey, SortDir>> = {
  time: 'desc',
  item: 'asc',
  from: 'asc',
  zone: 'asc',
}

/** Times looted stays the grouped default — "what do I keep picking up" (JOS-91). */
export const DEFAULT_GROUPED_SORT: ColumnSort<GroupedSortKey> = { key: 'count', dir: 'desc' }
/** The flat ledger is chronological by default: newest first, exactly as it always was. */
export const DEFAULT_FLAT_SORT: ColumnSort<FlatSortKey> = { key: 'time', dir: 'desc' }

/** What a header click does: the active column flips; any other column takes its first-click
 *  direction. */
export function nextSort<K extends string>(
  current: ColumnSort<K>,
  clicked: K,
  firstDir: Readonly<Record<K, SortDir>>,
): ColumnSort<K> {
  if (current.key === clicked) return { key: clicked, dir: current.dir === 'asc' ? 'desc' : 'asc' }
  return { key: clicked, dir: firstDir[clicked] }
}

/** The part of a grouped row the comparators read — structural, so this module never imports
 *  lootGrouping. `key` is unique per row and is the final tiebreak. */
export interface SortableLootRow {
  key: string
  item: string
  /** Times looted — stacked loots count their stack size. */
  count: number
  /** Epoch ms of the newest loot in the group. */
  last: number
  topSource?: string
  zoneCount: number
  /** Held per the inventory export but never looted this epoch (`count`/`last`/`zoneCount` are all
   *  0 and the row renders "-" in those columns). Blank under those three sorts — see
   *  `invOnlyLast` — but a real row everywhere else, because `inv`, `item` and `source` all have
   *  values on it. */
  invOnly?: boolean
}

/** The part of a loot event the flat ledger's comparators read. */
export interface SortableLootEvent {
  ts: number
  item: string
  source?: string
  zone?: string
}

type Cmp<T> = (a: T, b: T) => number

/** One collator for every text comparison in this module — a single Intl instance instead of a
 *  `localeCompare` call per site, and the one place JOS-459's cutover note above points at. */
const collator = new Intl.Collator()

function byNum(a: number, b: number, dir: SortDir): number {
  return dir === 'asc' ? a - b : b - a
}

function isBlank(s: string | undefined): s is undefined {
  return s === undefined || s === ''
}

/** Text in the chosen direction, blanks last whichever direction that is. */
function byText(a: string | undefined, b: string | undefined, dir: SortDir): number {
  if (isBlank(a) || isBlank(b)) return isBlank(a) === isBlank(b) ? 0 : isBlank(a) ? 1 : -1
  return dir === 'asc' ? collator.compare(a, b) : collator.compare(b, a)
}

/** Code-unit order: never 0 for two different strings, which localeCompare can be. */
function byCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** An inventory-only row is the numeric blank for `count`/`last`/`zones` (module header): it sinks
 *  to the bottom in BOTH directions. `null` means "neither row is inventory-only, keep comparing" —
 *  the caller's `??` falls through to the real numeric compare, exactly like `isBlank` inside
 *  `byText` above. Both `invOnly` ⇒ 0, so the column's own tiebreaks (below `groupedPrimary`) decide
 *  between two inventory-only rows rather than this rule pretending to. */
function invOnlyLast<T extends SortableLootRow>(a: T, b: T): number | null {
  if (a.invOnly !== true && b.invOnly !== true) return null
  if (a.invOnly === b.invOnly) return 0
  return a.invOnly === true ? 1 : -1
}

function groupedPrimary<T extends SortableLootRow>(
  sort: ColumnSort<GroupedSortKey>,
  invOf: (r: T) => number,
): Cmp<T> {
  const d = sort.dir
  switch (sort.key) {
    case 'item':
      return (a, b) => byText(a.item, b.item, d)
    case 'count':
      return (a, b) => invOnlyLast(a, b) ?? byNum(a.count, b.count, d)
    case 'inv':
      return (a, b) => byNum(invOf(a), invOf(b), d)
    case 'source':
      return (a, b) => byText(a.topSource, b.topSource, d)
    case 'zones':
      return (a, b) => invOnlyLast(a, b) ?? byNum(a.zoneCount, b.zoneCount, d)
    case 'last':
      return (a, b) => invOnlyLast(a, b) ?? byNum(a.last, b.last, d)
  }
}

/** Non-mutating. `invOf` is the "In inventory (est.)" figure, the same one the row displays. */
export function sortGroupedRows<T extends SortableLootRow>(
  rows: readonly T[],
  sort: ColumnSort<GroupedSortKey>,
  invOf: (r: T) => number,
): T[] {
  const primary = groupedPrimary(sort, invOf)
  return [...rows].sort(
    (a, b) =>
      primary(a, b) ||
      b.count - a.count ||
      b.last - a.last ||
      collator.compare(a.item, b.item) ||
      byCodeUnits(a.key, b.key),
  )
}

function flatPrimary<T extends SortableLootEvent>(sort: ColumnSort<FlatSortKey>): Cmp<T> {
  const d = sort.dir
  switch (sort.key) {
    case 'time':
      return (a, b) => byNum(a.ts, b.ts, d)
    case 'item':
      return (a, b) => byText(a.item, b.item, d)
    case 'from':
      return (a, b) => byText(a.source, b.source, d)
    case 'zone':
      return (a, b) => byText(a.zone, b.zone, d)
  }
}

/** The ledger-position tiebreak (module header). `desc` keeps the input order — the lower index
 *  comes first, exactly as `filterLootEvents` handed the rows over; `asc` reverses it — the higher
 *  index comes first, because flipping newest-first to oldest-first must flip its ties too. */
function byPosition(aIndex: number, bIndex: number, dir: SortDir): number {
  return dir === 'desc' ? aIndex - bIndex : bIndex - aIndex
}

/**
 * Non-mutating. Under whatever column was chosen, then this fixed chain of tiebreaks:
 *
 *   - `time`: ties break on ledger position, in the SAME direction as the column (`byPosition`).
 *   - `item`/`from`/`zone`: ties on that column's text break on `ts` descending (newest first,
 *     regardless of the column's own direction), then on ledger position — always the lower index
 *     first, i.e. always in input order, because that is what the engine's own `seq desc` tiebreak
 *     means once `filterLootEvents`'s reversal is undone.
 *
 * Never text. Two events tied on every visible column are identical on screen, and only their
 * position in the ledger says which the log actually wrote first.
 */
export function sortFlatEvents<T extends SortableLootEvent>(
  rows: readonly T[],
  sort: ColumnSort<FlatSortKey>,
): T[] {
  const primary = flatPrimary<T>(sort)
  const decorated = rows.map((row, index) => ({ row, index }))
  decorated.sort((a, b) => {
    const byColumn = primary(a.row, b.row)
    if (byColumn !== 0) return byColumn
    if (sort.key === 'time') return byPosition(a.index, b.index, sort.dir)
    return b.row.ts - a.row.ts || byPosition(a.index, b.index, 'desc')
  })
  return decorated.map((d) => d.row)
}

// ---- persistence ------------------------------------------------------------------------------

const GROUPED_KEYS = Object.keys(GROUPED_FIRST_DIR) as GroupedSortKey[]
const FLAT_KEYS = Object.keys(FLAT_FIRST_DIR) as FlatSortKey[]

/** Stored values are JSON; the dropdown era stored a bare word, which JSON.parse rejects. */
function parseStored(raw: string | null): unknown {
  if (raw === null) return null
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return raw
  }
}

function sanitizeColumnSort<K extends string>(
  v: unknown,
  keys: readonly K[],
  fallback: ColumnSort<K>,
): ColumnSort<K> {
  if (typeof v !== 'object' || v === null) return fallback
  const { key, dir } = v as { key?: unknown; dir?: unknown }
  if (!keys.includes(key as K) || (dir !== 'asc' && dir !== 'desc')) return fallback
  return { key: key as K, dir }
}

/** `eq.lootSort`. The Sort dropdown (JOS-91) stored `count` or `recent`; both migrate. */
export function sanitizeGroupedSort(raw: string | null): ColumnSort<GroupedSortKey> {
  const v = parseStored(raw)
  if (v === 'count') return DEFAULT_GROUPED_SORT
  if (v === 'recent') return { key: 'last', dir: 'desc' }
  return sanitizeColumnSort(v, GROUPED_KEYS, DEFAULT_GROUPED_SORT)
}

/** `eq.lootFlatSort`. */
export function sanitizeFlatSort(raw: string | null): ColumnSort<FlatSortKey> {
  return sanitizeColumnSort(parseStored(raw), FLAT_KEYS, DEFAULT_FLAT_SORT)
}

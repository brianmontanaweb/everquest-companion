// LOOT-TABLE SORT TEST: the header-driven orders of both Loot tables (grouped + flat ledger).
//
// Pins:
//   - the DEFAULTS are the orders the tables always had: grouped = Times looted desc, flat = newest
//     first — so moving the control into the headers re-ordered nobody's table;
//   - FIRST CLICK direction per column (numbers/times biggest-newest first, words A→Z), and a second
//     click on the active column flips it;
//   - every comparator is TOTAL (EQ timestamps are second-resolution — ties are the common case);
//   - blank text (no Top source / From / Zone) sorts LAST in both directions;
//   - the saved `eq.lootSort` from the dropdown era ('count' / 'recent') migrates, and garbage falls
//     back to the default rather than sorting by nothing.
//
// Why this is tested here and not through groupLootRows: lootGrouping imports lootItemData →
// data/index → `@shared/profiles`, which node cannot load (MODULE_NOT_FOUND). The orders live in
// the pure module so `npm test` can reach them.
//
// Run: `npm test`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_FLAT_SORT,
  DEFAULT_GROUPED_SORT,
  FLAT_FIRST_DIR,
  GROUPED_FIRST_DIR,
  nextSort,
  sanitizeFlatSort,
  sanitizeGroupedSort,
  sortFlatEvents,
  sortGroupedRows,
  type ColumnSort,
  type GroupedSortKey,
  type SortableLootEvent,
  type SortableLootRow,
} from '../src/renderer/src/features/loot/lootSort'

function row(
  item: string,
  count: number,
  last: number,
  extra: Partial<SortableLootRow> = {},
): SortableLootRow {
  return { key: item.toLowerCase(), item, count, last, zoneCount: 1, ...extra }
}
function ev(item: string, ts: number, source?: string, zone?: string): SortableLootEvent {
  return { item, ts, source, zone }
}
const names = (list: { item: string }[]): string[] => list.map((r) => r.item)
const noInv = (): number => 0
const g = (key: GroupedSortKey, dir: 'asc' | 'desc'): ColumnSort<GroupedSortKey> => ({ key, dir })

test('defaults are the orders the tables always had', () => {
  assert.deepEqual(DEFAULT_GROUPED_SORT, { key: 'count', dir: 'desc' })
  assert.deepEqual(DEFAULT_FLAT_SORT, { key: 'time', dir: 'desc' })
})

test('nextSort: a new column takes its first-click direction; the active one flips', () => {
  const start = DEFAULT_GROUPED_SORT
  assert.deepEqual(nextSort(start, 'item', GROUPED_FIRST_DIR), { key: 'item', dir: 'asc' })
  assert.deepEqual(nextSort(start, 'last', GROUPED_FIRST_DIR), { key: 'last', dir: 'desc' })
  assert.deepEqual(nextSort(start, 'count', GROUPED_FIRST_DIR), { key: 'count', dir: 'asc' })
  const flipped = nextSort(start, 'count', GROUPED_FIRST_DIR)
  assert.deepEqual(nextSort(flipped, 'count', GROUPED_FIRST_DIR), start)
  assert.deepEqual(nextSort(DEFAULT_FLAT_SORT, 'zone', FLAT_FIRST_DIR), { key: 'zone', dir: 'asc' })
})

test('grouped count desc: most-looted first, ties newer then name (unchanged behaviour)', () => {
  const list = [
    row('Older five', 5, 100),
    row('Newer five', 5, 900),
    row('Another five', 5, 900),
    row('Rune Word', 12, 50),
  ]
  assert.deepEqual(names(sortGroupedRows(list, g('count', 'desc'), noInv)), [
    'Rune Word',
    'Another five',
    'Newer five',
    'Older five',
  ])
})

test('grouped last desc: newest group first, second-resolution ties break on count then name', () => {
  const ts = 1_700_000_000_000
  const list = [
    row('Zebra Hide', 2, ts),
    row('Alpha Rune', 2, ts),
    row('Mid Stone', 9, ts),
    row('Old', 40, 10),
  ]
  assert.deepEqual(names(sortGroupedRows(list, g('last', 'desc'), noInv)), [
    'Mid Stone',
    'Alpha Rune',
    'Zebra Hide',
    'Old',
  ])
})

test('grouped: every column sorts in both directions', () => {
  const a = row('Alpha', 1, 300, { topSource: 'a gnoll', zoneCount: 3 })
  const b = row('Bravo', 2, 200, { topSource: 'a bat', zoneCount: 1 })
  const c = row('Charlie', 3, 100, { topSource: 'a cat', zoneCount: 2 })
  const inv = new Map([
    ['alpha', 10],
    ['bravo', 30],
    ['charlie', 20],
  ])
  const invOf = (r: SortableLootRow): number => inv.get(r.key) ?? 0
  const cases: [GroupedSortKey, string[]][] = [
    ['item', ['Alpha', 'Bravo', 'Charlie']],
    ['count', ['Alpha', 'Bravo', 'Charlie']],
    ['inv', ['Alpha', 'Charlie', 'Bravo']],
    ['source', ['Bravo', 'Charlie', 'Alpha']],
    ['zones', ['Bravo', 'Charlie', 'Alpha']],
    ['last', ['Charlie', 'Bravo', 'Alpha']],
  ]
  for (const [key, asc] of cases) {
    assert.deepEqual(names(sortGroupedRows([c, a, b], g(key, 'asc'), invOf)), asc, `${key} asc`)
    assert.deepEqual(
      names(sortGroupedRows([a, b, c], g(key, 'desc'), invOf)),
      [...asc].reverse(),
      `${key} desc`,
    )
  }
})

test('grouped: a blank Top source sorts last in BOTH directions', () => {
  const none = row('No source', 1, 1)
  const list = [
    none,
    row('Has A', 1, 1, { topSource: 'a' }),
    row('Has B', 1, 1, { topSource: 'b' }),
  ]
  assert.deepEqual(names(sortGroupedRows(list, g('source', 'asc'), noInv)).at(-1), 'No source')
  assert.deepEqual(names(sortGroupedRows(list, g('source', 'desc'), noInv)).at(-1), 'No source')
})

test('grouped: an inventory-only row sinks below every looted row, in BOTH directions, under count/last/zones', () => {
  const looted = row('Looted', 3, 500, { zoneCount: 2 })
  const invOnly = row('Held Only', 0, 0, { zoneCount: 0, invOnly: true })
  const cases: [GroupedSortKey, 'asc' | 'desc'][] = [
    ['count', 'asc'],
    ['count', 'desc'],
    ['last', 'asc'],
    ['zones', 'asc'],
  ]
  for (const [key, dir] of cases) {
    assert.deepEqual(
      names(sortGroupedRows([invOnly, looted], g(key, dir), noInv)),
      ['Looted', 'Held Only'],
      `${key} ${dir}`,
    )
  }
})

test('grouped: two inventory-only rows under count/last/zones fall back to the ordinary tiebreaks', () => {
  const a = row('Alpha Held', 0, 0, { zoneCount: 0, invOnly: true })
  const b = row('Bravo Held', 0, 0, { zoneCount: 0, invOnly: true })
  // Both invOnly ⇒ the primary returns a tie, and the fixed tiebreak chain (count, last, item name)
  // decides — here every one of those is equal too, so it falls through to item name.
  assert.deepEqual(names(sortGroupedRows([b, a], g('count', 'asc'), noInv)), [
    'Alpha Held',
    'Bravo Held',
  ])
})

test('grouped: every order is TOTAL — input order never decides', () => {
  const build = (): SortableLootRow[] => [
    row('Alpha', 5, 500),
    row('Beta', 5, 500),
    row('Gamma', 5, 500),
    row('gamma', 5, 500, { key: 'gamma#2' }), // same name modulo case, distinct key — the key is the last resort
  ]
  for (const key of Object.keys(GROUPED_FIRST_DIR) as GroupedSortKey[]) {
    for (const dir of ['asc', 'desc'] as const) {
      const fwd = names(sortGroupedRows(build(), g(key, dir), noInv))
      const rev = names(sortGroupedRows([...build()].reverse(), g(key, dir), noInv))
      assert.deepEqual(rev, fwd, `${key} ${dir} is order-dependent`)
    }
  }
})

test('flat time desc is the ledger as it always was: newest first', () => {
  const list = [ev('Mid', 200), ev('New', 300), ev('Old', 100)]
  assert.deepEqual(names(sortFlatEvents(list, DEFAULT_FLAT_SORT)), ['New', 'Mid', 'Old'])
  assert.deepEqual(names(sortFlatEvents(list, { key: 'time', dir: 'asc' })), ['Old', 'Mid', 'New'])
})

test('flat: item / from / zone sort A→Z with newest-first underneath; blanks last', () => {
  const list = [
    ev('Bone Chips', 100, 'a skeleton', 'Befallen'),
    ev('Bone Chips', 300, 'a skeleton', 'Befallen'),
    ev('Alpha Rune', 200, undefined, undefined),
    ev('Zebra Hide', 50, 'a zebra', 'Kithicor'),
  ]
  const itemAsc = sortFlatEvents(list, { key: 'item', dir: 'asc' })
  assert.deepEqual(
    itemAsc.map((e) => `${e.item}@${String(e.ts)}`),
    ['Alpha Rune@200', 'Bone Chips@300', 'Bone Chips@100', 'Zebra Hide@50'],
  )
  assert.equal(sortFlatEvents(list, { key: 'from', dir: 'asc' }).at(-1)?.item, 'Alpha Rune')
  assert.equal(sortFlatEvents(list, { key: 'zone', dir: 'desc' }).at(-1)?.item, 'Alpha Rune')
  assert.equal(sortFlatEvents(list, { key: 'zone', dir: 'desc' })[0]?.zone, 'Kithicor')
})

test('flat time ties break on LEDGER POSITION: input order under desc, reversed under asc', () => {
  // Three same-second loots, in the newest-first input order `filterLootEvents` always hands this
  // module (reversed history). No text tiebreak survives on a full `ts` tie any more — position is
  // the whole story.
  const ts = 1_700_000_000_000
  const list = [ev('Zebra Hide', ts), ev('Alpha Rune', ts), ev('Bone Chips', ts)]
  assert.deepEqual(
    names(sortFlatEvents(list, DEFAULT_FLAT_SORT)),
    ['Zebra Hide', 'Alpha Rune', 'Bone Chips'],
    'desc keeps the input order',
  )
  assert.deepEqual(
    names(sortFlatEvents(list, { key: 'time', dir: 'asc' })),
    ['Bone Chips', 'Alpha Rune', 'Zebra Hide'],
    'asc is exactly reversed',
  )
})

test('flat item/from/zone ties (same text, same ts) also keep ledger position, never text', () => {
  const ts = 1_700_000_000_000
  const list = [
    ev('Bone Chips', ts, 'a skeleton', 'Befallen'),
    ev('Bone Chips', ts, 'a bat', 'Kithicor'),
    ev('Bone Chips', ts, 'a rat', 'Blackburrow'),
  ]
  // Alphabetically "a bat" < "a rat" < "a skeleton" — if From/Zone still broke the tie, this would
  // come back reordered. It must not: every row shares item AND ts, so only input position is left.
  assert.deepEqual(
    sortFlatEvents(list, { key: 'item', dir: 'asc' }).map((e) => e.source),
    ['a skeleton', 'a bat', 'a rat'],
  )
})

test('sorting never mutates its input', () => {
  const rows = [row('Second', 1, 1), row('First', 9, 9)]
  const before = names(rows)
  const out = sortGroupedRows(rows, DEFAULT_GROUPED_SORT, noInv)
  assert.deepEqual(names(rows), before)
  assert.notEqual(out, rows)
  const evs = [ev('a', 1), ev('b', 2)]
  assert.notEqual(sortFlatEvents(evs, DEFAULT_FLAT_SORT), evs)
  assert.deepEqual(names(evs), ['a', 'b'])
})

test('stored grouped sort: new JSON round-trips, dropdown-era values migrate, junk falls back', () => {
  assert.deepEqual(sanitizeGroupedSort(JSON.stringify({ key: 'zones', dir: 'asc' })), {
    key: 'zones',
    dir: 'asc',
  })
  assert.deepEqual(sanitizeGroupedSort('count'), { key: 'count', dir: 'desc' })
  assert.deepEqual(sanitizeGroupedSort('recent'), { key: 'last', dir: 'desc' })
  assert.deepEqual(sanitizeGroupedSort(null), DEFAULT_GROUPED_SORT)
  assert.deepEqual(sanitizeGroupedSort('by-vibes'), DEFAULT_GROUPED_SORT)
  assert.deepEqual(sanitizeGroupedSort('{"key":"time","dir":"asc"}'), DEFAULT_GROUPED_SORT)
  assert.deepEqual(sanitizeGroupedSort('{"key":"count","dir":"up"}'), DEFAULT_GROUPED_SORT)
})

test('stored flat sort: round-trips, junk falls back', () => {
  assert.deepEqual(sanitizeFlatSort('{"key":"from","dir":"desc"}'), { key: 'from', dir: 'desc' })
  assert.deepEqual(sanitizeFlatSort(null), DEFAULT_FLAT_SORT)
  assert.deepEqual(sanitizeFlatSort('{"key":"count","dir":"desc"}'), DEFAULT_FLAT_SORT)
})

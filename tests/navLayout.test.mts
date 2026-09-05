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

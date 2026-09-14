// TURN-IN DETECTION + CELEBRATION TEST (Task #46, JOS-131): the pure baseline-guarded "which
// quests just gained a turn-in" core that PoskyView (confetti) + App (snackbar + questComplete
// sound + the celebration toast) fire on. Mirrors the boss-defeat baseline contract:
// the historical set is seeded silently and NEVER celebrated; only a transition after
// the baseline fires.
//
// JOS-131 TURNED THE FLAG INTO A COUNT. A Sky quest can be run again, so the detector reports
// INSTANTS per quest and the celebration compares COUNTS: the second turn-in of a quest you had
// already done is a live transition too, which is the boss watch's rule ("every time is worth
// celebrating") applied here.
//
// Also replays the REAL matcher (countTurnIns) over synthetic turn-in events to
// prove the end-to-end path: a live turn-in of the exact required set (incl. a +N variant
// normalized at the boundary) is detected, and reload/hydration does not celebrate.
//
// Run: `npm test`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  countTurnIns,
  newlyCompletedTurnIns,
} from '../src/renderer/src/features/posky/turnInCelebration'
import { questKey } from '../src/renderer/src/features/posky/keys'
import poskyRaw from '../src/renderer/src/data/eqlegends/posky.json' with { type: 'json' }
import type { PoskyQuest, TurnInEvent, TurnInItemOffer } from '../src/shared/types'

const quests = (poskyRaw as { quests: PoskyQuest[] }).quests
const monkFists = quests.find((q) => q.name === 'Monk Test of Fists')!

/** Quest key → how many times, which is what the celebration compares. */
const counts = (instants: Record<string, number[]>): Record<string, number> =>
  Object.fromEntries(Object.entries(instants).map(([k, v]) => [k, v.length]))

/** The ordinary trade shape: every named item, one copy each — what most fixtures below want. */
const offer = (names: readonly string[]): TurnInItemOffer[] =>
  names.map((name) => ({ name, count: 1 }))

test('baseline run (prev == null) celebrates NOTHING — historical counts seeded silently', () => {
  const historical = { 'Monk::Monk Test of Fists': 1, 'Warrior::Warrior Test of Bash': 3 }
  assert.deepEqual(newlyCompletedTurnIns(null, historical), [])
})

test('a quest whose count grew after the baseline is a live transition', () => {
  const baseline = { 'Monk::Monk Test of Fists': 1 }
  const next = { 'Monk::Monk Test of Fists': 1, 'Warrior::Warrior Test of Bash': 1 }
  assert.deepEqual(newlyCompletedTurnIns(baseline, next), [
    { key: 'Warrior::Warrior Test of Bash', count: 1 },
  ])
})

test('THE JOS-131 CASE: a SECOND turn-in of a quest already done celebrates, at count 2', () => {
  const baseline = { 'Monk::Monk Test of Fists': 1 }
  const again = { 'Monk::Monk Test of Fists': 2 }
  assert.deepEqual(newlyCompletedTurnIns(baseline, again), [
    { key: 'Monk::Monk Test of Fists', count: 2 },
  ])
})

test('exactly-once per turn-in: an unchanged count never re-fires', () => {
  // Simulate the ref update the hook does: after firing, the baseline becomes `next`.
  let baseline: Record<string, number> | null = { 'Monk::Monk Test of Fists': 1 }
  const afterTurnIn = { 'Monk::Monk Test of Fists': 1, 'Warrior::Warrior Test of Bash': 1 }
  assert.deepEqual(newlyCompletedTurnIns(baseline, afterTurnIn), [
    { key: 'Warrior::Warrior Test of Bash', count: 1 },
  ])
  baseline = afterTurnIn // hook advances the baseline ref
  // A later observation with the SAME counts (e.g. a re-render / another delta) → nothing.
  assert.deepEqual(newlyCompletedTurnIns(baseline, afterTurnIn), [])
  // A new quest still fires, and the already-fired one still does not.
  const more = { ...afterTurnIn, 'Cleric::Cleric Test of Theurgy': 1 }
  assert.deepEqual(newlyCompletedTurnIns(baseline, more), [
    { key: 'Cleric::Cleric Test of Theurgy', count: 1 },
  ])
})

test('a count that jumps by two reports ONE transition, at the new count', () => {
  // A catch-up delta (two turn-ins in one snapshot) is one thing that happened, reported with
  // the honest number rather than as two bursts.
  assert.deepEqual(newlyCompletedTurnIns({ 'A::Qa': 1 }, { 'A::Qa': 3 }), [
    { key: 'A::Qa', count: 3 },
  ])
})

test('multiple simultaneous completions all fire once', () => {
  const next = { 'A::Qa': 1, 'B::Qb': 1, 'C::Qc': 1 }
  assert.deepEqual(
    newlyCompletedTurnIns({}, next)
      .map((t) => t.key)
      .sort(),
    ['A::Qa', 'B::Qb', 'C::Qc'],
  )
})

test('a count that DROPS (an undone turn-in) fires nothing', () => {
  assert.deepEqual(newlyCompletedTurnIns({ 'A::Qa': 2, 'B::Qb': 1 }, { 'A::Qa': 1 }), [])
})

// ---- end-to-end over the REAL posky.json (Brass Knuckles data completeness, Task #46) ----

test('Monk Test of Fists now requires Brass Knuckles (efreeti-cycle item restored)', () => {
  const names = monkFists.items.map((i) => i.name)
  assert.ok(names.includes('Brass Knuckles'), 'Brass Knuckles is a required turn-in item')
  assert.ok(names.includes('Nebulous Sapphire'), 'Nebulous Sapphire still required (unchanged)')
  assert.equal(monkFists.giver, 'Holwin')
})

test('a live turn-in of the exact required set is detected (incl. +N normalization)', () => {
  const required = monkFists.items.map((i) => i.name)
  // The user looted a `Brass Knuckles +2` variant — offering it must still satisfy the
  // base requirement (itemCountKey folds the +N suffix, Task #42). Swap in the variant.
  const requiredNames = required.map((n) => (n === 'Brass Knuckles' ? 'Brass Knuckles +2' : n))
  const turnIn: TurnInEvent = { ts: 1_700_000_000_000, npc: 'Holwin', items: offer(requiredNames) }

  const detected = countTurnIns([turnIn], quests)
  assert.deepEqual(
    detected.instants[questKey(monkFists)],
    [turnIn.ts],
    'the +2 turn-in matches the base requirement, and the INSTANT is what is reported',
  )

  // Baseline-guarded celebration: seed silent on load, fire on the live transition.
  assert.deepEqual(
    newlyCompletedTurnIns(null, counts(detected.instants)),
    [],
    'load never celebrates',
  )
  assert.deepEqual(newlyCompletedTurnIns({}, counts(detected.instants)), [
    { key: questKey(monkFists), count: 1 },
  ])
})

test('TWO turn-ins of the same quest are TWO instants, not one flag', () => {
  const requiredNames = monkFists.items.map((i) => i.name)
  const detected = countTurnIns(
    [
      { ts: 1_700_000_000_000, npc: 'Holwin', items: offer(requiredNames) },
      { ts: 1_700_000_600_000, npc: 'Holwin', items: offer(requiredNames) },
    ],
    quests,
  )
  assert.deepEqual(detected.instants[questKey(monkFists)], [1_700_000_000_000, 1_700_000_600_000])
  assert.equal(
    counts(detected.instants)[questKey(monkFists)],
    2,
    'the count is what the badge says',
  )
})

test('an incomplete turn-in (missing Brass Knuckles) is NOT detected', () => {
  const partial = monkFists.items.filter((i) => i.name !== 'Brass Knuckles').map((i) => i.name)
  const detected = countTurnIns([{ ts: 1, npc: 'Holwin', items: offer(partial) }], quests)
  assert.equal(
    detected.instants[questKey(monkFists)],
    undefined,
    'missing an item ⇒ not detected now Brass Knuckles is required',
  )
})

// ---- the Sky over-hand-in bug (JOS report, 2026-09): what the trade ACTUALLY offered ----

test('THE OVER-HAND-IN: two copies in one slot are recorded, not collapsed to presence', () => {
  const requiredNames = monkFists.items.map((i) => i.name)
  const items = offer(requiredNames)
  const brassKnuckles = items.find((i) => i.name === 'Brass Knuckles')
  assert.ok(brassKnuckles)
  brassKnuckles.count = 2 // one `You offered 2 Brass Knuckles to Holwin.` line
  const turnIn: TurnInEvent = { ts: 1_700_000_000_000, npc: 'Holwin', items }

  const detected = countTurnIns([turnIn], quests)
  const key = questKey(monkFists)
  assert.deepEqual(detected.instants[key], [turnIn.ts], 'still one turn-in, matched as ever')
  assert.equal(
    detected.offered[key]?.[turnIn.ts]?.['brass knuckles'],
    2,
    'but the offered map remembers the trade held two, not one',
  )
  // Every OTHER required item in the same trade reads its ordinary count of 1.
  assert.equal(detected.offered[key]?.[turnIn.ts]?.['nebulous sapphire'], 1)
})

test('two separate offer lines for the same item SUM into the offered map', () => {
  // The real multi-slot transcript shape (page-15270.wikitext): the game prints one line per
  // slot, not one line with a bigger number, whenever the copies went into separate slots.
  const requiredNames = monkFists.items.map((i) => i.name)
  const items = [...offer(requiredNames), { name: 'Brass Knuckles', count: 1 }]
  const turnIn: TurnInEvent = { ts: 1_700_000_000_000, npc: 'Holwin', items }
  const detected = countTurnIns([turnIn], quests)
  assert.equal(
    detected.offered[questKey(monkFists)]?.[turnIn.ts]?.['brass knuckles'],
    2,
    'two lines naming the same item sum, the same as one line saying 2',
  )
})

test('the ordinary one-for-one trade still records exactly 1 per item — no phantom excess', () => {
  const requiredNames = monkFists.items.map((i) => i.name)
  const turnIn: TurnInEvent = { ts: 1_700_000_000_000, npc: 'Holwin', items: offer(requiredNames) }
  const byItem = countTurnIns([turnIn], quests).offered[questKey(monkFists)]?.[turnIn.ts]
  assert.ok(byItem)
  assert.ok(
    Object.values(byItem).every((n) => n === 1),
    'every required item reads exactly 1 when the trade offered exactly 1',
  )
})

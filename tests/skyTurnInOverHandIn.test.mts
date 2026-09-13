// ============================================================================
// THE OVER-HAND-IN FIX — a trade that gave away TWO copies now costs the model two, not one.
// ============================================================================
//
// THE BUG (Plane of Sky tab). Every class Test in the Sky set requires exactly ONE wind rune, and
// the rune is the set's currency (sharedItems.ts: "every class Test also turns in a wind rune",
// which is why runes are excluded from the contention map). Runes are stackable currency-tab items
// (heldCounts.ts, disposition 'currency'), so a player farming Sky holds several copies of one rune
// at a time. Drop two Wind Rune Heda into Cilin Spellsinger's trade window instead of one, complete
// the trade, and the game takes BOTH — but until this fix, the model only ever charged the quest
// for one, leaving a PHANTOM copy in every count that read that rune.
//
// THE LOG ALWAYS SAID HOW MANY. The line shape is `You offered <N> <Item> to <NPC>.`
// (engine/crates/eqlog/src/parse/world.rs, the `offer` regex) and the app threw the number away in
// three places, any one of which would have been enough to lose it:
//
//   1. THE PARSER used to match `[0-9,]+` without capturing it. Fixed: the count is now Key::Count
//      on the Offer event, the same way the destroy line's count always was.
//   2. THE RENDERER'S MATCHER (`countTurnIns`) used to fold `t.items` into a `Set` and match on
//      presence alone, discarding a duplicate. Fixed: it now sums the quantity per item and returns
//      it alongside the instants (`DetectedTurnIns.offered`, shared/questTurnIns.ts's `TurnInOffered`
//      ledger).
//   3. RECONCILE used to subtract `required x times` with no way to charge for more. Fixed: a new
//      `excessConsumption` pass (reconcile.ts) reads the offered map and charges the DIFFERENCE as
//      an additive correction on top of the ordinary subtraction.
//
// The real multi-slot shape this exercises is not hypothetical — the pipeline is proven against
// `page-15270.wikitext:100-103`'s three repeated `You offered 1 Scrrrumptious Fish Meat to Feren.`
// lines at the parser/ledger layer (tests/turnInCelebration.test.mts), and the OFFERED-MAP
// PLUMBING is what this file exercises end to end through `reconcile`.
//
// This is the JOS-403 report's shape ("items I turned in are not deleted from the tracker even
// though they are gone from my inventory") arriving through a door that ticket did not cover.
// JOS-403 fixed WHEN a turn-in is subtracted (the dump owes the turn-ins made after it); this file
// is about HOW MUCH one turn-in subtracts, which had been a flat `required x times` since JOS-131
// made a turn-in a count.
//
// WHY IT IS ITS OWN FILE rather than a section of tests/skyTurnInAfterDump.test.mts: that file pins
// a WINDOW (which turn-ins a witness owes) and this one pins a MAGNITUDE (what one turn-in costs).
// They fail independently, and a change to either leaves the other exactly as it was.
//
// WHAT THIS PINS:
//
//   1. THE REPORT, AS ARITHMETIC. Two runes looted, both handed over in one trade → 0 held. Under
//      `log`, the source that consults no dump at all, so the claim is about consumption and
//      nothing else — and under `both`, the production default, with no dump involved at all.
//   2. THE TWO TRADES ARE DISTINGUISHABLE. Handing over one rune and handing over two leave
//      different counts behind.
//   3. THE ORDINARY TRADE IS UNCHANGED. One rune in, the spare still yours — the regression guard
//      against over-subtracting, the failure the owner ruled against on 2026-08-09 (a count that is
//      too low silently eats the next copy you farm).
//   4. THE CURRENCY CONSEQUENCE. The phantom rune no longer arms the OTHER class Test that wants
//      that rune.
//   5. THE WORKAROUND still works (a fresh dump under `inventory`/`rebaseline`), and the DEFAULT
//      source no longer needs it — the log witness itself is fixed, so `both`'s max reads correctly
//      either way.
//
// Run: `npm test`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reconcile, type ReconcileInput } from '../src/renderer/src/features/inventory/reconcile'
import { computeHeldCounts } from '../src/renderer/src/features/posky/heldCounts'
import { countTurnIns } from '../src/renderer/src/features/posky/turnInCelebration'
import { itemCountKey } from '../src/renderer/src/lib/itemName'
import poskyRaw from '../src/renderer/src/data/eqlegends/posky.json' with { type: 'json' }
import type { LootEvent, PoskyQuest, TurnInEvent } from '../src/shared/types'

// SYNTHETIC quests, spelled to the REAL shape of the two Tests that contend for a Wind Rune Heda —
// same givers, same requirement lists. Synthetic for the reason tests/skyTurnInAfterDump.test.mts
// states: the claim is arithmetic over required counts, and a re-scrape of posky.json must not be
// able to move it under the assertion. The shape is copied faithfully because the first draft of
// this file invented a one-item quest at the same giver, and `countTurnIns` matched it off the same
// trade — a confounder the real data cannot produce (no Sky quest requires a rune alone, and two
// Tests at one giver never want the SAME rune).
const HARMONY: PoskyQuest = {
  className: 'Bard',
  name: 'Bard Test of Harmony',
  giver: 'Cilin Spellsinger',
  items: [
    { name: 'Nebulous Diamond', count: 1, who: [], where: 'Island 4' },
    { name: 'Efreeti War Spear', count: 1, who: [], where: 'Island 4' },
    { name: 'Wind Rune Heda', count: 1, who: [], where: 'Island 2' },
  ],
}
const AZARACK: PoskyQuest = {
  className: 'Beastlord',
  name: 'Beastlord Test of Azarack',
  giver: 'Animist Kratho',
  items: [
    { name: 'Azarack Skin', count: 1, who: [], where: 'Island 6' },
    { name: 'Wind Rune Heda', count: 1, who: [], where: 'Island 2' },
  ],
}
const QUESTS = [HARMONY, AZARACK]
const heda = itemCountKey('Wind Rune Heda')
const spear = itemCountKey('Efreeti War Spear')

const TRADE_AT = 1_700_000_000_000
const MINUTE = 60_000

/** Two runes, the diamond, the spear and the skin in the bags — everything looted before the trade. */
const LOOTED: LootEvent[] = [
  { ts: TRADE_AT - 12 * MINUTE, item: 'Wind Rune Heda', disposition: 'currency' },
  { ts: TRADE_AT - 11 * MINUTE, item: 'Wind Rune Heda', disposition: 'currency' },
  { ts: TRADE_AT - 10 * MINUTE, item: 'Nebulous Diamond' },
  { ts: TRADE_AT - 9 * MINUTE, item: 'Efreeti War Spear' },
  { ts: TRADE_AT - 8 * MINUTE, item: 'Azarack Skin' },
]

/**
 * ONE trade at Cilin Spellsinger carrying `runes` copies of the rune — the real multi-slot
 * transcript shape (scripts/sources/cache/quests/page-15270.wikitext:100-103): one `offered` line
 * per copy, folded into a single trade event by the turnins module. Only the Bard Test matches it:
 * the Beastlord Test is a different giver.
 */
function trade(runes: number): TurnInEvent[] {
  return [
    {
      ts: TRADE_AT,
      npc: 'Cilin Spellsinger',
      items: [
        { name: 'Nebulous Diamond', count: 1 },
        { name: 'Efreeti War Spear', count: 1 },
        ...Array.from({ length: runes }, () => ({ name: 'Wind Rune Heda', count: 1 })),
      ],
    },
  ]
}

/**
 * The whole Sky pipeline for a trade of `runes` copies: the log fold for what you hold, the REAL
 * matcher for the ledger (now reporting what each trade actually offered), and reconcile for what
 * the tab draws. Routed through the production functions end to end, so the fix is proven at the
 * layer the Sky tab actually reads rather than at a synthetic shortcut.
 */
function afterTrade(
  runes: number,
  over: Partial<ReconcileInput> = {},
): ReturnType<typeof reconcile> {
  const { instants, offered } = countTurnIns(trade(runes), QUESTS)
  const times: Record<string, number> = {}
  for (const [k, list] of Object.entries(instants)) times[k] = list.length
  return reconcile({
    log: computeHeldCounts(LOOTED),
    inv: {},
    turnInOffered: offered,
    lootNames: {},
    countSource: 'log',
    turnIns: times,
    turnInInstants: instants,
    quests: QUESTS,
    ...over,
  })
}

test('THE REPORT: two runes handed over in one trade — both are gone, so the tab must read 0', () => {
  for (const countSource of ['log', 'both'] as const) {
    const res = afterTrade(2, { countSource })
    assert.equal(res.net[heda], 0, `${countSource}: two looted, two handed to Cilin, none left`)
    assert.equal(res.net[spear], 0, `${countSource}: and the single-copy item the same trade ate`)
  }
})

test('a one-rune trade and a two-rune trade cannot leave the same count behind', () => {
  // The design-agnostic statement of the bug: it does not say the quantity has to live on the
  // ledger, or on the event, or anywhere in particular — only that a trade which took one more copy
  // has to be distinguishable from one that did not.
  assert.notEqual(
    afterTrade(1).net[heda],
    afterTrade(2).net[heda],
    'the second rune left the bags and left no trace in the model',
  )
})

test('THE ORDINARY TRADE IS UNCHANGED: one rune in, the spare is still yours', () => {
  // The regression guard on any fix, and the easiest way to make the first case pass for the wrong
  // reason. A fix that reads "a trade eats every copy of the item it offered" must still leave this
  // at 1 — the second rune was never in the trade window.
  const res = afterTrade(1)
  assert.equal(res.net[heda], 1, 'two looted, one handed in, one spare')
  const row = res.rows.find((r) => r.key === heda)
  assert.ok(row)
  assert.deepEqual([row.base, row.consumed, row.net], [2, 1, 1], 'net === base - consumed')
  assert.deepEqual(row.consumedBy, ['Bard Test of Harmony'], 'the quest that ate the copy')
})

test('the row stays honest about the over-hand-in too: net === base - consumed, quest named', () => {
  const row = afterTrade(2).rows.find((r) => r.key === heda)
  assert.ok(row)
  assert.equal(row.log, 2, 'the log saw two drop and no destroy — an `offered` line is not a loss')
  assert.deepEqual([row.base, row.consumed, row.net], [2, 2, 0])
  assert.deepEqual(row.consumedBy, ['Bard Test of Harmony'], 'one trade, one quest to blame')
})

test('THE CURRENCY CONSEQUENCE: the phantom rune must not arm the Beastlord Test', () => {
  // Why this is worse than one wrong cell. The Heda is contended by six class Tests across six
  // givers, so the survivor is counted toward all of them: the tab shows Test of Azarack complete
  // (skin + rune) when the rune it would need is already inside Cilin's trade window.
  const res = afterTrade(2)
  assert.equal(res.net[heda], 0, 'there is no rune left to offer Animist Kratho')
  assert.equal(res.net[itemCountKey('Azarack Skin')], 1, 'the skin is untouched — only the rune is')
})

/** A fresh `/outputfile inventory` taken after the trade: no runes left, the skin still banked. */
const AFTER_DUMP: Partial<ReconcileInput> = {
  inv: { 'azarack skin': 1 },
  rebaselineAt: TRADE_AT + 5 * MINUTE,
}

test('THE WORKAROUND: under `inventory` and `rebaseline`, a fresh dump does heal the phantom', () => {
  // The two of the four sources that get the right answer today, pinned because this is what a
  // reporter has to be told to do and because a future window change could silently take it away. A
  // dump is an OBSERVATION of the bags, so it counts what is there rather than deriving it from the
  // ledger — the over-handed rune is simply absent from the file. Nothing is discounted on top, the
  // trade being older than the dump (JOS-403: a dump owes only the turn-ins made after it).
  for (const countSource of ['inventory', 'rebaseline'] as const) {
    const res = afterTrade(2, { ...AFTER_DUMP, countSource })
    assert.equal(res.net[heda], 0, `${countSource}: the dump saw no rune, so neither does the tab`)
    assert.equal(res.net[itemCountKey('Azarack Skin')], 1, `${countSource}: the skin survives`)
  }
})

test('THE DEFAULT SOURCE NEEDS NO DUMP AT ALL: `both` is a max, and the log is now correct', () => {
  // The sharp reason a fix belonging only to the dump windows would not have been enough. `both`
  // has been the DEFAULT since JOS-294 and it is a per-item MAXIMUM, not a fallback
  // (countSource.ts says so in those words) — a dump witness that reads correctly cannot rescue a
  // count where the OTHER side of the max is still wrong. This app's usual state has no dump
  // loaded at all (`inv: {}` below), so the max degenerates to the log witness alone, and the fix
  // had to make THAT witness correct rather than lean on the dump to win the max.
  const res = afterTrade(2, { countSource: 'both' })
  assert.equal(res.net[heda], 0, 'no dump involved — the log-side fix is what makes this read 0')

  // …and loading a dump afterwards agrees rather than fighting it (both witnesses now say 0, so
  // the max is not doing any correcting work — it simply has nothing to disagree about).
  const withDump = afterTrade(2, { ...AFTER_DUMP, countSource: 'both' })
  assert.equal(withDump.net[heda], 0, 'the two witnesses agree once the log itself is fixed')
})

test('the premise, against the real Sky data: runes are count-1 and heavily contended', () => {
  // The two facts that make this bug both possible and silent. If a re-scrape ever ships a Sky
  // requirement above 1, the framing above needs re-reading — that is what this canary is for.
  const quests = (poskyRaw as { quests: PoskyQuest[] }).quests
  const rows = quests.flatMap((q) => q.items.map((it) => ({ q, it })))
  assert.equal(
    rows.filter(({ it }) => it.count > 1).length,
    0,
    'every Sky requirement is one copy, so no count check can catch a second copy going out',
  )
  const wantHeda = rows.filter(({ it }) => itemCountKey(it.name) === heda)
  assert.ok(wantHeda.length > 1, 'and the rune is contended — a phantom copy misleads every one')
  // The confounder the first draft of this file hit, stated as data: two Tests at ONE giver never
  // want the same rune, so a single trade can only ever satisfy one of them.
  const perGiver = new Map<string, Set<string>>()
  for (const { q, it } of rows) {
    if (!itemCountKey(it.name).startsWith('wind rune')) continue
    const seen = perGiver.get(q.giver ?? '') ?? new Set<string>()
    assert.ok(!seen.has(itemCountKey(it.name)), `${q.giver ?? '?'} wants ${it.name} twice`)
    seen.add(itemCountKey(it.name))
    perGiver.set(q.giver ?? '', seen)
  }
})

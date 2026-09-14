// Pure turn-in matching + celebration detection (Task #46, JOS-131) — the testable core of
// the "celebrate a Sky quest turn-in, never on load" rule. Kept free of
// React/data-bundle imports so tests can exercise it directly (the useProgress module
// pulls in @shared value imports the bare test runner can't alias-resolve).
//
// The celebration mirrors the boss-defeat baseline contract (bossStatus.bossKills):
// the FIRST observation seeds a silent baseline, and only turn-ins observed AFTER the
// baseline count as live transitions. This keeps historical
// completions (already persisted, or found in the initial log scan) from firing
// confetti/sound on launch.
//
// JOS-131 MADE IT A COUNT. A Sky quest can be run again, so the baseline is a COUNT PER QUEST
// rather than a set of keys: the second turn-in of the same quest is a transition too, and it
// celebrates the same way the boss-kill watch celebrates a repeat kill ("every time is worth
// celebrating", owner 2026-08-04). Exactly-once is still guaranteed per turn-in, because the
// baseline advances to the count that just fired.

import type { PoskyQuest, TurnInEvent, TurnInItemOffer } from '@shared/types'
import type { TurnInInstants, TurnInOffered } from '@shared/questTurnIns'
import { itemCountKey } from '../../lib/itemName'
import { questKey } from './keys'

/** Total quantity offered per item key in ONE trade, summed across every slot/line that named it —
 *  two `offered 1 X` lines and one `offered 2 X` line read the same. */
function tallyOffered(items: readonly TurnInItemOffer[]): Map<string, number> {
  const qtyByKey = new Map<string, number>()
  for (const slot of items) {
    const k = itemCountKey(slot.name)
    // Defensive: this crosses the engine/renderer boundary as an `unknown` cast (useModule.ts), so
    // a malformed count floors at 1 rather than corrupting held-item math.
    const n = Number.isFinite(slot.count) && slot.count > 0 ? Math.floor(slot.count) : 1
    qtyByKey.set(k, (qtyByKey.get(k) ?? 0) + n)
  }
  return qtyByKey
}

/** What one matched quest's required items actually got in this trade, keyed by counting key. */
function offeredForQuest(quest: PoskyQuest, qtyByKey: Map<string, number>): Record<string, number> {
  const byItem: Record<string, number> = {}
  for (const it of quest.items) {
    const k = itemCountKey(it.name)
    byItem[k] = qtyByKey.get(k) ?? 0
  }
  return byItem
}

/** What matching the log's turn-ins against the quest set produces: the dating/counting ledger
 *  every reader has always gotten, plus what each detected trade actually offered (the Sky
 *  over-hand-in fix) — see `TurnInOffered`'s own doc for why that is a separate map. */
export interface DetectedTurnIns {
  instants: TurnInInstants
  offered: TurnInOffered
}

/**
 * Match logged turn-ins to quests: a quest is turned in when its giver received
 * (in one trade) every item the quest requires. The +N variant is normalized at the
 * matching boundary (a `Sphinx Claw +1` offer satisfies a `Sphinx Claw` requirement,
 * Task #42), so the user's `Brass Knuckles +2` loot satisfies the base requirement.
 *
 * Returns the INSTANTS, quest key → every `TurnInEvent.ts` that satisfied it (JOS-131), alongside
 * the OFFERED map: quest key → that same instant → item key → how many the trade actually held for
 * it, summed across every slot/line that named the item (two `offered 1 X` lines and one
 * `offered 2 X` line read the same). The count is the instants list's length; the instants are what
 * let a turn-in be placed relative to an inventory dump, and what let the log's turn-ins merge with
 * the persisted ones without double-counting (shared/questTurnIns.ts owns both merges).
 */
export function countTurnIns(
  turnIns: readonly TurnInEvent[],
  quests: PoskyQuest[],
): DetectedTurnIns {
  const instants: TurnInInstants = {}
  const offered: TurnInOffered = {}
  for (const t of turnIns) {
    const npc = t.npc.toLowerCase()
    const qtyByKey = tallyOffered(t.items)
    for (const q of quests) {
      if (q.giver?.toLowerCase() !== npc) continue
      if (q.items.length === 0 || !q.items.every((it) => qtyByKey.has(itemCountKey(it.name)))) {
        continue
      }
      const qKey = questKey(q)
      ;(instants[qKey] ??= []).push(t.ts)
      ;(offered[qKey] ??= {})[t.ts] = offeredForQuest(q, qtyByKey)
    }
  }
  return { instants, offered }
}

/** A turn-in that just happened, and which number it was for that quest. */
export interface TurnInTransition {
  key: string
  /** how many times this quest has now been turned in — 1 the first time, 2 the second */
  count: number
}

/**
 * Given the previous per-quest turn-in COUNTS (null = not yet baselined) and the current ones,
 * return the quests that just gained a turn-in. Returns [] on the baseline run (prev == null) —
 * the historical set is seeded silently and never celebrated.
 *
 * A count that GREW by more than one (a delta carrying two turn-ins of the same quest, or a
 * catch-up after the app was closed) reports ONE transition at the new count. The event being
 * celebrated is "you turned this in", not "here are N confetti bursts", and the count in hand is
 * the honest one to show.
 */
export function newlyCompletedTurnIns(
  prevCounts: Record<string, number> | null,
  counts: Record<string, number>,
): TurnInTransition[] {
  if (prevCounts == null) return []
  const out: TurnInTransition[] = []
  for (const [key, count] of Object.entries(counts)) {
    if (count > (prevCounts[key] ?? 0)) out.push({ key, count })
  }
  return out
}

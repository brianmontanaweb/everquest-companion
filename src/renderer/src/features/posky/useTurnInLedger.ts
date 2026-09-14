// useTurnInLedger.ts — split OUT OF useProgress.ts for file mass, not for scope (that file sits at
// the measured 400-code-line ceiling and the rule here is to SPLIT rather than ratchet — the same
// pattern main's store.ts/preload's index.ts just followed for the Sky over-hand-in fix). This is
// one subject: where turn-in counts come from, when they celebrate, when they are written down,
// and how a user states one by hand. No behavior moved — every hook, effect and dependency array
// is unchanged, only the file it lives in.

import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { PoskyQuest, ProgressState, TurnInSnap } from '@shared/types'
import { getPoskyData } from '../../data'
import { useModule } from '../../lib/useModule'
import { questKey } from './keys'
import { countTurnIns, newlyCompletedTurnIns } from './turnInCelebration'
// The turn-in ledger (JOS-131) — the ONE place a turn-in count is decided, shared with main's
// store so the renderer and the persisted file cannot disagree about what a count means.
// Relative value import, per the repo's node-tested-module rule.
import {
  resolveTurnIns,
  resolveTurnInOffered,
  turnInsToPersist,
  turnInOfferedToPersist,
  type QuestTurnIns,
  type TurnInInstants,
  type TurnInOffered,
} from '../../../../shared/questTurnIns'

// Static bundled data, re-derived here the same way useProgress.ts derives its own copy — cheap
// (a JSON already in the bundle) and it keeps this file free of a cross-file module-state import.
const posky = getPoskyData()
const questByKey = new Map<string, PoskyQuest>(posky.quests.map((q) => [questKey(q), q]))

/** What the turn-in ledger hands back: the counts the tab reads, and the two ways to change them. */
export interface TurnInLedger {
  turnIns: QuestTurnIns
  /**
   * THE LOG'S OWN INSTANTS, unmerged (JOS-409). `turnIns.instants` is these plus the hand-recorded
   * ones, and the difference matters to exactly one reader: the dump's turn-in window, which
   * compares an instant against a file's generation stamp. A hand-recorded instant is `Date.now()`
   * at the moment of the CLICK (`recordTurnIn` below says so), so it can postdate a dump that
   * already reflects the turn-in — and windowing it would double-subtract. This list is the half
   * that is an EVENT time.
   */
  detected: TurnInInstants
  /**
   * WHAT EACH DETECTED TRADE ACTUALLY OFFERED (the Sky over-hand-in fix), merged with the
   * persisted copy the same way `detected`'s instants are — see `TurnInOffered`'s own doc for why
   * this is a parallel ledger rather than a field on `turnIns`.
   */
  offered: TurnInOffered
  /** quest key → how many of its turn-ins the LOG accounts for */
  logCounts: Record<string, number>
  recordTurnIn: (key: string) => Promise<void>
  undoTurnIn: (key: string) => Promise<void>
}

/**
 * THE TURN-IN LEDGER (JOS-131): where turn-in counts come from, when they celebrate, when they are
 * written down, and how a user states one by hand.
 */
export function useTurnInLedger(
  progress: ProgressState | null,
  setProgress: (p: ProgressState) => void,
  onQuestComplete?: (quest: PoskyQuest, count: number) => void,
): TurnInLedger {
  // Raw (nullable) turn-in snapshot: null until the module hydrates. We gate the
  // celebration baseline on hydration so the historical turn-ins that arrive WITH the
  // snapshot seed the baseline silently instead of looking like live transitions.
  const turnInsRaw = useModule<TurnInSnap>('turnins')

  // Baseline of per-quest turn-in COUNTS — seeded silently on the FIRST observation so
  // historical turn-ins (in the initial log scan) never celebrate. A count that GROWS after the
  // baseline is a live transition → celebrate, including the second run of a quest you had
  // already done. Kept in a ref (not state) so it never triggers a re-render,
  // mirroring useBossKills' prevRef. Reset on character switch (state re-hydrates from scratch).
  const matchedBaselineRef = useRef<Record<string, number> | null>(null)
  const onQuestCompleteRef = useRef(onQuestComplete)
  onQuestCompleteRef.current = onQuestComplete

  useEffect(() => {
    const off = window.eq.onCharacter(() => {
      matchedBaselineRef.current = null
    })
    return off
  }, [])

  // The log's own reading of the turn-ins: instants (dating/counting) and, since the Sky
  // over-hand-in fix, what each trade actually offered. Null until the module hydrates; an empty
  // ledger until then, so nothing derived from it has to special-case the gap.
  const matched = useMemo(() => countTurnIns(turnInsRaw ?? [], posky.quests), [turnInsRaw])
  const detected = matched.instants
  // The log's turn-ins merged with the persisted ones, as the all-time count the rest of the tab
  // reads. No since-the-dump count any more (JOS-141): consumption is windowed by SOURCE rather
  // than by instant now, and reconcile.ts argues why.
  const turnIns = useMemo(() => resolveTurnIns(progress, detected), [progress, detected])
  // The same merge for what each detected trade offered (a PARALLEL ledger — shared/questTurnIns.ts
  // argues why this is not a field on `turnIns` above). Absent for a hand-recorded turn-in, so this
  // reads `{}` until a log-detected over-hand-in ever needs to say otherwise.
  const offered = useMemo(
    () => resolveTurnInOffered(progress, matched.offered),
    [progress, matched],
  )
  // The log's share of each count, for the "can this be undone" question (see UseProgress).
  const logCounts = useMemo<Record<string, number>>(() => {
    const out: Record<string, number> = {}
    for (const [key, list] of Object.entries(detected)) out[key] = list.length
    return out
  }, [detected])

  // Persist the turn-ins the log knows about and celebrate ONLY genuine live transitions (never
  // the historical baseline). Gated on the turn-in snapshot being HYDRATED (turnInsRaw != null)
  // so the historical turn-ins that arrive with the first snapshot seed the baseline silently
  // rather than firing.
  useEffect(() => {
    if (!progress || turnInsRaw == null) return

    // Celebrate every quest whose count GREW since the last observation — but seed the
    // baseline SILENTLY on the first hydrated run so the initial log scan's historical
    // turn-ins (and already-persisted ones) never fire. This is the boss-defeat baseline rule
    // applied to turn-ins (Task #46), now counting rather than latching (JOS-131).
    for (const t of newlyCompletedTurnIns(matchedBaselineRef.current, turnIns.all)) {
      const quest = questByKey.get(t.key)
      if (quest) onQuestCompleteRef.current?.(quest, t.count)
    }
    matchedBaselineRef.current = turnIns.all

    // A detected turn-in is written to the store, the way the old auto-complete wrote a
    // completion: the log is re-scanned per character epoch and logs get truncated, and a
    // turn-in the log can no longer show still happened. The write settles because the merge is
    // idempotent — once stored, neither helper below has anything left to say.
    //
    // ONE WRITE PER KEY, NOT TWO (the Sky over-hand-in fix). The instants and what those trades
    // actually offered are learned in this same pass, so they ride the SAME `setQuestTurnIns`
    // call (its optional 3rd argument) rather than two independent IPC round trips — each one a
    // full synchronous store write and an `onProgress` broadcast, which would otherwise double
    // the cost of every ordinary turn-in, not just the rare over-hand-in.
    const pendingKeys = new Set([
      ...turnInsToPersist(progress, turnIns.instants).map((p) => p.key),
      ...turnInOfferedToPersist(progress, offered).map((p) => p.key),
    ])
    if (pendingKeys.size > 0) {
      void Promise.all(
        [...pendingKeys].map((key) =>
          window.eq.setQuestTurnIns(key, turnIns.instants[key] ?? [], offered[key]),
        ),
      ).then((results) => {
        if (results.length) setProgress(results[results.length - 1])
      })
    }
  }, [turnInsRaw, progress, turnIns, offered, setProgress])

  /** One more turn-in, dated NOW. `Date.now()` is the honest instant for a statement the user is
   *  making right now, and dating it is what keeps the ledger a list of events rather than a tally
   *  (an instant is what dedupes a detected turn-in against the stored one).
   *
   *  IT IS A CLICK TIME, NOT AN EVENT TIME, and JOS-409 is where that stopped being harmless: a
   *  player who hands a quest in and records it a day later stamps TOMORROW on YESTERDAY'S event.
   *  Nothing here can fix that — the user is telling us a thing happened, not when — so the fix is
   *  on the reader: only `detected` (above) windows the dump. Do not "improve" this to guess an
   *  earlier instant; a guessed event time is exactly the kind of invention law 1 forbids. */
  const recordTurnIn = useCallback(
    async (key: string): Promise<void> => {
      setProgress(
        await window.eq.setQuestTurnIns(key, [...(turnIns.instants[key] ?? []), Date.now()]),
      )
    },
    [turnIns, setProgress],
  )

  /**
   * Drop the newest turn-in the LOG does not also know about. A log-detected instant is left
   * alone: removing it would be undone by the very next snapshot, so the UI disables the control
   * instead (it reads `QuestProgress.logTurnIns`). With no instants at all, this clears a
   * pre-JOS-131 completion, which is the only other thing a count can come from.
   */
  const undoTurnIn = useCallback(
    async (key: string): Promise<void> => {
      const list = turnIns.instants[key] ?? []
      const fromLog = new Set(detected[key] ?? [])
      const cut = [...list].reverse().find((ts) => !fromLog.has(ts))
      setProgress(
        await window.eq.setQuestTurnIns(
          key,
          cut === undefined ? [] : list.filter((ts) => ts !== cut),
        ),
      )
    },
    [turnIns, detected, setProgress],
  )

  return { turnIns, detected, offered, logCounts, recordTurnIn, undoTurnIn }
}

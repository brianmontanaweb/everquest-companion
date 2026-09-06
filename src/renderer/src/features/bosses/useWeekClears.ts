// useWeekClears — the manual base-rung clear as ONE module-scope store the whole Bosses view reads
// (the useFavorites.ts / useQuestFlags.ts shape: one store, useSyncExternalStore hands out one
// snapshot, a toggle re-emits). The pure half — the stored shape, the one edit, and "is this mark
// still live this week" — is weekClears.ts + lockout.ts; this file is only the localStorage plumbing
// and the character switch.
//
// A DIFFERENT CHARACTER IS A DIFFERENT LOCKOUT. Lockouts are per character, so the storage key is
// namespaced by `<name>_<server>` and the store re-reads on window.eq.onCharacter — the
// useWishlist.ts `watch()` pattern, subscribed once for the life of the window. Until the first
// onCharacter names a character, `canToggle` is false: a write before then would land in the
// `unknown` bucket and be invisible once the real character arrives.

import { useMemo, useSyncExternalStore } from 'react'
import type { LockoutWindow } from './lockout'
import { manualClearIsLiveThisWeek } from './lockout'
import {
  parseWeekClears,
  serializeWeekClears,
  toggleWeekClear,
  weekClearsStorageKey,
  type WeekClears
} from './weekClears'

export interface WeekClearsApi {
  /** the value to pass tierLadder as `manualBaseTs`: the mark, iff it is live for `w`. */
  liveBaseTs: (bossKey: string, w: LockoutWindow) => number | undefined
  /** false until a character is known — the affordance stays disabled. */
  canToggle: boolean
  /** flip this boss's d0 mark (stamps Date.now()). No-op while `canToggle` is false. */
  toggle: (bossKey: string) => void
}

interface Snapshot {
  clears: WeekClears
  character: string | null
}

let snapshot: Snapshot = { clears: {}, character: null }
const listeners = new Set<() => void>()
let watching = false

function read(character: string | null): WeekClears {
  try {
    return parseWeekClears(localStorage.getItem(weekClearsStorageKey(character)))
  } catch {
    return {}
  }
}

function emit(next: Snapshot): void {
  snapshot = next
  for (const l of [...listeners]) l()
}

function watch(): void {
  if (watching) return
  watching = true
  window.eq.onCharacter((c) => {
    const character = c ? `${c.name}_${c.server}` : null
    emit({ character, clears: read(character) })
  })
}

function subscribe(listener: () => void): () => void {
  watch()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): Snapshot {
  return snapshot
}

function write(next: WeekClears): void {
  snapshot = { ...snapshot, clears: next }
  try {
    localStorage.setItem(weekClearsStorageKey(snapshot.character), serializeWeekClears(next))
  } catch {
    /* a storage that won't take the write still updates the screen for this session */
  }
  for (const l of [...listeners]) l()
}

export function useWeekClears(): WeekClearsApi {
  const snap = useSyncExternalStore(subscribe, getSnapshot)
  return useMemo<WeekClearsApi>(
    () => ({
      canToggle: snap.character !== null,
      liveBaseTs: (bossKey, w) => {
        const ts = snap.clears[bossKey]
        return manualClearIsLiveThisWeek(ts, w) ? ts : undefined
      },
      toggle: (bossKey) => {
        if (snap.character === null) return
        write(toggleWeekClear(snap.clears, bossKey, Date.now()))
      }
    }),
    [snap]
  )
}

// Renderer-local COMBAT view preferences — the same idiom as `eq.combat.scope` in useCombat.ts
// (localStorage, renderer-side, no store/IPC round trip), with one addition it needs and that
// one didn't: these prefs are read by surfaces that never share a mount.
//
// The Preferences tab writes them; the Combat tab, the Overview card AND the floating overlay
// meters read them. App.tsx's `ViewContent` mounts exactly ONE feature view at a time, so a plain
// `useState` initialised from localStorage would already be correct on the next mount — but a
// same-document `localStorage.setItem` fires no 'storage' event, so anything that IS mounted
// alongside the writer (a preference and its own live example, today or tomorrow) would go
// stale. The tiny subscription below closes that: one write notifies every reader in this
// window, so "changing it applies live" is structural instead of incidental.
//
// AND ACROSS WINDOWS, WHICH IS WHY THE OVERLAY MAY READ IT (measured, 2026-08-04). The overlay is
// a second renderer entry in a second BrowserWindow, so the in-window `listeners` set below can
// never reach it. It doesn't have to: every window of this app is ONE ORIGIN, so localStorage is
// literally the same store and the cross-document 'storage' event does the notifying. Verified in
// this Electron rather than assumed, on the case that could plausibly have differed — two
// `file://` documents (the packaged app's `index.html` and `overlay.html`, loaded by path, no
// dev server): both report `location.origin === 'file://'`, a write in one is readable in the
// other, and the other receives a `storage` event carrying the new value. So the overlay reads
// the SAME key by the SAME hook, and no copy of this preference is ever routed over IPC.

import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { notifyAll, subscribe, useBoolPref, useRawPref } from '../../lib/rawPref'
// The vocabulary — defaults, guards and degrades — lives in a DOM-free module beside this one so
// it can be node-tested (combatPrefs.ts says why). This file is the storage half and nothing else.
import {
  DEFAULT_METER_SCOPE,
  HIDDEN_LINES_KEY,
  METER_SCOPE_KEY,
  parseHiddenLines,
  readMeterScope,
  serializeHiddenLines,
  toggleHiddenLine,
  type ChartLineKey
} from './combatPrefs'
import type { MeterScope } from '@shared/roster'

export { useBoolPref, useRawPref } from '../../lib/rawPref'

/**
 * Nest the pet as ONE line item inside your damage breakdown (drillable to the pet's own
 * skills) instead of listing it as a separate source. Default ON: the game is mostly played
 * solo, so "you and your pet" is the shape of nearly every fight (owner direction, 2026-08-03).
 *
 * It is also the DEFAULT ZOOM (owner direction, 2026-08-04): on ⇒ the dashboard opens on your
 * breakdown with the pet nested in it, off ⇒ it opens fully zoomed out on the source list. One
 * choice, one key — `petRows.defaultDrill` is the rule, and `eq.combat.drill` (a second bit
 * that used to decide the opening level on its own, and that plain navigation rewrote) is
 * RETIRED. Nothing reads that key any more; a stale one in localStorage is inert.
 */
export const COMBINE_PET_ROW_KEY = 'eq.combat.petRow'

/** See COMBINE_PET_ROW_KEY. Read by the Combat dashboard, the Overview DPS card AND the floating
 *  overlay meters — all of them take their layout and their opening level from it, and only the
 *  Preferences tab ever writes it. */
export function useCombinePetRow(): [boolean, (v: boolean) => void] {
  return useBoolPref(COMBINE_PET_ROW_KEY, true)
}

/**
 * THE DPS CURVE'S HIDDEN LINES (JOS-264) — the legend's own state, live across every reader.
 *
 * The array identity is memoised on the RAW STRING, not rebuilt per render: it is a `useMemo`
 * dependency of the chart geometry downstream, and a fresh array every render would re-derive the
 * whole curve on every snapshot tick — the one thing the memo chain in DpsOverTime exists to
 * prevent. Nothing hidden serializes to an ABSENT key (combatPrefs), so un-hiding the last line
 * leaves the store exactly as a fresh install found it.
 */
export function useHiddenChartLines(): [readonly ChartLineKey[], (k: ChartLineKey) => void] {
  const [raw, setRaw] = useRawPref(HIDDEN_LINES_KEY)
  const hidden = useMemo(() => parseHiddenLines(raw), [raw])
  const toggle = useCallback(
    (k: ChartLineKey) => {
      setRaw(serializeHiddenLines(toggleHiddenLine(hidden, k)))
    },
    [hidden, setRaw]
  )
  return [hidden, toggle]
}

/**
 * THE METER SCOPE — You / Group / Everyone (docs/plans/group-model.md §2).
 *
 * ONE GLOBAL PREFERENCE, ONE KEY (JOS-115, owner: the inline You/Group/Everyone control "is shown
 * INLINE on every combat surface and is too crowded"). It used to be a per-surface value written by
 * a chip on each surface — `eq.combat.meterScope.combat`, `.overlay.fight`, and one per overlay
 * kind — on the theory that a docked meter and a pinned two-inch overlay get asked different
 * questions. In practice that was three controls to find and three answers to keep straight for one
 * question ("whose damage am I looking at"), and the surfaces disagreeing was the common case
 * rather than the useful one. Now every damage and healing meter in the app reads THIS key, and
 * only Preferences > Combat writes it.
 *
 * The old per-surface keys are INERT, not migrated: they are view state a user can restate in one
 * click, and reading three of them to guess which one the "real" answer was would be a coin flip
 * dressed as a migration.
 *
 * DEFAULT 'everyone' — for a fresh install and for an absent key alike (JOS-229; it was 'group'
 * from JOS-115 until then, and combatPrefs.DEFAULT_METER_SCOPE carries the argument). The short
 * version: an inferred roster can be incomplete as easily as empty, and a meter missing a real
 * group-mate's bars reads as a broken meter. Only the ABSENT key moves — a stored 'group' is an
 * answer the user gave and is handed straight back.
 *
 * A value that is not one of the three — a hand-edited localStorage, a key written by a future
 * build — degrades to the default rather than rendering an empty meter (combatPrefs.readMeterScope).
 */
export function useMeterScope(): [MeterScope, (v: MeterScope) => void] {
  const value = useSyncExternalStore<MeterScope>(
    subscribe,
    () => readMeterScope(localStorage.getItem(METER_SCOPE_KEY)),
    () => DEFAULT_METER_SCOPE
  )
  const set = useCallback((v: MeterScope) => {
    localStorage.setItem(METER_SCOPE_KEY, v)
    notifyAll()
  }, [])
  return [value, set]
}

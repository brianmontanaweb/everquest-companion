// WEEK-CLEAR STORAGE VOCABULARY — the manual "this rung is cleared this week" mark, minus the DOM.
//
// `useWeekClears.ts` is the storage half (localStorage + the onCharacter re-key); this half decides
// what a stored string MEANS and owns the one pure edit. Splitting them is what makes the rules
// testable under plain node — the combatPrefs.ts precedent, for the same reason: no `@shared` alias
// resolves for values here, so the one shared import below is RELATIVE.
//
// See docs/plans/boss-lockout-credit-and-manual-clear.md section 2a. The mark is BASE-RUNG ONLY and
// per character; a stored value is the Date.now() of the click, and lockout.ts decides from that
// timestamp whether the mark is still live for the current lockout week (it expires at reset with
// no sweep — the instance-notice TTL pattern).

/** boss key (lowercased target name) -> the `Date.now()` its d0 rung was last marked. */
export type WeekClears = Record<string, number>

const KEY_PREFIX = 'eq.bosses.weekClears'

/** The per-character localStorage key. An absent character degrades to one shared bucket. */
export function weekClearsStorageKey(character: string | null): string {
  return `${KEY_PREFIX}.${character ?? 'unknown'}`
}

/** The roster's identity for a target — matches how bossStatus.ts compares names. */
export function bossClearKey(targetName: string): string {
  return targetName.trim().toLowerCase()
}

/** Parse a raw localStorage string. Anything that is not a `{ string: number }` map degrades to {}. */
export function parseWeekClears(raw: string | null): WeekClears {
  if (raw == null) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: WeekClears = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v)) out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

export function serializeWeekClears(w: WeekClears): string {
  return JSON.stringify(w)
}

/**
 * Toggle one boss's base-rung mark. Absent -> set to `nowMs`; present -> removed. Returns a NEW
 * object; never mutates the input (useSyncExternalStore compares snapshots by identity).
 */
export function toggleWeekClear(w: WeekClears, key: string, nowMs: number): WeekClears {
  if (key in w) {
    const { [key]: _drop, ...rest } = w
    return rest
  }
  return { ...w, [key]: nowMs }
}

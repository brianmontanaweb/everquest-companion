// useNavPrefs.ts — the storage half of side-nav customization: a live view of `eq.nav.layout`
// and `eq.nav.density` for every reader in the window (the drawer) and the writer in another
// subtree (Preferences). Over lib/rawPref, the same cross-subtree mechanism the combat prefs use.

import { useCallback, useMemo } from 'react'
import { useRawPref } from '../lib/rawPref'
import type { View } from '../appViews'
import {
  DEFAULT_NAV_DENSITY, NAV_DENSITY_KEY, NAV_LAYOUT_KEY, type NavDensity,
  moveRow, parseNavLayout, readNavDensity, serializeNavLayout, toMainOverflow, toggleHidden
} from './navLayout'

export function useNavLayout(): {
  main: View[]; overflow: View[]; order: View[]; hidden: View[]
  move: (v: View, dir: -1 | 1) => void
  toggle: (v: View) => void
  reset: () => void
} {
  const [raw, setRaw] = useRawPref(NAV_LAYOUT_KEY)
  const { order, hidden } = useMemo(() => parseNavLayout(raw), [raw])
  const { main, overflow } = useMemo(() => toMainOverflow({ order, hidden }), [order, hidden])

  const write = useCallback(
    (nextOrder: readonly View[], nextHidden: readonly View[]) => {
      setRaw(serializeNavLayout(nextOrder, nextHidden))
    },
    [setRaw]
  )
  const move = useCallback((v: View, dir: -1 | 1) => write(moveRow(order, v, dir), hidden), [order, hidden, write])
  const toggle = useCallback((v: View) => write(order, toggleHidden(hidden, v)), [order, hidden, write])
  const reset = useCallback(() => setRaw(null), [setRaw])

  return { main, overflow, order, hidden, move, toggle, reset }
}

export function useNavDensity(): [NavDensity, (d: NavDensity) => void] {
  const [raw, setRaw] = useRawPref(NAV_DENSITY_KEY)
  const density = readNavDensity(raw)
  const set = useCallback((d: NavDensity) => setRaw(d === DEFAULT_NAV_DENSITY ? null : d), [setRaw])
  return [density, set]
}

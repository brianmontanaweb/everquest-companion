import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import type { NavBack } from '../../appRouting'

/** Which item the pane has taken over for, and the two ways in and out of it. */
export interface LootDetail {
  selected: string | null
  open: (item: string) => void
  close: () => void
}

export interface LootDetailProps {
  /** An item to open on arrival — the Overview's drop rows deep-linking in. Re-applied whenever
   *  `focusNonce` changes, so the same item asked for twice opens twice. */
  focusItem?: string | null
  focusNonce?: number
  /** Told the moment the focus has been applied, so the router drops it and a later plain visit
   *  to this tab lands on the ledger rather than on wherever the last link pointed. */
  onFocusConsumed?: () => void
  /** The app's ONE back contract (appRouting `NavBack`, JOS-43). Present ⇒ the detail pane's Back
   *  returns to whatever tab deep-linked here (the Planner, the Overview, a Sky quest); absent or
   *  empty ⇒ it means the ledger, exactly as it always did. */
  nav?: NavBack
}

/**
 * THE PANE-TAKEOVER STATE, and the scroll contract it owes the ledger it replaces.
 *
 * The list unmounts on the swap, so the offset is captured on the way in and re-applied in a
 * LAYOUT effect on the way back — before paint, so returning never flashes the top of an
 * eleven-thousand-row table. A DEEP-LINKED entry saves 0 instead: the reader was on the Overview,
 * so there is no position of theirs to return to — and since JOS-43 "back" does not mean the
 * ledger for them at all, it means the tab they came from.
 *
 * Its own hook rather than inline, so `LootView` itself stays inside the measured
 * lines-per-function ceiling and this rule is readable in one screen.
 *
 * `open` AND `close` ARE STABLE FOR THE LIFE OF THE VIEW. `open` is every ledger row's `onSelect`,
 * and every row is `memo`'d — but a SCROLL alone was never the threat: `useWindowedRows` lives in
 * `LootLedgerBody`, so a scroll event re-renders only that component, and its `ctx` prop (carrying
 * `onSelect`) is already the same object `LootView` handed it last render, so the rows already
 * skipped it. The threat is `LootView` ITSELF re-rendering for a reason that has nothing to do with
 * scrolling — `useProgress`'s IPC pushes, `useLootRows`' `useDeferredValue` second pass over a
 * filter query — which used to hand every row a FRESH `open`, defeating every row's memo at once
 * regardless of whether the list had moved. Stable `open`/`close` is what keeps those re-renders
 * from re-rendering the mounted rows too. `nav` is read through a ref so a new `nav` object from
 * the router neither changes `open`'s identity nor leaves it calling a stale one.
 */
export function useLootDetail(
  props: LootDetailProps,
  scrollRef: RefObject<HTMLDivElement | null>,
): LootDetail {
  const { focusItem, focusNonce, onFocusConsumed, nav } = props
  const [selected, setSelected] = useState<string | null>(null)
  const savedScroll = useRef(0)
  const navRef = useRef(nav)
  // A LAYOUT effect, not a render-time write: React (notably under StrictMode's double-invoked
  // render) can call this function body more than once for one committed render, and a write during
  // render should describe that render, not leak from a discarded one. No deps array — every commit
  // re-syncs the ref to whatever `nav` this render actually closed over.
  useLayoutEffect(() => {
    navRef.current = nav
  })

  // An inbound focus opens the detail pane, then is consumed. Keyed on the NONCE, not the item's
  // identity — the same item asked for twice must open twice.
  useEffect(() => {
    if (focusItem == null) return
    savedScroll.current = 0
    setSelected(focusItem)
    onFocusConsumed?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusNonce])

  useLayoutEffect(() => {
    if (selected === null && scrollRef.current) scrollRef.current.scrollTop = savedScroll.current
  }, [selected, scrollRef])

  const open = useCallback(
    (item: string) => {
      savedScroll.current = scrollRef.current?.scrollTop ?? 0
      // A NATIVE drill: the reader clicked a row in the ledger they are standing in, so the list
      // IS where back goes — and whatever a link parked before belongs to a journey that ended
      // when they started browsing here (navOrigin.ts).
      navRef.current?.clear()
      setSelected(item)
    },
    [scrollRef],
  )
  const close = useCallback(() => setSelected(null), [])

  return { selected, open, close }
}

/**
 * useLootDetail — THE ROW CLICK HANDLER IS ONE FUNCTION FOR THE LIFE OF THE VIEW.
 *
 * Every ledger row is `memo`'d, and `open` is every row's `onSelect`. A SCROLL event alone never
 * needed this: `useWindowedRows` lives in `LootLedgerBody`, so a scroll re-renders only that
 * component, whose `ctx` prop (carrying `onSelect`) is already the same object from `LootView`'s
 * last render — the rows already skipped it. What a fresh `open` every render actually breaks is
 * `LootView` re-rendering for its OWN reasons — an IPC push (`useProgress`), a second render from
 * `useLootRows`' `useDeferredValue` — which would otherwise hand every mounted row a NEW `onSelect`
 * and defeat every row's memo at once. That is the "scrolling is slow" report's real mechanism
 * (2026-09-19).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mountHook } from './hookHost.mjs'
import { useLootDetail } from '../src/renderer/src/features/loot/useLootDetail'
import type { NavBack } from '../src/renderer/src/appRouting'

function fakeNav(): NavBack & { cleared: number } {
  const nav = {
    cleared: 0,
    origin: null,
    back: () => false,
    clear: () => void (nav.cleared += 1),
  }
  return nav as unknown as NavBack & { cleared: number }
}

test('open and close keep their identity across re-renders', () => {
  const ref = { current: null }
  const host = mountHook(() => useLootDetail({}, ref))
  const first = host.value
  const again = host.render()
  assert.equal(again.open, first.open, 'open changed identity on a plain re-render')
  assert.equal(again.close, first.close, 'close changed identity on a plain re-render')
  host.unmount()
})

test('open stays stable when the nav prop changes, and still calls the LATEST nav', () => {
  const ref = { current: null }
  let nav = fakeNav()
  const host = mountHook(() => useLootDetail({ nav }, ref))
  const open = host.value.open
  const oldNav = nav
  nav = fakeNav()
  host.render()
  assert.equal(host.value.open, open, 'open changed identity when nav changed')
  host.act(() => host.value.open('Sphinx Claw'))
  assert.equal(nav.cleared, 1, 'open did not clear the current nav')
  assert.equal(oldNav.cleared, 0, 'open cleared a stale nav')
  assert.equal(host.value.selected, 'Sphinx Claw')
})

test('open saves the scroll position it is leaving', () => {
  const el = { scrollTop: 0 } as unknown as HTMLDivElement
  const ref = { current: el }
  const host = mountHook(() => useLootDetail({}, ref))
  // AFTER mount: the restore layout effect writes the saved offset (0) on the first commit.
  el.scrollTop = 1234
  host.act(() => host.value.open('Sphinx Claw'))
  el.scrollTop = 0
  host.act(() => host.value.close())
  assert.equal(el.scrollTop, 1234, 'closing the pane did not restore the saved scroll')
})

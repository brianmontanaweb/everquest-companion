// rawPref.ts — one live view of a renderer localStorage key, shared by every mounted reader in
// this window AND every other window of this origin.
//
// Extracted verbatim from features/combat/useCombatPrefs.ts (which still re-exports it) when the
// side-nav customization gained a third consumer. The mechanism and its measurement are unchanged
// — read that file's header for why a same-document setItem needs `notifyAll` and a cross-window
// one is served by the 'storage' event.

import { useCallback, useSyncExternalStore } from 'react'

const listeners = new Set<() => void>()

export function notifyAll(): void {
  for (const l of [...listeners]) l()
}

export function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  if (listeners.size === 1) window.addEventListener('storage', notifyAll)
  return () => {
    listeners.delete(cb)
    if (listeners.size === 0) window.removeEventListener('storage', notifyAll)
  }
}

function read(key: string, dflt: boolean): boolean {
  const v = localStorage.getItem(key)
  return v === null ? dflt : v === '1'
}

export function useRawPref(key: string): [string | null, (v: string | null) => void] {
  const value = useSyncExternalStore<string | null>(
    subscribe,
    () => localStorage.getItem(key),
    () => null
  )
  const set = useCallback(
    (v: string | null) => {
      if (v === null) localStorage.removeItem(key)
      else localStorage.setItem(key, v)
      notifyAll()
    },
    [key]
  )
  return [value, set]
}

function write(key: string, v: boolean): void {
  localStorage.setItem(key, v ? '1' : '0')
  notifyAll()
}

export function useBoolPref(key: string, dflt: boolean): [boolean, (v: boolean) => void] {
  const value = useSyncExternalStore(subscribe, () => read(key, dflt), () => dflt)
  const set = useCallback((v: boolean) => write(key, v), [key])
  return [value, set]
}

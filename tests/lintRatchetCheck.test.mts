/**
 * The ratchet-only-shrinks check. `eslint.ratchet.mjs` says THE RATCHET ONLY SHRINKS in
 * its own header; these pin the comparator that turns that sentence into a gate.
 *
 * The cases that matter are the two ways a register widens -- a NEW FILE, and a NEW RULE
 * on a file already listed -- because the second is the one a reader skims past. Shrinking
 * and standing still both pass: deleting an entry is the refactor wave doing its job.
 */
import { deepStrictEqual } from 'node:assert/strict'
import { test } from 'node:test'
import { compareRatchets, entryKeys } from '../scripts/checkLintRatchet.mjs'

const entry = (file: string, ...rules: string[]) => ({
  files: [file],
  rules: Object.fromEntries(rules.map((r) => [r, 'off']))
})

test('a ratchet that shrank adds nothing', () => {
  const base = [entry('a.ts', 'max-lines'), entry('b.ts', 'complexity')]
  const head = [entry('a.ts', 'max-lines')]
  deepStrictEqual(compareRatchets(base, head), [])
})

test('an unchanged ratchet adds nothing', () => {
  const base = [entry('a.ts', 'max-lines')]
  deepStrictEqual(compareRatchets(base, base), [])
})

test('a NEW FILE is caught', () => {
  const base = [entry('a.ts', 'max-lines')]
  const head = [entry('a.ts', 'max-lines'), entry('b.ts', 'max-lines')]
  deepStrictEqual(compareRatchets(base, head), ['b.ts\u0000max-lines'])
})

test('a NEW RULE on an existing file is caught', () => {
  const base = [entry('a.ts', 'max-lines')]
  const head = [entry('a.ts', 'max-lines', 'complexity')]
  deepStrictEqual(compareRatchets(base, head), ['a.ts\u0000complexity'])
})

test('one entry with several files expands to one key per file', () => {
  const keys = entryKeys([{ files: ['a.ts', 'b.ts'], rules: { 'max-lines': 'off' } }])
  deepStrictEqual([...keys].sort(), ['a.ts\u0000max-lines', 'b.ts\u0000max-lines'])
})

test('an empty base means every entry reads as new', () => {
  deepStrictEqual(compareRatchets([], [entry('a.ts', 'max-lines')]), ['a.ts\u0000max-lines'])
})

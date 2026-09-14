/**
 * The ratchet-only-shrinks check. `eslint.ratchet.mjs` says THE RATCHET ONLY SHRINKS in
 * its own header; these pin the comparator that turns that sentence into a gate.
 *
 * The cases that matter are the two ways a register widens -- a NEW FILE, and a NEW RULE
 * on a file already listed -- because the second is the one a reader skims past. Shrinking
 * and standing still both pass: deleting an entry is the refactor wave doing its job.
 *
 * The second group pins the OVERRIDE: the `Ratchet-Widening-Approved:` trailer that lets a
 * widening the integrator actually sanctioned go green without anyone merging over a red.
 */
import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { test } from 'node:test'
import {
  compareRatchets,
  entryKeys,
  hasRatchetWideningApproval,
  ratchetWideningApprovalLines,
} from '../scripts/checkLintRatchet.mjs'

const entry = (file: string, ...rules: string[]) => ({
  files: [file],
  rules: Object.fromEntries(rules.map((r) => [r, 'off'])),
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

/**
 * THE OVERRIDE. A widening the integrator genuinely sanctioned needs a way to go green, or
 * the gate is permanently red and the only remaining move is merging over it -- which is
 * how a gate stops being one. The trailer is that way; these pin it.
 *
 * What the check feeds the predicate is `git log <base>..HEAD`: EVERY message in the range,
 * not just the tip's. The fixtures below are that shape -- several messages run together --
 * because "approval ANYWHERE in the range" is the actual contract, and a predicate that
 * only read the tip would pass a tidier test and still fail in CI.
 */
const range = (...messages: string[]) => messages.map((m) => `${m}\n`).join('\n')

const APPROVAL = 'Ratchet-Widening-Approved: 104 entries from the mass reformat.'

test('growth with NO trailer anywhere in the range is not approved', () => {
  const messages = range(
    'Reformat the tree with Prettier\n\nWidens the ratchet by 104 entries.',
    'Fix two files Prettier did not stabilize',
    'Ship it\n\nCo-Authored-By: Someone <nobody@example.com>',
  )
  strictEqual(hasRatchetWideningApproval(messages), false)
  deepStrictEqual(ratchetWideningApprovalLines(messages), [])
})

test('a trailer on ANY commit in the range approves the widening, not just the tip', () => {
  const middle = range('Add Prettier config', `Reformat the tree\n\n${APPROVAL}`, 'Document it')
  strictEqual(hasRatchetWideningApproval(middle), true)
  deepStrictEqual(ratchetWideningApprovalLines(middle), [APPROVAL])

  // The same message first and last in range -- position must not matter.
  strictEqual(hasRatchetWideningApproval(range(APPROVAL, 'Later work')), true)
  strictEqual(hasRatchetWideningApproval(range('Earlier work', APPROVAL)), true)
})

test('the trailer is case-sensitive and must start its own line', () => {
  // Prose that merely MENTIONS the trailer is not the trailer. The override is only worth
  // having if nobody writes the real thing by accident, so a near-miss stays a near-miss.
  strictEqual(
    hasRatchetWideningApproval(range('See ratchet-widening-approved: in AGENTS.md')),
    false,
  )
  strictEqual(hasRatchetWideningApproval(range('  Ratchet-Widening-Approved: indented')), false)
  strictEqual(
    hasRatchetWideningApproval(range('Asked whether Ratchet-Widening-Approved: even applies')),
    false,
  )
})

test('a CRLF log still matches -- Windows is the only platform this repo runs on', () => {
  const messages = 'Reformat the tree\r\n\r\nRatchet-Widening-Approved: 104 entries.\r\n'
  strictEqual(hasRatchetWideningApproval(messages), true)
  deepStrictEqual(ratchetWideningApprovalLines(messages), [
    'Ratchet-Widening-Approved: 104 entries.',
  ])
})

test('several approving commits in one range are all reported', () => {
  const first = 'Ratchet-Widening-Approved: the reflow batch.'
  const second = 'Ratchet-Widening-Approved: one more, argued separately.'
  deepStrictEqual(ratchetWideningApprovalLines(range(`A\n\n${first}`, 'B', `C\n\n${second}`)), [
    first,
    second,
  ])
})

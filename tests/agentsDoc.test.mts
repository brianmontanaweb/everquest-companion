// ============================================================================
// agentsDoc.test.mts — AGENTS.md stays distilled (JOS-252's self-limiting
// tripwire).
// ============================================================================
//
// WHY. AGENTS.md is context every agent pays for before writing a line. At
// ~29,000 words it cost ~40k tokens per worker, so JOS-252 distilled it to
// essential learnings (~18k words) and moved every long-form war story
// VERBATIM to docs/agents-archive.md with pointers back. This suite is the
// trigger for the NEXT distillation: the file is allowed to grow as new
// learnings land, and when it crosses the ceiling the failure message states
// the protocol for cutting it back down.
//
// THE PROTOCOL (owner-agreed, JOS-252 — quoted by the failure message):
// distillation is done carefully by the integrator, never delegated to a
// worker, never mechanical truncation, archive before cutting.
//
// Concretely: every RULE survives VERBATIM; a rule's war story compresses to
// one line + the Linear ticket id (Linear holds the full history); nothing is
// deleted — long-form histories MOVE to docs/agents-archive.md with pointers
// back, so a cut that proves load-bearing is reversible in one paste.
//
// The word count is `split(/\s+/)` over the whole file — the same measure the
// JOS-252 ticket used to state the ~16-17k target and the 20k ceiling.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const AGENTS_MD = join(ROOT, 'AGENTS.md')
const ARCHIVE_MD = join(ROOT, 'docs', 'agents-archive.md')
/** The hard ceiling (words). The JOS-252 distillation landed ~18k against a
 * ~16-17k target, so there is real headroom for new learnings before this
 * fires — when it does, distill; do not nibble words to sneak under. */
const CEILING_WORDS = 20_000

/** The colocated docs the 2026-09-13 split moved live rule content into, each
 * with its own ceiling. Root AGENTS.md carries a pointer stub for every one of
 * them, so a missing file is a broken pointer, and a bloated one is the same
 * problem this suite exists to catch — just one directory down. Ceilings are
 * set well above what each file landed at, leaving room for the later phases
 * that will add to them; a phase that blows one distills rather than raises it.
 * ADD A ROW when a phase creates the next colocated doc. */
const COLOCATED_DOCS: readonly { path: string; ceiling: number }[] = [
  { path: join('engine', 'AGENTS.md'), ceiling: 8_000 },
  { path: join('src', 'main', 'AGENTS.md'), ceiling: 8_000 },
]

const wordCount = (text: string): number => text.split(/\s+/).filter(Boolean).length

test('AGENTS.md stays under the 20,000-word ceiling', () => {
  const words = wordCount(readFileSync(AGENTS_MD, 'utf8'))
  assert.ok(
    words <= CEILING_WORDS,
    `AGENTS.md is ${words} words — over the ${CEILING_WORDS}-word ceiling. ` +
      `Time for another distillation pass (see JOS-252). The protocol: ` +
      `distillation is done carefully by the integrator, never delegated to a worker, ` +
      `never mechanical truncation, archive before cutting. ` +
      `Every rule survives verbatim; war stories compress to one line + the Linear ` +
      `ticket id; long-form histories MOVE verbatim to docs/agents-archive.md with ` +
      `pointers back, so any cut is reversible in one paste.`,
  )
})

test('the archive that distillation moves history into exists beside it', () => {
  // The protocol is "archive before cutting" — a distilled AGENTS.md whose
  // archive has gone missing would make the next cut a deletion instead of a
  // move, so the archive's existence is part of the tripwire.
  assert.ok(
    existsSync(ARCHIVE_MD),
    'docs/agents-archive.md is missing. AGENTS.md is distilled (JOS-252) and its ' +
      'long-form histories live in that archive; restore it — distillation moves ' +
      'content, it never deletes it.',
  )
})

for (const { path, ceiling } of COLOCATED_DOCS) {
  const posix = path.split(/[\\/]/).join('/')

  test(`${posix} exists and stays under its own ceiling`, () => {
    const full = join(ROOT, path)
    assert.ok(
      existsSync(full),
      `${posix} is missing. Root AGENTS.md carries pointer stubs into it ` +
        `(2026-09-13 colocation split) — restore the file, or update those stubs ` +
        `to stop pointing at it. Colocation moves content; it never deletes it.`,
    )
    const words = wordCount(readFileSync(full, 'utf8'))
    assert.ok(
      words <= ceiling,
      `${posix} is ${words} words — over its ${ceiling}-word ceiling. ` +
        `Same protocol as the root file: distill carefully, archive before cutting. ` +
        `Raising this number is not the fix.`,
    )
  })
}

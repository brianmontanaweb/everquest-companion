# AGENTS.md colocation split — Phase 1 (engine)

## Context

Root `AGENTS.md` sits at ~19,890 words against its own 20,000-word ceiling
(`tests/agentsDoc.test.mts`, JOS-252's distillation protocol). A prose-level
distillation pass (2026-09-13, this session) found little further slack —
the file is already written in a near-maximally dense style and has been
through several incremental distillation commits. Looking at it
structurally instead found a much bigger lever: large sections of the file
describe subsystems that now live in specific directories, not the whole
repo, and several of them cite TypeScript module paths (`modules/buffs.ts`,
`combat/rounds.ts`, `charmModel.ts`, `rulesets.ts`) that no longer exist —
the fold and log parser moved to the Rust engine under JOS-459/JOS-499, and
the TS files were deleted. AGENTS.md's own text half-admits this ("where one
names a TypeScript file that is gone, read it for the rule") but never
updated the citations.

A directory-by-directory map of the whole file identified ~11,000 of the
~19,890 words as having a credible colocated home (`engine/`, `src/renderer`,
`build/`, `infra/`, `src/main`) versus ~4,900 words that are genuinely
cross-cutting (operating model, toolchain gotchas, linting policy) and
belongs in root regardless. That full map is not being executed at once —
it's staged, engine first, because engine is the only part of the map
verified line-by-line against the actual source tree so far (confirmed via
`ls` against `engine/crates/fold/src/modules/`, `engine/crates/eqlog`,
`engine/crates/knowledge`, and `src/main/data`). This document specs Phase 1
only.

Colocated `CLAUDE.md`/`AGENTS.md` files are already confirmed (by the repo
owner, from direct observation) to load reliably for worker subagents
dispatched into worktrees in this project's normal wave workflow — that
mechanism is not being re-verified here.

## Scope — what moves

New file: **`engine/AGENTS.md`**.

Moved verbatim from root `AGENTS.md` (current line numbers as of this
session's earlier distillation pass):

| Lines | Content |
|---|---|
| 483–491 | Log-clock law (JOS-536) — `eqlog::resolve_zone`, the host-clock/UTC-fallback rule |
| 492–497 | Engine-comment law (JOS-524) — what a comment inside engine code may say |
| 499–501 | The "world-model laws below are still the law" preamble (becomes this file's intro) |
| 516–566 | Four stranded fold laws that were sitting under the `## Architecture` header without their own home: JOS-172 (transport increments+rebuild), JOS-87 (module `seq` reporting), character epochs, JOS-134 (logout pause vs. debuff decay) |
| 795–968 | `## World-model laws` — the numbered list, laws 1–13 |
| 969–999 | `## The fold checkpoint, and why there isn't one` |

≈ 3,000 words total. Every one of these either cites a now-deleted TS path
(confirmed dead) or a live Rust path under `engine/crates/{fold,eqlog}`
(confirmed present) — this is the subset of the earlier full-document map
that needed no judgment call, only a source-tree check.

## Scope — what does NOT move (explicitly deferred)

- **Lines 502–513** (a Maps/renderer/overlay paragraph physically stranded
  in the middle of the block above, unrelated to it — looks like a past
  merge artifact, possibly alongside the orphaned closing code-fence at line
  514 with no matching open). Left exactly in place. Out of scope for this
  change; flagged so it isn't mistaken for reviewed-and-kept-on-purpose.
- **`## Log-format quick reference`** (~2,800 words). Likely mostly `eqlog`
  territory (raw line-shape → event parsing) but at least the charm/mez/slow
  roster-derivation bullets cite `tests/charmCcRoster.test.mts` — a
  node:test file, meaning that logic may still be TypeScript-owned even
  though the alert-matching that consumes it (`alerts.rs`, `alerts_rules.rs`)
  is now Rust. Needs the same bullet-by-bullet source-tree verification Phase
  1 got before it can move safely. **This is Phase 2.**
  > **PHASE 2 OUTCOME (same day): the caution above was wrong, and the whole
  > section moved.** The verification found `tests/charmCcRoster.test.mts`
  > does not exist any more — nor do `tests/calmLineTimers.test.mts`,
  > `tests/combatSmiteLane.test.mts`, `tests/combatRangedLane.test.mts`,
  > `tests/petSummonNudge.test.mts`, `tests/comboSwapBoundary.test.mts`,
  > `log/parseCombat.ts`, `combat/specialAttacks.ts`, `rulesets.ts` or
  > `charmModel.ts`. Every one has a live Rust equivalent, several carrying
  > the same historical facts: `fold::combat::spellfacts::{is_charm_spell,
  > is_cc_spell}` (with a test asserting the exact JOS-200 Solon's-Bravura
  > fact the doc cites), `buffs_stats::calms_target`, `jsfn::zone_tier`
  > (matching the JOS-166 d1–d4 tiers), `eqlog::parse::world` +
  > `fold::modules::leveling` for AA. The two surviving TS files that looked
  > like counter-evidence — `src/shared/kills.ts`, `src/shared/aaLedger.ts` —
  > are imported only by renderer UI components, so they are display-layer
  > reshaping rather than the parsing logic the section described. **Lesson
  > for later phases: a citation's mere presence in the prose proves nothing,
  > and neither does a cited file still existing on disk — check who imports
  > it.**
- **Spell DB / Alerts / corrections / removals / audio content** (lines
  567–753, ~1,500+ words, still under `## Architecture`). Confirmed to span
  three different owners: `src/main/data` (spells.json, spellCorrections*,
  spellRemovals* — still TypeScript), `src/shared` (alertCaptures.ts,
  alertTargets.ts), and `engine/crates/fold/src/modules/alerts*.rs` (the
  matching logic, now Rust). Not a single-directory move — needs its own
  design, not folded into this one.
- The rest of the original full-document map (`src/renderer` ← UI
  conventions, `build/` ← installer architecture, `infra/` ← Cloud section,
  `src/main` ← Electron trust boundary + Data sources) — sequenced as
  later phases, each re-verified against the source tree the way Phase 1
  was, not assumed from the original word-count table alone.

## Design

**`engine/AGENTS.md` header** (new framing, not moved text):

```markdown
# engine/AGENTS.md — the Rust engine's fold and transport law

Moved from the root AGENTS.md (2026-09-13, phase-1 colocation
split). This file holds the domain semantics for `engine/crates/fold` and
`engine/crates/eqlog`: what the fold's transport contract guarantees, module
revision/epoch rules, character-epoch and logout-pause handling, the
log-clock law, and the engine-comment law — the "why" behind the code, not
its porting status. See also `engine/crates/fold/README.md` (module wiring,
what's ported) and `engine/crates/engined/README.md` (process/protocol). The
root `AGENTS.md` carries the operating model, workflow rules, and everything
outside this crate group; read both when your work touches the engine.
```

Followed by the moved content verbatim, in its original order.

**Root `AGENTS.md` changes:**

1. Lines 483–501 replaced by one consolidated pointer paragraph (placed
   where the log-clock law currently sits) — short enough to keep the
   `behindMs`-diagnostic takeaway usable without engine devs needing to
   click through for the common case:

   ```markdown
   **THE FOLD'S SEMANTICS NOW LIVE IN `engine/AGENTS.md`** (moved
   2026-09-13 — the log-clock law, the engine-comment law, and
   every world-model law below it, JOS-172/JOS-87/character-epoch/JOS-134
   included). Read it before touching `engine/crates/fold` or
   `engine/crates/eqlog`; a `behindMs` of exactly N hours in a perf block is
   the log-clock bug named there.
   ```

2. Lines 516–566 (the four stranded laws) deleted outright — covered by the
   pointer above, no separate stub needed since they had no heading of
   their own to preserve.
3. `## World-model laws` (795) and `## The fold checkpoint` (969) headers
   **stay** (so a reader scanning headers doesn't lose the landmark) but
   their bodies collapse to a one-line pointer each to `engine/AGENTS.md`.
4. Root's own preamble (lines 3–9, the "Distilled operating manual..."
   paragraph) gets one added sentence noting the colocation split exists,
   so a first-time reader learns the pattern immediately: content can now
   live in a colocated `AGENTS.md` under a subdirectory, not only in
   `docs/agents-archive.md`.

**Test coverage:** extend `tests/agentsDoc.test.mts` with a parallel check —
`engine/AGENTS.md` stays under its own ceiling (proposed: 8,000 words —
generous headroom over the ~3,000 landing there, room for Phase 2's
~2,800-word log-format addition plus growth). Existing two tests
(root ceiling, archive-exists) unchanged in behavior, just joined by a third
in the same file, same style.

**Ticket:** none. The `JOS-nnn` ids throughout root `AGENTS.md` belong to the
upstream project's Linear workspace, which this fork does not use — so this
work and every later phase is cited **by date** (`2026-09-13`) instead,
matching how the doc already dates owner rulings and prior distillation
passes. Do not mint new `JOS-` ids for work done here; a fabricated id is
worse than no id, because every other one in the file resolves to something
real.

## Verification

- `python -c` word count on both files before/after (mirrors this session's
  earlier distillation verification).
- `node --import tsx --test tests/agentsDoc.test.mts` — all three assertions
  green.
- Diff review: confirm every moved block landed in `engine/AGENTS.md`
  byte-for-byte (aside from the new header), and that nothing in the
  deferred list (lines 502–513, 567–753, `## Log-format quick reference`)
  was touched.
- Not automated here, left to the owner as a real-world check when
  convenient: dispatch a worker into `engine/` on an unrelated ticket and
  confirm it cites a rule from `engine/AGENTS.md` unprompted, as a live
  proof the colocation is actually being read before Phase 2 repeats the
  pattern at larger scale.

# Prettier setup — task list

Branch: `tooling/prettier-setup-2026-09-13`. Plan: [2026-09-13-prettier-setup.md](2026-09-13-prettier-setup.md).

## Commits

- [x] **Task 0 — Branch.** Worktree fast-forwarded to latest `origin/main`
  (includes the merged security-audit-fixes PR) before any work started.
- [x] **Task 1 — Install Prettier + wire config (no reformat yet)** `9b2fc654`
- [x] **Task 2 — Mass reformat** `d518b711`
- [x] **Task 2b — Fix round: 2 files Prettier didn't fully stabilize;
  reword ratchet batch comment** `e4e22bc7`
- [x] **Task 3 — `.git-blame-ignore-revs`** `10499a5f`
- [x] **Task 4 — husky + lint-staged pre-commit hook** `8ee3ebd0`
- [x] **Task 5 — CI enforcement (`prettier --check` in both build.yml
  jobs)** `3d13e6d5`
- [x] **Task 6 — Document Prettier in AGENTS.md** `64e70f72`
- [x] **Task 7 — Materialize plan/todo docs, push, open PR (not merged —
  owner's call)** `cbe63b6b`, `5bb57f7b`
- [x] **Final whole-branch review — fix wave: `.gitattributes` `eol=lf` for
  the Prettier-formatted extensions, a documented override on the
  ratchet-only-shrinks gate, and the doc corrections below** `f94698b6`,
  plus this docs follow-up recording its verified CI result

## Task 1 — what actually happened

Went as planned. Dependencies installed, `prettier.config.mjs` and
`.prettierignore` created, `format`/`format:check` scripts added,
`eslint-config-prettier` wired into `eslint.config.mjs`. Verified `typecheck`
and `lint` stayed clean (no regression from the new ESLint layer) and
`format:check` failed across most of the tree as expected, before any
reformat happened. Review: spec-compliant, every value checked byte-for-byte
against the brief. One deferred minor, not worth a fix round: the
`format`/`format:check` scripts landed near `lint:ratchet` rather than
immediately adjacent to `lint`/`lint:fix` — same logical group, zero
functional impact.

## Task 2 — what actually happened (the plan undersold this badly)

The plan flagged `max-lines`/`max-lines-per-function` shifting across
thresholds as a real risk ("possibly a couple" new ratchet entries) and told
the implementer to stop and escalate rather than widen the ratchet
unilaterally if that happened. It happened, but at a scale and with a second
mechanism the plan never named.

**What the reformat actually surfaced:**

1. **`npm run lint`: 114 new errors, not "possibly a couple."** 84
   `max-lines` + 20 `max-lines-per-function` violations across 104 files —
   production source (`src/main/store.ts`, `src/shared/types.ts`,
   `src/preload/index.ts`, many `.tsx` views) and 61 test files — all driven
   by Prettier's reflow shifting measured line counts across the *same*
   existing thresholds, not by any new complexity. **Plus a mechanism the
   plan never mentioned at all:** 10 more errors across 5 files where
   Prettier's reflow separated an
   `// eslint-disable-next-line eqc/no-domain-munging` comment from the
   statement it suppressed, so ESLint flagged both an unused-disable and the
   original violation it used to silence.
2. **`npm test`: 15 failing, not the 3 pre-existing.** The repo's 3
   pre-existing failures (unrelated `%20`-in-checkout-path `ENOENT`s from a
   `new URL(...).pathname` bug — present on any checkout with a space in its
   path, ruled out of scope for this plan since it predates it and isn't
   touched by any task here) were unchanged. **12 new failures**, all one
   root cause: this repo's "structural source pin" test convention
   (`readFileSync` + strip comments + regex-match an exact *single-line*
   rendering of a specific statement). Prettier's printWidth-100 reflow
   wrapped exactly those pinned statements onto multiple lines, breaking 12
   regexes across 9 test files.

Neither finding was the implementer's or the controller's to resolve
unilaterally — both bend conventions (the ratchet, the source-pin tests)
that this repo's own documentation reserves for the integrator/owner.
Escalated with a full report; reformatted tree left uncommitted for
inspection pending a decision.

**Owner rulings:**

- **Widen the ratchet now, in the same commit**, via `npm run lint:ratchet`
  (a sanctioned re-baseline per the ratchet's own header contract) —
  restoring the hand-written JOS-427 comment on `src/main/windows.ts` (which
  regeneration drops) plus a new explanatory block comment naming this as a
  one-time, mechanical, reflow-driven re-baseline, not routine "make lint
  green" widening.
- **Loosen the 12 source-pin test regexes** (whitespace-normalize before
  matching, extending the tests' own existing comment-stripping technique)
  rather than exempting 9 files from Prettier.
- (Controller's own call, mechanical, no policy tradeoff): relocate each of
  the 5 domain-munging `eslint-disable-next-line`/`-line` comments to the
  line ESLint now flags, rather than ratcheting them.

**Executing the rulings surfaced one more real thing:** of the 12 regex
fixes, 10 were genuinely the anticipated line-wrap issue. The other 2
(`healthCounters.test.mts`, `imageCacheHeal.test.mts`) were not — they
uncovered a **genuine pre-existing bug in those two test files' own
extraction logic**, not in `src/main/imageCache.ts` itself (which has no
defect — it was never touched by this fix). Each test slices a region of
`imageCache.ts`'s source text between two `indexOf()` calls to build its
structural pin, and the second call
(`indexOf('return null\n  }')`) had no start bound, so it could match an
earlier, unrelated occurrence of that same closing text elsewhere in the
file, producing an inverted/empty slice. This was previously masked because
the search used a literal LF and the file was CRLF before this plan's
`endOfLine: 'lf'` setting normalized it — confirmed via
`git show HEAD:src/main/imageCache.ts` that this predates the plan and had
nothing to do with Prettier. Fixed by bounding both `indexOf` calls with a
start index, in the two test files themselves (a 1-line change each,
reviewed and approved).

Ratchet re-baseline landed 100 files / 105 entries total (the 104 new,
reflow-driven file×rule entries above plus the 1 pre-existing
`src/main/windows.ts` entry that predates this plan). `npm run lint` came
back fully clean; commit `d518b711`.

`d518b711` also rewrites `lint-worklist.md` (137 insertions). That is **not
an oversight or a stray file** — `npm run lint:ratchet` writes the register
and the worklist in the same pass (see `scripts/lint-report.mts`), so the
two always move together and a re-baseline that updated only
`eslint.ratchet.mjs` would be the suspicious one. The worklist is the
human-readable companion to the machine-readable register — the same
inventory, grouped into the five refactor waves — and `lint-report.mts`'s
own header names both outputs in the same breath.

**Fix round (commits `d518b711`..`e4e22bc7`):** review of `d518b711`
mechanically reconstructed `prettier(base)` for all 1338 changed files and
diffed against HEAD, corruption-tested all 11 testable regex pins, and
traced the `indexOf` bug through both blobs of `imageCache.ts` — spec mostly
compliant, one real gap: `npm run format:check` still failed on 2 files
(`src/renderer/src/features/combat/dpsChart.ts:279-283`, where Prettier
wanted to paren-wrap a chain, and
`tests/mainThreadWrites.test.mts:96-99,123-126`, a multi-line `assert.match`
call that now fit on one line under `printWidth:100`). Both behavior-safe
either way, but the task's own deliverable is a Prettier-clean tree.
`e4e22bc7` fixed both and reworded the ratchet's batch comment for accuracy
("re-baseline after a deliberate rule-set change" was a stretch — no rule
*threshold* changed, only measured line counts shifted under the same
thresholds).

**Net result:** `d518b711` + `e4e22bc7` together are Task 2's real
deliverable — a Prettier-clean tree, `npm run lint` clean via the approved
ratchet re-baseline, all 12 source-pin regexes fixed (10 wrap-tolerant, 2
carrying a real bug fix), and the 5 domain-munging comments relocated
correctly.

## Task 3 — what actually happened

Nearly identical to plan, one mechanical deviation: `.git-blame-ignore-revs`
needed **both** Task 2 commits (`d518b711` and `e4e22bc7`), not the single
SHA the original brief anticipated, since Task 2's fix round happened after
that brief was written. Verified with `git blame --ignore-revs-file` on both
`windows.ts` and `dpsChart.ts` (the file that specifically needed the second
SHA to resolve correctly).

## Task 4 — what actually happened

Scoped as planned, with one platform-driven deviation from the brief's exact
instructions. The brief specified a bare `npx lint-staged` in
`.husky/pre-commit` with no shebang — what generic Husky v9 docs recommend.
On this Windows/Git-for-Windows machine that reproducibly failed twice
("cannot spawn .husky/pre-commit: No such file or directory"), including
after `chmod +x`; adding `#!/usr/bin/env sh` fixed it. Since this repo is
Windows-only (README: "Requires 64-bit Windows 10 or 11"; CI runs
`windows-latest`), every real user of this hook is on this exact platform —
the shebang is required here, harmless on POSIX. Kept as executed; verified
independently (clean `git status`, `git config core.hooksPath` correctly
`.husky`, no residue from an incidental `npx husky --version` mishap during
setup). Review: spec-compliant, shebang deviation and cleanup both verified
directly rather than taken on trust. Approved.

## Task 5 — what actually happened (the implementer was right; the investigation that dismissed them was not)

The CI wiring itself went exactly as scoped — two `Format check` YAML steps,
one per job in `build.yml`, correctly positioned and indented, nothing else
touched. What went wrong was the verification around it, and it is worth
recording precisely, because the same two tests will look convincing to the
next person who reaches for them.

**The implementer flagged a real defect and was overruled.** They reported
DONE_WITH_CONCERNS on a `prettier --check src/shared/ipc.ts` failure,
characterizing it as "pre-existing... CI will fail until resolved
separately." That characterization was **correct**. It was dismissed at the
time as a benign Windows stat-cache artifact, on the strength of two tests
that could not, even in principle, have detected the thing they were used to
rule out:

- **`git hash-object` cannot see this class of bug.** The argument was that
  `git hash-object src/shared/ipc.ts` exactly equaled
  `git rev-parse HEAD:src/shared/ipc.ts`, so the working file must be
  byte-identical to the committed blob. It is not: `hash-object` applies the
  **same clean filter** that produced the blob, so a CRLF working-tree file
  and its LF blob hash identically **by construction**. The test returns
  "identical" for a corrupted file and a clean one alike. (`git ls-files
  --eol` is the tool that actually answers this; it reported `i/lf w/crlf`
  on that exact file the whole time.)
- **The `git checkout --` control test was a silent no-op.** A real
  `git checkout -- src/shared/aa.ts` was run on an untouched, already-clean
  file and, surviving unchanged, was taken to refute the systemic theory.
  But git **skips rewriting a file its stat cache already considers
  unchanged**, so no smudge filter ever ran. The test exercised nothing.

**What was actually wrong, and it was systemic exactly as first suspected.**
`prettier.config.mjs` sets `endOfLine: 'lf'`, and Prettier reads the
**working tree**, never the git blob. `.gitattributes` pinned `eol=lf` on
only three paths, so every other source file — all 1493 of the
Prettier-formatted ones — inherited `core.autocrlf=true`'s LF→CRLF smudge on
checkout. That is the Git-for-Windows default and it is what GitHub's
`windows-latest` runners do. `ipc.ts` was simply the one file in this
worktree that had been genuinely re-checked-out (by Task 4's
hook-verification test) and so was the only local symptom of a tree-wide
condition.

**How it was finally caught.** The final whole-branch review reproduced an
actual fresh checkout with `git checkout-index -a --prefix=<tmp>/` — a
non-mutating simulation that, unlike `git checkout --`, does **not** skip
files — and cross-referenced the real CI run on PR #8: `Format check` red on
**1493 files**, an exact match. The lower-confidence note carried out of this
task ("worth eyeballing the first real CI run after this branch is pushed")
turned out to be the whole finding.

**The fix.** `.gitattributes` now forces `eol=lf` on every extension
`format`/`format:check` covers (`*.ts *.tsx *.mts *.cts *.js *.jsx *.mjs
*.cjs`, one line per extension — `.gitattributes` patterns are fnmatch, not
shell globs, so no brace expansion), with a comment tying it to
`prettier.config.mjs`'s `endOfLine: 'lf'`. `prettier.config.mjs`'s own
comment was corrected too: it had justified the setting as "matches what git
actually stores," which is the category error at the root of the whole
episode — what git stores is irrelevant to a tool that reads the working
tree. See the final-review section below.

## Task 6 — what actually happened

Exactly as scoped: one new `## Formatting (Prettier)` section in AGENTS.md,
directly after `## Linting`, matching that section's terse bulleted style.
Review confirmed verbatim content match, correct insertion point, and that
its claims (CI gating, scope, the pre-commit hook) were accurate against
Tasks 1-5's actual landed state. No findings.

## Final whole-branch review — what it caught, and the one fix wave

The review ran the full suite fresh and, crucially, read the **real CI run on
PR #8** rather than trusting local commands. Two merge-blocking findings, both
things every local check had reported green.

**1. `Format check` was red in CI on 1493 files — a real defect, not a flake.**
Root cause and fix are written up in the Task 5 section above, along with why
the earlier investigation's two "disproofs" could not have worked. The fix is
`.gitattributes`: `eol=lf` on `*.ts *.tsx *.mts *.cts *.js *.jsx *.mjs *.cjs`,
one line per extension, appended to the file's existing JOS-251 section (which
already explained this exact autocrlf mechanism for three other paths — the
gap was scope, not understanding). `prettier.config.mjs`'s `endOfLine` comment
was rewritten in the same commit: it had described the setting as matching
"what git actually stores," and that sentence is the whole bug in miniature.
The two files are now a documented pair — change one list and you must change
the other.

**2. The ratchet-only-shrinks gate had no way to accept an approved widening.**
`scripts/checkLintRatchet.mts` failed unconditionally whenever the register
grew, and its advisory said "if this widening is deliberate and yours to make,
say so in the commit message" — pure prose, enforced by nothing. So the
owner-approved 104-entry re-baseline from Task 2 would have kept this gate red
forever, and the only remaining move would have been merging over it.

Owner decision: **add a documented override, not merge over red.** The
mechanism is a git trailer in the style of `Co-Authored-By:`, checked across
**every** commit message in `<base>..HEAD` (the widening commit is rarely the
tip):

```
Ratchet-Widening-Approved: <why, in one sentence>
```

Present anywhere in range, the growth passes **and is still printed in full**,
with the approving commit named beside it — an override that hid what it
waived would be worse than no gate. Absent, behavior is byte-for-byte
unchanged: fail, naming every new entry. The predicate
(`hasRatchetWideningApproval`) and its audit-line companion
(`ratchetWideningApprovalLines`) are exported and unit-tested in
`tests/lintRatchetCheck.test.mts` alongside the existing comparators, written
test-first: trailer absent anywhere in a multi-commit range ⇒ false; trailer on
*any* commit in range (first, middle, last) ⇒ true; case-sensitive and
line-anchored, so prose that merely mentions the token is not an approval.
That last property is the point — a waiver is only trustworthy if it cannot be
written by accident.

Three documentation minors were fixed in the same wave: this file's
`lint-worklist.md` note (Task 2 section), Task 7's own unchecked checklist
entry, and the plan doc's "full gate green at the tip" claim.

**Verified against the real CI run, not locally** — which is the entire point
of this wave, since local verification is what was insufficient the first
time. Run
[34776822237](https://github.com/brianmontanaweb/everquest-companion/actions/runs/34776822237),
`build` job, commit `f94698b6`:

```
Format check                 ✓  "All matched files use Prettier code style!"
Lint ratchet only shrinks    ✓  GREW by 104 entry/entries vs 3e72d03d…
                                APPROVED: widening sanctioned by 1 commit(s) in range:
                                  f94698b6  Ratchet-Widening-Approved: 104 entries …
Test                         ✗  pass 4248, fail 1 — the AGENTS.md ceiling, below
```

Both fixed gates went from red (or never-reached) to green in CI. The
`.gitattributes` fix was additionally proven locally with the same
non-mutating fresh-checkout simulation that found the bug: **0 of 1498**
Prettier-formatted files come out with CRLF, while **54 of 54** unpinned
`.md`/`.yml` files in the same extraction do — so the smudge filter was
demonstrably running and the `eol=lf` pins are what stop it. `git ls-files
--eol` now reports `w/lf` on every source file, including `src/shared/ipc.ts`,
which was `w/crlf` throughout Task 5.

**Not this plan's problem, deliberately untouched:** the `engine` CI job's
`combat.rs` test is red. This branch touches **zero** Rust files
(`git diff --stat` is empty for `engine/`); it is a wall-clock-sensitive test
on a loaded runner, pre-existing and unrelated. Noted, not investigated.

### Open, and escalated rather than fixed: AGENTS.md is over its word ceiling

Surfaced by the fix wave running the full suite (CI had never reached its
`Test` step — `Format check` failed first, every run). **`tests/agentsDoc.test.mts`
fails: AGENTS.md is 20,193 words against a 20,000-word ceiling.** It is caused
by this branch, and the arithmetic is worth stating because it changes what the
fix is:

| ref | AGENTS.md words |
|---|---|
| `origin/main` / base `3e72d03d` | **19,997** |
| after Task 4 (`8ee3ebd0`) | 20,061 — already over |
| after Task 6 (`64e70f72`) | 20,193 |

`main` was sitting **three words** under the ceiling. So this is not "Tasks 4
and 6 were too wordy" — **any** addition to AGENTS.md, by any branch, would
have tripped this tripwire, and this plan simply happened to be the one that
did. Reverting both additions would land back at 19,997 and leave the next
contributor with the same three words of headroom.

The real fix is the distillation pass the tripwire exists to trigger, and the
test's own failure message states the protocol (JOS-252): *"distillation is
done carefully by the integrator, never delegated to a worker, never
mechanical truncation, archive before cutting."* The fix wave is a worker.
**So it is left untouched and escalated to the owner/integrator, deliberately,
rather than nibbled under the line** — which the protocol also names as the
wrong move. Until that pass happens, the `build` job's `Test` step is red on
this branch, and the plan doc says so instead of claiming a green tip.

## Deliberately NOT done / parked

- **No merge.** PR opened for review; per AGENTS.md's branch-integration
  rule, merge is the owner's or an integrator's call, not the executor's.
- **The ratchet's 84 `max-lines` re-baseline entries are a real, accepted
  coverage-loss tradeoff, not a residual defect.** Each of those 84 files
  crossed the line-count ceiling purely from Prettier's reflow, not real
  complexity growth, so each now needs a genuine refactor to re-earn the
  ceiling rather than "undo a formatting change." A reviewer's suggested
  alternative (a one-time threshold bump to absorb the mechanical delta)
  would be a materially different design requiring a fresh measured
  threshold, not what the owner approved ("widen the ratchet"). This is
  exactly the cost the original ruling's own "Widen the ratchet now
  (Recommended)" option named up front ("an explained, one-time, mechanical
  cause, not hidden debt") — already adjudicated, not reopened here.
- **Two `.tsbuildinfo` files rode along via `git add -A`** during the mass
  reformat. Pre-existing repo hygiene gap (they're tracked, absent from
  `.gitignore`) unrelated to this plan — deferred, out of scope.
- **`.husky/pre-commit` is committed as mode 100644, not 100755.** Inert on
  Windows/Git-for-Windows (this repo's only currently supported platform),
  where `core.fileMode` is commonly unenforced. Only matters if non-Windows
  contributors are ever added.
- **An AGENTS.md forward reference (Task 4's own bullet, unrelated to
  `.tsbuildinfo`):** the Task 4 bullet said "CI runs `npm run format:check`"
  before Task 5 (which actually wires that) had landed — a forward reference
  within the same plan, true by the time the branch was reviewed as a whole,
  not a real gap.
- **`indexOf` fix robustness:** the 2-file test-extraction fix
  (`healthCounters.test.mts`, `imageCacheHeal.test.mts` — both slice
  `imageCache.ts`'s source text, neither is a change to `imageCache.ts`
  itself) could additionally assert `readEnd > readStart` to close the
  failure class more robustly rather than just relying on the bounded start
  index. Real improvement, not required; left for a future pass.
- **`format`/`format:check` script placement** (Task 1) landed near
  `lint:ratchet` rather than immediately adjacent to `lint`/`lint:fix` in
  `package.json`. Same logical script group, zero functional impact, not
  worth a dedicated fix.

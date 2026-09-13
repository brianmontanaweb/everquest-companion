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
- [ ] **Task 7 — Materialize plan/todo docs, push, open PR (not merged —
  owner's call)**

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
uncovered a **genuine pre-existing bug** in `src/main/imageCache.ts`: an
unbounded `indexOf('return null\n  }')` call that matched an earlier,
unrelated occurrence of that same text, producing an inverted/empty slice.
This was previously masked because the search used a literal LF and the file
was CRLF before this plan's `endOfLine: 'lf'` setting normalized it —
confirmed via `git show HEAD:src/main/imageCache.ts` that the bug predates
this plan and had nothing to do with Prettier. Fixed by bounding both
`indexOf` calls with a start index (a 1-line change in 2 test-adjacent
source locations, reviewed and approved).

Ratchet re-baseline landed 100 files / 105 entries. `npm run lint` came back
fully clean; commit `d518b711`.

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

## Task 5 — what actually happened

The implementer reported DONE_WITH_CONCERNS, flagging a `prettier --check
src/shared/ipc.ts` failure as "pre-existing... CI will fail until resolved
separately." Given the stakes (a CI gate reported broken on arrival would
undermine the whole task, and `ipc.ts` is the exact file Task 4's
hook-verification test had touched-then-reverted), this was investigated
directly rather than trusted:

- First worried it was systemic: this worktree runs `core.autocrlf=true`,
  and `windows-latest` CI runners commonly default the same way, so a fresh
  `actions/checkout` smudging LF→CRLF tree-wide could make `format:check`
  red on the very next CI run. **Tested directly:** forced a real `git
  checkout --` on an untouched, already-clean file — it was not corrupted,
  still passed `prettier --check`. Systemic theory refuted.
- Ran `prettier --write` on `ipc.ts`: zero content change (`git diff`
  empty, only an informational CRLF-on-next-touch warning). Re-ran the
  single-file check — passed. Ran the real gate exactly as CI will,
  `npm run format:check` (full-tree glob) — clean.
- `git status --short` still flagged `ipc.ts` as modified, but
  `git hash-object` on the working file exactly equaled
  `git rev-parse HEAD:src/shared/ipc.ts` — byte-identical to the committed
  blob. This is the same benign Windows stat-cache artifact Task 2's
  implementer had already documented elsewhere (157 files flagged `M` with
  zero real diff, verified the same way).

**Ruling: not a real defect.** The implementer's "pre-existing, will fail
CI" characterization was wrong — most likely a transient/stale read at the
moment it was checked. The gate that actually matters, the full-tree
`format:check`, was clean. Not re-dispatched for a non-issue; task review
proceeded with this corrected context. One residual, lower-confidence note
carried forward but not blocking: this only proves the current worktree's
checkout path is safe, not that GitHub's `windows-latest` runner's git
config behaves identically on a genuinely fresh clone — worth eyeballing
the first real CI run after this branch is pushed. Review: spec-compliant,
exactly 2 YAML steps added, correctly positioned and indented. No findings.

## Task 6 — what actually happened

Exactly as scoped: one new `## Formatting (Prettier)` section in AGENTS.md,
directly after `## Linting`, matching that section's terse bulleted style.
Review confirmed verbatim content match, correct insertion point, and that
its claims (CI gating, scope, the pre-commit hook) were accurate against
Tasks 1-5's actual landed state. No findings.

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
- **A `.tsbuildinfo`-adjacent AGENTS.md forward reference:** the Task 4
  bullet said "CI runs `npm run format:check`" before Task 5 (which actually
  wires that) had landed — a forward reference within the same plan, true by
  the time the branch was reviewed as a whole, not a real gap.
- **`indexOf` fix robustness:** the 2-file `imageCache.ts`-adjacent fix could
  additionally assert `readEnd > readStart` to close the failure class more
  robustly rather than just relying on the bounded start index. Real
  improvement, not required; left for a future pass.
- **`format`/`format:check` script placement** (Task 1) landed near
  `lint:ratchet` rather than immediately adjacent to `lint`/`lint:fix` in
  `package.json`. Same logical script group, zero functional impact, not
  worth a dedicated fix.

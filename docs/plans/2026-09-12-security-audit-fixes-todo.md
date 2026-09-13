# Security audit remediation — task list

Branch: `security/audit-fixes-2026-09-12`. Plan: [2026-09-12-security-audit-fixes.md](2026-09-12-security-audit-fixes.md).

## Commits

- [x] **Task 0 — Branch.** Clean tree on `main`, `security/audit-fixes-2026-09-12` cut.
- [x] **Task 1 — HIGH: logScrub allowlist backstop** `d7d82927`
- [x] **Task 1b — lint fixup** (wireSanitize.test.mts over the 400-line cap) `0cd8756f`
- [x] **Task 2 — MEDIUM: packRegistry decompression caps** `32d351ca`
- [x] **Task 3 — MEDIUM: preload sandboxing** `e6a626a5`
- [x] **Task 4 — LOW: SECURITY.md documentation** `d1378a4a`
- [ ] **Task 5 — Push branch + open PR (not merged — owner's call)**

## Task 1 — what actually happened (the plan undersold this one badly)

The approved plan scoped this as "port the Rust parser's KEPT categories,
plus the ~2,000-entry spell-message corpus, plus a documented residual for
anything the live parser doesn't classify." Three things blew past that scope
during verification, each caught by actually running the fixture regression
check rather than trusting the design:

1. **The scrape has a systematic artifact.** 257 of 796 `msgCastOnOther`
   entries in `src/main/data/spells.json` have a stray space before a
   possessive (`"Someone 's brain begins to melt."`), which the real client
   text never has (`"Lord Nagafen's brain begins to melt."`). Fixed by
   collapsing `/^\s+(?=')/` after stripping the placeholder subject word.
2. **The initial full-allowlist design dropped 5,873 of 93,412 real fixture
   lines** (520 distinct message bodies) that used to survive — almost all
   genuine mob-combat/system facts (third-person "spell is interrupted",
   "regains concentration", "is tortured by the condemnation of X", faction
   adjustments, hunger/thirst, auto-attack toggles) that the live Rust parser
   simply doesn't bother classifying into a typed `Kind` (`Kind::Unknown`
   live too), which is not the same as them being unsafe. A shape-based
   "only default-deny name-attributed sentences" heuristic was considered and
   rejected: most of the drift IS name-attributed (a mob's name), so the
   heuristic would have caught almost none of it. Fixed the honest way —
   measured every distinct drifted body against the actual fixture corpus
   and extended `KNOWN_SAFE` with ~90 additional real patterns (two new
   categories, `MOB_STATUS_SAFE` and `SYSTEM_UI_SAFE`, in
   `logLineTemplates.ts`). Landed at **3 residual lines** (`Daring`,
   `Symbol of Ryltan`, one ambiguous NPC-warning-shaped sentence), all
   single-occurrence and left undecided rather than guessed at.
3. **Continuation lines** (no per-line timestamp — a wrapped fragment of
   whatever line preceded it) were getting caught by the new default-deny
   fallback, since a text fragment can't match a full-sentence KNOWN_SAFE
   pattern. `feedbackSlice.ts`'s own window logic already treats them as tied
   to the preceding line, never a freshly-typed command — exempted them
   explicitly (`body(line) === line` ⇒ old "drop only if DROP matches" rule).
   Caught by `tests/feedbackSlice.test.mts`'s existing continuation-line
   test, not a new one.

Two existing test files needed real fixes, not loosened assertions:
`wireSanitize.test.mts` and `feedbackSlice.test.mts` both used synthetic
combat/heal/level-up placeholder lines that didn't match real EverQuest
grammar closely enough to survive the new allowlist (e.g. `"You have been
healed for 120 points of damage."` — not a real message shape; the real one
is `"X healed Y for N hit points."`). Corrected to real shapes.

**Net verification:** before/after diff of `tests/fixtures/*.log` (all
93,412 lines) shows **zero** lines flipping kept→dropped in the *unsafe*
direction at any point, and the final state has 3 residual completeness
losses, none of them privacy-relevant.

## Task 2 — what actually happened

Scoped almost exactly as planned. One refinement made during implementation:
the plan's two caps (decompressed-in-memory, staged-to-disk) were both going
to be 512MB, which on reflection makes the staged-bytes cap unreachable as an
independent failure mode (the in-memory cap always fires first, since staged
bytes are a subset of decompressed bytes). Tightened `MAX_STAGED_BYTES` to
256MB so the two caps protect different resources at different thresholds on
purpose, and both are independently testable (new tests: a gzip bomb that
exceeds the memory cap, a small-tar-huge-audio-entry that fits in memory but
exceeds the disk cap, and a real-pack-sized archive that clears both).

`packRegistry.ts` hit this repo's 400-line lint ceiling from the added code;
split the archive-handling half (`readTar`, `stageEntries`, `safeJoin`, the
new `gunzipTar`) into `src/main/packArchive.ts` rather than widen the
threshold, matching this repo's own stated convention ("the repo's answer to
a ceiling is a split", per `windows.ts`'s header).

## Task 3 — what actually happened

The plan's own risk callout ("`isolatedEntries` is `@experimental`... needs
its own verification pass") turned out to be exactly right, in a way that
mattered:

- **The mechanism itself works.** Verified: after `isolatedEntries: true` +
  `externalizeDeps: false`, all four `out/preload/*.js` are self-contained —
  zero references to a shared `chunks/` directory, confirmed by `grep -c
  chunks` returning 0 for all four files.
- **electron-vite 5.0.0's `isolatedEntries` progress reporter has an
  unrelated bug**: it calls `process.stdout.clearLine`/`cursorTo`/
  `moveCursor` unconditionally, with no guard for a non-TTY stdout. Those
  methods only exist on a real terminal stream, so any non-interactive
  invocation (CI, a piped `npm run build`, this project's own e2e build
  step) crashed before writing a single file — and no config option
  (`logLevel` included) suppresses the crashing call. Worked around with
  `scripts/electron-vite.mjs`, a thin passthrough that polyfills the three
  missing methods before handing off to electron-vite's real CLI (resolved
  via its `package.json`'s `bin` field, same technique
  `tests/e2e/build.mts` already used). `package.json`'s `dev`/`build`/
  `preview`/`start` scripts and `tests/e2e/build.mts`'s spawn now go through
  this wrapper instead of the raw `electron-vite` CLI.
- **The e2e sweep initially "failed" 63/63 in under 14 seconds** — every
  spec hit `Error: Process failed to launch!` from Playwright's Electron
  launcher. Root-caused (not assumed) by launching the built app directly:
  this session's shell has `ELECTRON_RUN_AS_NODE=1` set ambiently, which
  makes `electron.exe` run as plain Node instead of a real Electron process
  — unrelated to sandboxing, and it would have broken e2e on `main`
  unmodified too. Confirmed by re-running with it unset: `leveling.e2e.mts`
  (a heavy UI spec — chart interaction, screenshots, narrow/wide layout
  checks) passed clean end to end, 208.7s, "no renderer console errors."
  `cursor-ring-zoom.e2e.mts` — the one spec that loads a real built preload
  — was flipped to `sandbox: true` on its own probe window as part of this
  task, and passed (23.1s).
- **With `ELECTRON_RUN_AS_NODE` unset, the full 63-spec sweep landed 55/63
  green, then 8 failures needed triage rather than a shrug** (per AGENTS.md:
  "green on re-run is a report line, never a resolution" — this section is
  that report):
  - **3 confirmed load-induced flakes**, cleared by a serial (no-concurrency)
    re-run: `alert-loot-regex.e2e.mts`, `engine-boots.e2e.mts` (already in
    the AGENTS.md flake ledger), `sky-filters.e2e.mts` (also already
    ledgered).
  - **3 confirmed pre-existing on unmodified `main`**, proven — not assumed —
    by stashing this branch's changes and re-running the identical specs
    against the Phase-2 tip: `con-card.e2e.mts` (a few px off at 100/150/200%
    text scale — `531/797/1060` vs `534/801/1068`) and `maps.e2e.mts` (a
    devicePixelRatio backing-store size off by one row — `1104×854` vs the
    computed `1104×855`) reproduced with byte-identical numbers on `main`.
    `window-bounds.e2e.mts` also reproduced on `main` (7 of the same
    failures, matching values) — a machine/display-configuration
    sensitivity in this environment, broader than the ledger's "under sweep
    load only" note for the same spec, but confirmed unrelated to
    sandboxing either way.
  - **2 real regressions — but in the test, not the product.**
    `sky-achievements.e2e.mts` and `sky-reward-inference.e2e.mts` failed
    100% deterministically under sandbox (not flaky — reproduced on every
    attempt) at the exact same step: `openSky()`'s counts-line check reads
    `[data-testid="posky-counts"]` ONCE, immediately after the search box
    appears, with no retry — unlike every other counts-line read in the same
    two files, which already use the shared `settle()` helper. A standalone
    diagnostic script (launch the same fixture pair, wait a few extra
    seconds, read the DOM) showed the real counts text renders correctly and
    with no console/page errors — it just isn't there in the same tick the
    search box is, and sandboxing's marginal first-paint latency was enough
    to flip this specific launch (the one that stages an extra achievements
    dump) from "wins the race" to "loses it." Fixed both `openSky()`s to use
    `settle()`, matching the pattern already used two lines away in the same
    files. Re-verified green (23.4s / 18.0s) after the fix.

  A second full sweep after that fix landed 57/63 (con-card/maps/window-bounds
  pre-existing as above, sky-filters/engine-boots flakes as above, plus one
  new name: `engine-loot-view.e2e.mts` failed once — "flipping back restores
  the app-fed ledger exactly as it was — app 28 · back 29", an off-by-one in
  a LIVE-folding counter comparison. It passed cleanly on the pre-sandbox
  tip in one standalone run, so it is not a `con-card`-style byte-identical
  reproduction, but it only failed once under sandbox too and the shape (a
  live counter racing a toggle) reads as ordinary timing sensitivity rather
  than something sandbox-specific. **Logged as a single sighting, not chased
  further** — per this repo's own flake-tracking convention (AGENTS.md:
  "green on re-run is a report line, never a resolution... a flake at 3+
  occurrences must have a fix ticket"), one sighting is a report line. Watch
  for a second.

## Task 4 — what actually happened

Exactly as scoped: one paragraph in SECURITY.md, no code, cross-referencing
`infra/variables.tf` / `infra/README.md` rather than restating the throttle
numbers so the two docs can't drift.

## Deliberately NOT done

- No merge. PR to be opened for review, per AGENTS.md's branch-integration
  rule that the owner (or an integrator) merges, not the person who did the
  work.
- No electron-vite version bump. 6.0.0 exists only as a beta; not something
  to pull into a security-fix branch even if it turns out to fix the TTY bug.

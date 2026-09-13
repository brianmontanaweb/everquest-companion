# Security audit remediation — EQ Legends Companion

Branch: `security/audit-fixes-2026-09-12`. Task list: [2026-09-12-security-audit-fixes-todo.md](2026-09-12-security-audit-fixes-todo.md).

## Context

A security-auditor pass over this repo (2026-09-12) found the app unusually
well-hardened already (contextIsolation on, deny-by-default navigation, strict
CSP, verified S3-upload/update-feed hardening, real IAM separation, correct
zip-slip guards) but surfaced four real, actionable gaps. The owner asked to
fix all four, priority order first. What actually shipped went considerably
deeper than the plan approved before implementation started, because
verifying each fix against real data (fixture logs, the live Rust parser, an
actual `npm run build`) kept surfacing gaps the plan's assumptions hadn't
accounted for. This document is the plan as approved; see the `-todo.md` for
what actually happened at each step, including the pivots.

1. **HIGH** — `src/shared/logScrub.ts`'s privacy scrubber (used only on
   feedback-report log-slice attachments and committed test-fixture
   extraction, never on the live gameplay pipeline) is a pure blocklist: a
   line is kept unless it matches a known-bad pattern. EverQuest's `/emote`
   command broadcasts arbitrary player-typed text with no distinguishing
   shape, so a bystander's own words can currently ride through uncaught.
   **Decision: full allowlist rebuild** — default to DROP for any line not
   positively recognized as one of the app's own structural line types.
2. **MEDIUM** — `src/main/packRegistry.ts`'s sound-pack installer caps the
   *compressed* download (100MB) but not the *decompressed* size. A crafted
   gzip bomb can exhaust memory/disk on the Electron main process.
3. **MEDIUM** — every `BrowserWindow` runs with `sandbox: false`. The code's
   own comment already diagnosed why and named the fix; previously deferred.
   **Decision: implement the fix now**, not just document it.
4. **LOW** — `/v1/feedback` and `/v1/telemetry` have real, deliberate,
   documented API-Gateway throttling but no WAF layer. Not a live
   vulnerability. **Decision: document as an accepted tradeoff** in
   SECURITY.md; no infra deploy.

All four are independent — no shared files, no ordering dependency — executed
and committed in priority order on one branch, matching this repo's own
`deps/npm-audit-2026-09-08` precedent (one branch, commits per fix, full gate
green at the tip, PR opened, **not merged** — merge is the owner's call per
AGENTS.md's branch-integration rules).

---

## Phase 1 (HIGH) — `logScrub.ts`: positive-allowlist backstop

Ported every line shape the live Rust parser (`engine/crates/eqlog/src/parse/*.rs`)
recognizes as structural — combat, casts, loot, zone, death, system messages,
group membership — into a new `src/shared/logLineTemplates.ts`, plus the
~2,000-entry corpus of the app's own scraped per-spell cast/wear-off text
(`src/main/data/spells.json`, via `isKnownSpellMessage`). `logScrub.ts` now
defaults to DROP for anything matching neither `DROP` nor this allowlist.
Continuation lines (no per-line timestamp) are exempt, since a player command
always produces its own freshly-timestamped line.

Deliberately NOT ported: the live parser's own `emote_self`/`emote_pot`
fallback for unrecognized spell-landing flavor text — it's a coarse
verb-based guess indistinguishable from player-typed `/emote` text, so
porting it would reopen a narrowed version of the exact hole this closes.

**Verified**, not assumed: a before/after diff of the pre-fix scrubber over
all 93,412 lines in `tests/fixtures/*.log`. See the todo doc for how large
that diff started and how it was closed.

## Phase 2 (MEDIUM) — `packRegistry.ts`: decompression-bomb cap

`gunzipSync(gz, { maxOutputLength: MAX_DECOMPRESSED_BYTES })` (512MB) bounds
the in-memory inflation; a running-total check in `stageEntries` bounds bytes
actually written to disk at a tighter 256MB. The archive-handling code
(`readTar`, `stageEntries`, `safeJoin`) moved to a new `src/main/packArchive.ts`
to keep `packRegistry.ts` under this repo's 400-line ceiling.
`installPack` gained an optional `tarBufOverride` parameter (same pattern as
the existing `targetRootOverride`) so tests drive the real
gunzip → readTar → stageEntries path with a crafted buffer and no network.

## Phase 3 (MEDIUM) — preload sandboxing

`electron.vite.config.ts`'s preload block gets `isolatedEntries: true` +
`externalizeDeps: false` (a real, typed, `@experimental` electron-vite-5
option built for exactly this — each preload entry rebuilt through its own
isolated Rollup pass, nothing hoisted into a shared chunk a sandboxed
preload's restricted `require` can't resolve). `sandbox: true` flips in
`src/main/windows.ts`'s `WEB_PREFERENCES`.

## Phase 4 (LOW) — SECURITY.md documentation

A short paragraph in SECURITY.md's "what a client sends is never trusted"
section, cross-referencing `infra/`'s already-documented throttle design
rather than duplicating the numbers.

## Verification

```bash
npm run typecheck        # both tsconfigs
npm run lint
npm test                 # full unit suite
npm run build
npm run test:e2e         # full sweep, required for Phase 3
```

## Artifacts

- This file and its `-todo.md` companion, per this repo's own retrospective
  on the npm-audit branch (`tasks/` was found unreliable there — files
  vanished mid-session once, cause never established — so the durable copy
  goes in `docs/plans/`).

# Customizable Side Navigation — TODO

Compact tracker for `tasks/plan.md`. Check a task off only when its own verification steps pass
(typecheck + lint always; unit and/or e2e as the task specifies).

## Phase 1 — model & storage

- [x] **T1 · `navLayout.ts` pure model** — 11/11 tests, review approved (3 minors deferred). `2c344671`
- [x] **T2 · Extract `lib/rawPref.ts`** from `useCombatPrefs.ts` — no regression (28==baseline), review
  approved after 1 fix round (stale header). `da63b505`..`d343a438`
- [x] **T3 · `useNavPrefs.ts`** — `useNavLayout` / `useNavDensity`. Review ✅ no issues. `58a772a6`

## Phase 2 — drawer

- [x] **T4 · `NavDrawer` renders from the layout model** — ROW_META record, NavMainList split,
  law comment rewritten. e2e 57/62 (**0 nav regressions** — 5 failures pre-existing, A/B-confirmed
  on pre-T4 tree; machine at 150% display scaling). `3cc66253` ← CHECKPOINT PASSED
- [x] **T5 · "More" overflow collapse** — `nav-more`, `unmountOnExit`. Review ✅. `7b799180`
- [x] **T6 · Compact density + "Customize…" row** — `navDrawerWidth`, tooltips, `nav-customize`.
  e2e re-run 56/62 (0 nav regressions; the delta specs fail identically on pre-T6 tree). Review ✅. `b6922172`

## Phase 3 — editor & sharing

- [x] **T7 · Preferences → Navigation section** — `NavigationSetting.tsx` + registered after
  `appearanceSection()`. targeted e2e 2/2, review ✅. `3a36ab99`
- [x] **T8 · Settings bundle** — `eq.nav.layout` + `eq.nav.density` (`merge: 'replace'`) +
  round-trip test (TDD red→green). shareProfiles 29/29, review ✅. `286ffa23`

## Phase 4 — verification

- [x] **T9 · E2E + law comment** — `tests/e2e/nav-customization.e2e.mts` (23 checks, 3 clean runs,
  zero sleep); NavDrawer law comment already complete (1-line stale-parenthetical fix elsewhere).
  Review ✅. `673ddf2a`
- [ ] **Final** — whole-branch review + full e2e verification vs. known env-failure baseline.

## Notes / decisions

- Reorder UI = up/down arrows (no drag-and-drop library in the repo).
- Overview / Preferences / Send feedback are pinned — not reorderable, not hideable.
- Gear row moves & hides as one unit; its in-area tab bar (JOS-324) is untouched.
- `AGENTS.md` is NOT edited by this work — the "one row per destination" law is updated in
  `NavDrawer.tsx` only.
- Imported bundle values apply on next mount / relaunch (matches existing `eq.combat.scope`).

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
- [ ] **T5 · "More" overflow collapse** for hidden rows (`nav-more`, `unmountOnExit`).
  Verify: typecheck + lint + dev smoke.
- [ ] **T6 · Compact density + "Customize…" row** — `navDrawerWidth`, tooltips, `nav-customize`
  → `prefs.openSection('navigation')`. Verify: full e2e suite (still parity; compact off by default).

## Phase 3 — editor & sharing

- [ ] **T7 · Preferences → Navigation section** — `NavigationSetting.tsx` (reorder arrows,
  show/hide switches, density radio, reset) + register in `PreferencesView.buildSections` after
  `appearanceSection()`. Verify: typecheck + lint + dev smoke (drawer reacts live). ← CHECKPOINT
- [ ] **T8 · Settings bundle** — two `UI_PREF_SPECS` rows (`eq.nav.layout`, `eq.nav.density`,
  `merge: 'replace'`) + round-trip test in `tests/shareProfiles.test.mts`.
  Verify: `node --import tsx --test tests/shareProfiles.test.mts` + `npm test`.

## Phase 4 — verification

- [ ] **T9 · E2E + law comment** — `tests/e2e/nav-customization.e2e.mts` (hide→overflow→navigate,
  reorder, compact, reset, reload persistence); finalise `NavDrawer` comment.
  **Verify: `npm run typecheck && npm run lint && npm test && npm run test:e2e` all green.** ← FINAL CHECKPOINT

## Notes / decisions

- Reorder UI = up/down arrows (no drag-and-drop library in the repo).
- Overview / Preferences / Send feedback are pinned — not reorderable, not hideable.
- Gear row moves & hides as one unit; its in-area tab bar (JOS-324) is untouched.
- `AGENTS.md` is NOT edited by this work — the "one row per destination" law is updated in
  `NavDrawer.tsx` only.
- Imported bundle values apply on next mount / relaunch (matches existing `eq.combat.scope`).

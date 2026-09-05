# Customizable Side Navigation — TODO

Compact tracker for `tasks/plan.md`. Check a task off only when its own verification steps pass
(typecheck + lint always; unit and/or e2e as the task specifies).

## Phase 1 — model & storage

- [ ] **T1 · `navLayout.ts` pure model** — `CUSTOMIZABLE_VIEWS`, parse/resolve/mutate/serialize,
  `vocab` degradation. Verify: `node --import tsx --test tests/navLayout.test.mts`.
- [ ] **T2 · Extract `lib/rawPref.ts`** from `useCombatPrefs.ts` (behaviour-preserving; re-export).
  Verify: `npm test` (full suite green).
- [ ] **T3 · `useNavPrefs.ts`** — `useNavLayout` / `useNavDensity` over `rawPref` + `navLayout`.
  Verify: typecheck + lint.

## Phase 2 — drawer

- [ ] **T4 · `NavDrawer` renders from the layout model** — `ROWS` array → `ROW_META` record;
  `overview` pinned first + user-ordered visible rows; law comment rewritten. Default output
  byte-identical. **Verify: full e2e suite green with ZERO spec edits.** ← CHECKPOINT
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

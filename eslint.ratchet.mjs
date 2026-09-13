// ============================================================================
// eslint.ratchet.mjs — GENERATED. Do not hand-edit to make a build green.
// ============================================================================
//
// THE RATCHET ONLY SHRINKS.
//
// Every entry below is a rule that a file violates TODAY, turned off for that
// file alone so `npm run lint` passes with zero source changes. It is a debt
// register, not a permission slip.
//
//   * A refactor wave DELETES the entries it fixed and re-runs `npm run lint`.
//     If the file is clean the deletion sticks; if it is not, lint says so.
//   * ADDING an entry — a new file, or a new rule on an existing file — is the
//     INTEGRATOR's call. Never an executor's, and never the way to land code
//     that does not pass.
//   * Regenerating wholesale (`npm run lint:ratchet`) after writing new code
//     silently widens the ratchet and defeats the entire design. Regenerate only
//     to seed it, or to re-baseline after a deliberate rule-set change.
//   * `EQ_LINT_NO_RATCHET=1 npx eslint .` shows the true, un-suppressed state.
//   * The worklist for the refactor waves is lint-worklist.md, generated beside
//     this file from the same run.
//
// Baseline: 100 files, 105 file×rule entries, 105 suppressed violations.
// Generated 2026-09-13 by scripts/lint-report.mts.
// The trailing `// N` on each line is that file's violation count for that rule
// at generation time — a size hint for whoever picks the file up, nothing more.
// ============================================================================

// Batch added 2026-09-13 after the Prettier mass-reformat (see
// docs/plans/2026-09-13-prettier-setup.md). No FACTORING_RULES threshold changed — Prettier's
// reflow (line wraps and collapses) moved measured line counts across the SAME existing
// thresholds, growing max-lines/max-lines-per-function violations across 99 files. Regenerated
// wholesale as a deliberate, one-time re-baseline for that tree-wide reflow event, not as
// routine "make lint green" widening and not new code debt. The existing src/main/windows.ts
// entry below predates this batch, carries its own JOS-427 note, and is unrelated to it.
// Owner-approved (see the Prettier-setup plan's ledger).

/** @type {import('eslint').Linter.Config[]} */
export const ratchet = [
  {
    files: ['scripts/dev-feedback-server.mts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['scripts/scrape-page-era.ts'],
    rules: {
      'max-lines': 'off', // 1
      'max-lines-per-function': 'off', // 1
    },
  },
  {
    files: ['scripts/triage-feedback.mts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['src/main/data/spellCorrectionsList.ts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['src/main/data/spellCorrectionsSubjectsList.ts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['src/main/data/spellDb.ts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['src/main/dataServer/supervisor.ts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['src/main/maps/packs.ts'],
    rules: {
      'max-lines-per-function': 'off', // 1
    },
  },
  {
    files: ['src/main/store.ts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['src/main/triage/analytics.ts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  // JOS-427 (2026-08-19, integrator): windows.ts crossed the 400 code-line ceiling by ~7 taking
  // the overlay PARK (opacity instead of hide — the refocus-flicker fix). The park belongs beside
  // the windows it moves; the debt is the next refactor wave's (candidate: the display-reconcile
  // trio or the opaque-strip block, either of which clears it).
  {
    files: ['src/main/windows.ts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['src/preload/index.ts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['src/renderer/src/components/OutputFileLine.tsx'],
    rules: {
      'max-lines-per-function': 'off', // 1
    },
  },
  {
    files: ['src/renderer/src/components/TitleBar.tsx'],
    rules: {
      'max-lines-per-function': 'off', // 1
    },
  },
  {
    files: ['src/renderer/src/features/bosses/BossSections.tsx'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['src/renderer/src/features/bosses/BossView.tsx'],
    rules: {
      'max-lines-per-function': 'off', // 1
    },
  },
  {
    files: ['src/renderer/src/features/combat/CombatTimeline.tsx'],
    rules: {
      'max-lines-per-function': 'off', // 1
    },
  },
  {
    files: ['src/renderer/src/features/combat/combatShared.tsx'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['src/renderer/src/features/combat/dashboardData.ts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['src/renderer/src/features/combat/useTimelineViewport.ts'],
    rules: {
      'max-lines-per-function': 'off', // 1
    },
  },
  {
    files: ['src/renderer/src/features/gear/GearView.tsx'],
    rules: {
      'max-lines-per-function': 'off', // 1
    },
  },
  {
    files: ['src/renderer/src/features/leveling/LevelingView.tsx'],
    rules: {
      'max-lines': 'off', // 1
      'max-lines-per-function': 'off', // 1
    },
  },
  {
    files: ['src/renderer/src/features/leveling/NewAtLevelPanel.tsx'],
    rules: {
      'max-lines-per-function': 'off', // 1
    },
  },
  {
    files: ['src/renderer/src/features/leveling/levelCharts.tsx'],
    rules: {
      'max-lines': 'off', // 1
      'max-lines-per-function': 'off', // 1
    },
  },
  {
    files: ['src/renderer/src/features/loot/LootView.tsx'],
    rules: {
      'max-lines-per-function': 'off', // 1
    },
  },
  {
    files: ['src/renderer/src/features/planner/EffectFilterBar.tsx'],
    rules: {
      'max-lines-per-function': 'off', // 1
    },
  },
  {
    files: ['src/renderer/src/features/planner/EffectRows.tsx'],
    rules: {
      'max-lines-per-function': 'off', // 1
    },
  },
  {
    files: ['src/renderer/src/features/posky/useQuestList.ts'],
    rules: {
      'max-lines-per-function': 'off', // 1
    },
  },
  {
    files: ['src/renderer/src/features/preferences/PreferencesView.tsx'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['src/renderer/src/features/profiles/ShareImportDialog.tsx'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['src/renderer/src/features/resists/ResistProfile.tsx'],
    rules: {
      'max-lines-per-function': 'off', // 1
    },
  },
  {
    files: ['src/renderer/src/features/timers/RespawnRowBar.tsx'],
    rules: {
      'max-lines-per-function': 'off', // 1
    },
  },
  {
    files: ['src/renderer/src/features/triage/AnalyticsBits.tsx'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['src/renderer/src/features/wishlist/WishlistView.tsx'],
    rules: {
      'max-lines-per-function': 'off', // 1
    },
  },
  {
    files: ['src/renderer/src/lib/ItemWindow.tsx'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['src/renderer/src/overlay/BuffsOverlay.tsx'],
    rules: {
      'max-lines': 'off', // 1
      'max-lines-per-function': 'off', // 1
    },
  },
  {
    files: ['src/renderer/src/overlay/XpOverlay.tsx'],
    rules: {
      'max-lines': 'off', // 1
      'max-lines-per-function': 'off', // 1
    },
  },
  {
    files: ['src/shared/spellMetrics.ts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['src/shared/telemetry.ts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['src/shared/telemetryDocEvents.ts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['src/shared/telemetryRollup.ts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['src/shared/types.ts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['tests/analyticsExport.test.mts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['tests/bestSpells.test.mts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['tests/combatCopyText.test.mts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['tests/conCard.test.mts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['tests/dataServerEngineProtocol.test.mts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['tests/devFeedbackServer.test.mts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['tests/e2e/appHarness.mts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['tests/e2e/bestSpellsSteps.mts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['tests/e2e/bosses-week.e2e.mts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['tests/e2e/buffs-overlay.e2e.mts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['tests/e2e/character-switch-storm.e2e.mts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['tests/e2e/combat-dashboard.e2e.mts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['tests/e2e/combatSteps.mts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['tests/e2e/con-card.e2e.mts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['tests/e2e/curveSteps.mts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['tests/e2e/feedback.e2e.mts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['tests/e2e/gear.e2e.mts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['tests/e2e/leveling.e2e.mts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['tests/e2e/levelingLayoutSteps.mts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['tests/e2e/maps.e2e.mts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['tests/e2e/overlay-sync.e2e.mts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['tests/e2e/overlaysAppearanceSteps.mts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['tests/e2e/overview.e2e.mts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['tests/e2e/planner.e2e.mts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['tests/e2e/respawn-timers.e2e.mts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['tests/e2e/sky-cleanup.e2e.mts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['tests/e2e/sky-filters.e2e.mts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['tests/e2e/sky-inventory-autoload.e2e.mts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['tests/e2e/sky-turnin.e2e.mts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['tests/e2e/sliceSteps.mts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['tests/e2e/spell-card.e2e.mts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['tests/e2e/telemetry.e2e.mts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['tests/e2e/voice-alerts.e2e.mts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['tests/e2e/xp-overlay.e2e.mts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['tests/errorReportContract.test.mts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['tests/feedbackContract.test.mts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['tests/gearFilter.test.mts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['tests/levelUnlocks.test.mts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['tests/levelingWindowScope.test.mts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['tests/overviewLeveling.test.mts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['tests/questTurnIns.test.mts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['tests/rangeStats.test.mts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['tests/rangeStatsRows.test.mts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['tests/rateBasis.test.mts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['tests/resistModel.test.mts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['tests/sessionSegments.test.mts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['tests/shareProfiles.test.mts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['tests/skyItemOverrides.test.mts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['tests/skyTargets.test.mts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['tests/spellEffectClass.test.mts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['tests/spellMetrics.test.mts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['tests/spellSearch.test.mts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['tests/storeMigrations.test.mts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['tests/telemetryRollup.test.mts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['tests/timeslice.test.mts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['tests/updateCadence.test.mts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['tests/usageAnalytics.test.mts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
  {
    files: ['tests/wireSanitize.test.mts'],
    rules: {
      'max-lines': 'off', // 1
    },
  },
]

export default ratchet

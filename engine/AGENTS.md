# engine/AGENTS.md — the Rust engine's fold and transport law

Moved from the root AGENTS.md (JOS-XXXX, 2026-09-13, phase-1 colocation
split). This file holds the domain semantics for `engine/crates/fold` and
`engine/crates/eqlog`: what the fold's transport contract guarantees, module
revision/epoch rules, character-epoch and logout-pause handling, the
log-clock law, the engine-comment law, and the world-model laws — the "why"
behind the code, not its porting status. See also `engine/crates/fold/README.md`
(module wiring, what's ported) and `engine/crates/engined/README.md`
(process/protocol). The root `AGENTS.md` carries the operating model,
workflow rules, and everything outside this crate group; read both when your
work touches the engine.

**THE LOG CLOCK IS THE HOST'S TO NAME, AND A SILENT UTC IS A DEFECT (JOS-536).** A log stamp is
a zone-less local wall clock; the engine's own probe (`iana-time-zone`, a WinRT call) fails under
Wine and on some real installs, and a UTC fallback moves every event by whole hours so fights close
on every beat. `session.attach` carries the host's `clock` (IANA name + UTC offset, read fresh per
attach), `eqlog::resolve_zone` ranks host name → platform probe → fixed offset → UTC, an offset
vetoes a name that disagrees with it, and `perf.snapshot.clockSkewMs` measures the live tail's
newest line against the wall clock — a whole number of hours there is a wrong zone, never lag.
In a bug report's perf block, `behindMs` of exactly N hours is this bug; `clock utc` names it.

**ENGINE COMMENTS STATE THE RULE, NOT THE STORY (owner, 2026-08-27, JOS-524).** A comment
names a design rule or a constraint the code cannot show: 1-3 lines, one-line why. Module
headers, single-digit lines. Out: build history, `JOS-nnn` breadcrumbs, alternatives essays,
restatements of the next line, pointers to another file's header. **Git carries provenance;
comments carry the rule.** An unverifiable fact (observed behaviour, measured threshold) is
kept, in one line.

The world-model laws below are still the law — they describe what the fold MEANS, and every one of
them was ported to Rust and proven deep-equal on six slices of the real log before the TypeScript
copy was deleted. Where one names a TypeScript file that is gone, read it for the RULE.

- **A WINDOW READING A FOLD NEEDS BOTH HALVES OF THE TRANSPORT — THE INCREMENTS
  AND THE REBUILD** (JOS-172, and the engine's diff protocol is built on it).
  An increment is an increment: a historical fold emits none, so "hydrate once,
  then ride deltas" is only complete if something says *ask again*. In the
  engine that answer is the EPOCH — a character switch or a respawn bumps it,
  every client drops its window state and takes the fresh reset, and resume is
  always re-query. `sendWorldChanged` (serveDeltas.ts) is the app-side beat.
  The fix is the DELIVERY, never the discard. **And re-hydration is a SECOND
  reason a row can vanish**: anything watching a row set for removals is
  told which kind of change it sees (`timerDrops` takes a `rebuilt` flag and
  says nothing across a re-fold). Full story + the e2e slow-fold trick:
  docs/agents-archive.md.
- **A MODULE WITH A SECOND INPUT MUST REPORT ITS OWN REVISION AS `seq`, NOT
  THE LAST EVENT'S** (JOS-87). Any reader deduping on `seq` — the app's
  mirrors and the engine's own cursors both do — only works when "last
  LogEvent seq folded in" is the whole story, i.e. when state moves ONLY on
  events; the
  combo module's user correction advanced no seq, so an idle-log correction
  was dropped as a duplicate — forever, on an idle log. Fix: a private
  counter bumped by anything that can change state, reported by the module's
  own snapshot, plus the PUSH half — an out-of-band write has to make the
  world publish, or the correction sits in a module nobody re-reads. Four
  modules carry such a counter (combo, character, respawn, buffTimers).
  A unit test cannot see either half; `tests/e2e/loadout-override.e2e.mts` is
  what caught it. Full story: docs/agents-archive.md.
- **Character epochs**: character-scoped state (leveling/AA, loot, kills,
  turnins, buffs live-state) resets at the epoch boundary — anchored at
  OFFICIAL LAUNCH 2026-07-28 (`epochDetector.ts`; the user's beta character
  shared this log file pre-launch). Do NOT use level regression (loadout
  swaps legitimately change level). Game-knowledge (mined durations,
  message overlay) persists across epochs.
- **A LOGOUT PAUSES YOUR CHARACTER, NOT THE WORLD — SO BUFFS FREEZE AND
  DEBUFFS DO NOT** (JOS-134, owner's design 2026-08-09). EQ resumes a
  beneficial buff's REMAINING duration at login
  (`BuffInstances.onOfflinePause`; the S5 fixture proves it to the second); a
  debuff you left on a mob is a timer in the WORLD and is never shifted
  (`modules/buffTimers.ts` takes an EXPLICIT no-op on `offlineGap`). **The
  boundary is evidence, not a timeout — AND SINCE JOS-262 THERE IS NO TIMEOUT
  LEFT ANYWHERE IN IT.** ONE shared predicate decides both halves:
  `sessionDetector.ts inWorldEvidence` — a line that could ONLY have been
  printed for THIS character. It anchors `fromTs`, and
  `modules/buffsSession.ts` rules a hole unexplained only when such a line
  arrives with no intervening login. **"Typed" is NOT the test and the log
  says so**: a stranger's kill in the reconnect preamble proves the CLIENT
  is connected and nothing about you. The priced cost: `fromTs` stays a
  LOWER bound, so a gap never under-states an absence and runs long. **And
  the learner refuses BOTH halves of a cycle that spans an absence**
  (`spannedGap`) — both err LONG, the direction law 5's recency-weighted MAX
  is most sensitive to. Censor, never correct. Zoning is not a logout; death
  still clears (JOS-88). Full story + the measurements:
  docs/agents-archive.md.

## World-model laws (hard-won; do not relearn these)

1. **Messages over inference.** Applications, targets, expiry come from
   explicit chat lines (cast-on-you/other, wears-off, "Your illusion
   fades.", "slows down.", resists). Estimates are display-only countdowns.
   Anything inferred is LABELED inferred — never silently guess.
2. **Names are dirty; canonicalize at boundaries, display raw.**
   Case-insensitive keys (`idKey`) everywhere (lifecycle lines lowercase
   articles; damage lines capitalize). Strip spell rank suffixes (casts say
   `Swift Like the Wind I`, fades are rank-less) and item ` +N` variants at
   COUNTING boundaries only. Strip leading a/an/the for boss matching.
   OUR OWN labels are dirty too: `WorldModel.label()` appends a
   spawn-generation ` (N)` suffix ("the 14th capturer this session") that
   rides `currentTarget` into lookups — `mobKey` strips it; it is display
   flavor, never identity. The suffix appears in NO log line.
3. **Shared messages are the norm.** 123 wears-off families ("Your speed
   returns to normal." = 9 hastes), generic illusion landings ("You feel
   different."). Parser carries candidate lists; the MODEL resolves against
   the active set / session cast history.
4. **Entities, not names; disposition, not identity.** Buffs are
   (spell, entity) instances; "pet" is NOT a data-model class (self renders
   first, others second — presentation only). Charm break keeps the entity
   + buffs (re-charm same name w/o death/zone = same entity). Single-pet
   invariant: new claim/charm retires the prior pet — enforced in TWO models
   with different reach, measured, not an oversight (JOS-54):
   `modules/buffs.ts` retires across BOTH kinds at the buff-entity level; the
   combat `WorldModel` retires only BY KIND (`claim()` retires the prior
   SUMMONED pet — the successor's claim is the only evidence a recast prints;
   `charm()` retires nothing there; the crossover is an unobserved shape and
   gets no invented rule — awaiting-sample law). Retirement is not deletion:
   the old pet keeps every point already attributed (rows key by instanceId)
   and only stops being yours for FUTURE admission, so the engine's
   `petNames` index follows the world model out
   (`EngineState.syncPetNames`). **AND THE CLAIM IS WHAT TRIGGERS IT, NOT THE
   SUMMON** (JOS-188): an upgraded pet is a new NAME; three lines produce the
   claim (tell / leader say / your own pet-only buff landing), all through
   one `bindPetClaim`, on purpose. Zoning: self + summoned pet keep buffs;
   charmed pets/hostiles are left behind (censor). Deaths retire.
   **Unobservable fades censor, never pollute stats.** Own-cast gating: never
   track buffs we didn't cast (10s cast window or a Quick Buff burst).
   **A HEALER OF YOURS IS NOT NECESSARILY A PLAYER (JOS-48).** Your own
   lifetap's recourse prints as `<mob> healed you …`, and filing that mob as
   a KNOWN PLAYER deleted every pet swing at it. The refusal is
   `EngineState.everStruck` — **a name YOU have landed damage on is a mob**,
   the third absolute guard beside `everPet` and `everCharmed`, and it is
   BEHAVIOURAL (the mobs catalog is never consulted, so it holds for a
   proper-named guard the catalog never heard of). The wider rule ("anything
   ever ENGAGED as a hostile") is MEASURED WRONG — a mind-controlled healer
   hits YOU first; being hit is something that HAPPENS to you, hitting is
   something you DO, and only the second names a mob. One direction only: the
   refusal never RETIRES a filing the heal got in ahead of. Measurements:
   docs/agents-archive.md.
5. **Aggregates lie; derive from identities.** AA earned = net allocation
   (latest purchase per ability+rank, cost-0 auto-grants excluded) +
   unspent (last authoritative "You now have" − later spends); sum-of-gains
   double-counts respec refunds. Durations: DB authoritative, else
   recency-weighted MAX (median biases low via censored samples).
6. **Say what the log cannot say** (documented non-distinguishables — never
   invent): main/off-hand; double/triple attack (SILENT extra swings —
   zero annotations in 1.35M lines; the rounds model (combat/rounds.ts,
   wave X 118f0c2) infers by (source, verb, TARGET, second) with
   cross-target fan-out collapse, per-event ONLY on reuse-timer verbs,
   aggregate-rate-with-inferred-chip on dual-wieldable weapon verbs, and
   the player's own Rampage swings are unannotated = outgoing rampage
   unknowable); ground pickups (NO line exists — the loot family is the
   only item-acquisition line); self-buff fades (only wears-off emotes);
   mob HP. Fight NAMING (Task #54): a LIVE fight is named after the CURRENT
   target (most recent outgoing target — the mob in front of you); on FINALIZE
   it switches to the LARGEST target ("most damage absorbed", a labeled proxy).
   Both keep the '+N' others suffix. `encounterName(e, live)`.
7. **Encounters close on evidence**: all engaged instances dead (+~5s
   linger); live CC (mez lines) holds fights open indefinitely; ~60s idle
   fallback for fled mobs. DPS = damage/(lastHit−firstHit); active-time
   DPS is the secondary stat. A zone change FINALIZES the live zone aggregate
   into a capped HISTORY (Task #54; last 20 sessions — frozen agg + timing +
   memoized summary, NO per-event rings, ~0.6MB full-log) instead of discarding
   it, so a past zone's overall meter stays selectable; the snapshot exposes
   `zoneSessions` (live first, id 'zone'; finalized 'zs<n>') and buildSelected
   accepts a session id. Selector rows (main + overlay) carry disambiguation
   timing: start clock (formatDate) · coarse live-updating age · duration.
8. **Miss/resist are first-class, damage-free** (Task #51 v2): a miss
   (avoided melee swing) and a resist (fully-resisted spell) attach to the
   fresh encounter + zone aggregate with the SAME attribution as damage
   (you/pet/incoming; hostile-mob-vs-mob resists dropped) but carry NO
   amount — so every damage total stays byte-identical (the tripwire, per
   source: `Σ category.total == source.total`). They enter the timeline
   ring as hollow/red ticks (miss -> "Melee" lane; resist -> the spell's own
   lane, so an always-resisted mez shows a 0-hit / N-resist lane). Rates:
   melee hit% = hits/(hits+misses) [hits counts ALL landed incl. spells —
   the per-category melee row isolates pure melee]; resist% =
   resists/(spell+dot casts + resists), surfaced at source / category /
   per-spell rows. A miss/resist NEVER opens or extends an encounter (only
   damage/CC does), so instants before the first hit go to the zone
   aggregate only. Ring cap 5k→8k (misses ~2× the density; sole marathon
   fight peaks 5259 instants — fits with zero drop-oldest; ≤60 rings
   retained, <1MB). Timeline zoom/pan is renderer-side view-window state
   (wheel = cursor-anchored zoom, shift-wheel/drag = pan, Fit = reset,
   starts fit); windowed by visible time range so the SVG stays cheap.
9. **One time base per chart.** A curve's vertices, markers, axis and hover
   inverse all read ONE `{t0, t1, bucketMs}`; samples anchor at bucket
   centres; live windows advance in whole buckets. Mixing an index-fraction
   vertex mapping with a time-fraction marker mapping stretched markers a
   full bucket at the right edge, and a wall-clock window length made them
   swim against a still curve every tick (fixed 5a9dbc2). Canvas is never
   the answer to arithmetic disagreement. Chart interaction seam: hover
   binds pointermove/pointerleave ONLY and bails when `ev.buttons !== 0`;
   drag interactions own pointerdown/up/cancel; a `suppressed` prop ties
   them without shared state.
10. **Revisable intervals JOIN AT READ; nothing stamps their ids.** Combo
   intervals (fuzzy, retroactively re-labeled by a later /who or a user
   correction) are queried by timestamp (`comboAt`/`groupByCombo`); an id
   stamped onto a boss kill goes stale with no reconciliation path.
   Persisted corrections key on TIME; interval ids are recompute-unstable
   and never leave the renderer.
11. **Exclusivity gates are RATE-AWARE.** "Never fired without X" requires
   the inactive exposure to PREDICT evidence (>= 3 expected firings at the
   lane's own active rate), never a flat swing floor — 289 swings deny
   Instrument of Nife what 225 earn Spellblade, and that asymmetry is the
   point. Direct observation beats the model (a lane that DID fire inactive
   is never "under-sampled"). States active for the same firings declare
   co-exclusivity — two rows never silently claim one body of evidence.
12. **Cross-source name RENAMES are knowledge, never fuzzy.** The log, the
   mob catalog and the map stems disagree by NAME (The Ruins of Old
   Paineel = The Hole), not spelling. `shared/zones.ts` is the ONE
   hand-authored, evidence-verified artifact (short names, aliases,
   `catalogZonesFor`); closest-match would conflate genuinely distinct
   zones, and an anti-fuzzy tripwire pins two near-name rosters disjoint.
   A new gap gets a VERIFIED row, never a matcher.
13. **A DEATH→DEATH GAP IS AN UPPER BOUND, NOT A MEASUREMENT** (JOS-194,
   `shared/respawn.ts`). Respawn clocks start on the death MESSAGE, numbered
   from your own kills; the wiki is a bad primary source (394 readable
   respawns across 7,872 pages), so the ladder is: your typed number, then
   your kills, then the wiki as a DEFAULT before you have kills and a FLOOR
   under them once you do. Every observed gap is `respawn + your delay`, so
   the SMALLEST gap converges downward; it prints as `≤` with the sample
   count, and a clock at zero says **due**, never "spawned" (laws 1, 6). Two
   evidence rules keep the bound honest: a gap counts only when both deaths
   fall inside ONE stated stay in the zone (a zone line ends the stay even
   when it names the same zone), and two deaths of one name inside 60 s are
   two mobs in one pull (the shortest catalog respawn is 78 s). The committed
   floor keeps each page's VERBATIM text beside the parsed seconds
   (`--reparse` re-derives with NO network).
   **TRACKING IS OPT-IN PER MOB, AND THE DISPLAY IS ZONE-SCOPED** (owner):
   EQ names are massively DUPLICATED, so a clock nobody asked for is a clock
   about a mob the app cannot identify. Recently-killed is the discovery
   surface; a clock exists only on Watch or a typed number; surfaces show
   only the zone you are in, filtered by the module's OWN zone-stay state
   (the empty zone is its own BUCKET; `due` never widens the filter). The
   zone is part of what the screen shows, so the module bumps `rev` on a
   zone line (JOS-87's rule, re-learned) — watch list, zone line, sighting
   and confirmation all bump it.
   **AND A CLOCK MUST YIELD TO THE LOG NAMING THE MOB** (owner): a row
   carries `seenTs` — the last instant a TYPED event named that mob while
   the fold stood in that zone — and a newer `seenTs` reads **UP**, sorting
   above every countdown; the UP state ages out (`RESPAWN_LINGER_MS`), never
   the row. Coverage is off EVENTS, never a raw-text scan; a corpse is
   deliberately NOT a sighting, or every kill would flip its own row up.
   **AND A SIGHTING NEVER AUTO-ADJUSTS THE SCHEDULE** — it proves the mob is
   UP, not when it spawned; re-basing is the explicit `Start clock here`
   affordance (`respawn:confirmSighting`, `basis:'sighting'`, base
   `max(death, confirmation)`), session state, never persisted.
   **AND UNWATCH LIVES ON THE MOB, WHEREVER YOU MEET IT** (owner): every
   surface naming a watched mob carries its own way out, all landing on ONE
   channel, `respawn:unwatch`, which takes the canonical mob KEY, removes
   the NAME, and throws away nothing else — watching again restores the
   identical clock (pinned on the WRITE: `tests/respawnUnwatch.test.mts`).
   Rounds 7-9, distilled: the tab is Timers; the duration + source label are
   ONE bordered unit (`RespawnEditDialog.tsx`; whitelist grammar
   `parseRespawnDuration`; `respawnOverridden` = the ladder saying
   `source === 'custom'`); the OVERLAY carries no editing; **a watched row
   NEVER vanishes while watched** (round 8 — what ages out is the SEEN
   state; unwatch is the only way a row leaves); the mob hover card is
   IN-APP ONLY. Full rounds history: docs/agents-archive.md.

## The fold checkpoint, and why there isn't one (JOS-208, removed by JOS-230)

For two days the app could restore its world model from a binary checkpoint
(JOS-208); the owner removed it anyway (JOS-230): the cold-read stall it
targeted did not survive its own instrumentation, and it taxed every fold
change with schema/goldens/census ceremony. WHAT SURVIVED, because it is the
app's and not the feature's: `tests/foldDeterminism.test.mts` (**a
historical replay reads no wall clock**), the engine's `st.hydrating` gate
(`tests/combatReplayClock.test.mts`), and
`MessageOverlayMiner.lastObservedTs` (a published snapshot's `updatedAt` is
the LOG's clock). Both product fixes were found by folding the same bytes
twice and diffing — reach for that again. If a startup-cost ticket comes
back: measure first, and read `git log 5038f6f0..1c3e584f`. Full
post-mortem: docs/agents-archive.md.

**A FOLD MUST NEVER BE SEEDED WITH WHAT IT IS ABOUT TO RE-DERIVE, AND THE ONLY
HONEST WAY TO KNOW IS TO FILE EVERY COUNT UNDER ITS SOURCE** (JOS-231). The
message overlay re-mines the whole log every launch; seeding it from its own
persisted served view double-counted every cold launch. `MessageOverlayMiner`
keeps ONE BUCKET PER SOURCE (`BASELINE_SOURCE` for the committed baseline),
`beginSource(key)` DISCARDS a bucket before its log is folded again,
`build()` sums the buckets — a re-fold REPLACES its source's contribution;
idempotence is structural. The persisted file is v2, a REGISTER with no
verdicts (a stored verdict is a second opinion waiting to disagree with the
derived one). The fix deliberately KEEPS the persisted seed (a bucket for a
character you are not folding is knowledge nothing can re-derive, and
`effectiveSpellDb` derives parser corrections from the seed BEFORE the
fold). `tests/messageOverlayIdempotence.test.mts` pins it all, with a
tripwire that re-creates the old shape and watches the counts double. Full
story: docs/agents-archive.md.

# engine/AGENTS.md — the Rust engine's fold and transport law

Moved from the root AGENTS.md (JOS-XXXX, 2026-09-13, phase-1 colocation
split; phase 2 same day added the log-format section below). This file
holds the domain semantics for `engine/crates/fold` and `engine/crates/eqlog`:
what the fold's transport contract guarantees, module revision/epoch rules,
character-epoch and logout-pause handling, the log-clock law, the
engine-comment law, the world-model laws, and how raw log lines become
typed events — the "why" behind the code, not its porting status. See also
`engine/crates/fold/README.md` (module wiring, what's ported) and
`engine/crates/engined/README.md` (process/protocol). The root `AGENTS.md`
carries the operating model, workflow rules, and everything outside this
crate group; read both when your work touches the engine.

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

## Log-format quick reference (all validated against the real log)

The committed fixture tests (`tests/fixtures/*.log` + their suites) are the
AUTHORITY for line shapes; the rows kept here are the non-obvious laws, and
the full per-lane evidence lives in docs/agents-archive.md.

- Melee verbs CONJUGATE — match first person ("You slash") AND third
  ("slashes"); missing `smite`/`cleave` once hid 22% of all damage. Paren
  modifiers are COMPOUND: `(Riposte Slay Undead)`.
- **A VERB THAT NAMES A CLASS SKILL GETS ITS OWN LANE; A WEAPON VERB DOES
  NOT** (JOS-77, JOS-81). `meleeSkill()` (log/parseCombat.ts) splits
  Backstab, Bash, Kick, Frenzy, Flurry, Cleave (WAR) and Smite (PAL);
  slash/pierce/crush/hit/slice/claw/gore are what a weapon in a hand prints
  and share the generic "Melee" row (the Rounds panel splits those BY VERB).
  The table is HAND-AUTHORED against `data/classes.json`'s skill→class map —
  never a matcher over spelling. The proofs differ per lane; know them
  before adding one (full counts + hand tallies: docs/agents-archive.md):
  - Cleave (JOS-77): an ABSENCE — a verb that never prints for a player who
    lacks the skill is gated on the skill.
  - Smite (JOS-81): THE SKILL-UP STREAM — a weapon verb never ticks under
    its own name while `Smite` ticks beside Kick/Bash/Backstab. **THE SKILL
    LANE AND THE SPELL LANE SHARE A STEM AND MUST NEVER MERGE** — a spell
    literally named `Smite` exists; `tests/combatSmiteLane.test.mts` pins
    the collision on real bytes.
  - Ranged (JOS-92): **a weapon verb fired from a different SLOT than the
    hands is not the hand lane** — `shoot` ticks under `Archery`. THE
    DISCRIMINATOR IS THE VERB AND NOTHING ELSE; no thrown lane is invented
    beside it (awaiting-sample law); the self arm is INJECTED in
    `tests/combatRangedLane.test.mts`.
  - Strike (JOS-163): the GENERIC VERB every monk special prints as — an
    unnamed strike earns a row called **`Strike`**, the verb, never a name
    from the chain: the verb earns the ROW, the state line earns the NAME,
    and **no lane is ever seeded from the chain's first entry**
    (specialAttacks.ts's stated law).
  Law 8 held byte-identical across all four changes.
- **A HEAL THE LOG ANNOUNCES BUT NEVER VALUES GETS A LANE THAT CARRIES A COUNT
  AND NO NUMBER** (JOS-86 — the monk's Mend). `You mend your wounds and heal
  some damage.` is the whole sentence: no amount, no target, no third-person
  twin. THE FIX IS A KIND, NOT A FLAG: `healUnstated`, with **no amount
  field at all** (a `heal` with `amount: 0` would be a lie with a long
  tail). It enters NO sum and rides its own `HealSourceView.unstatedCount`
  so the crit and overheal rates beside it keep their VALUED denominator.
  FIRST PERSON ONLY, no invented arms (awaiting-sample law). Law 8 gate:
  every fixture diff was an ADDITION. Full story + the whole-log partition:
  docs/agents-archive.md.
- **SPECIAL ATTACKS PRINT NO VERB OF THEIR OWN.** Dragon Punch, Eagle Strike
  and Tiger Claw ALL land as `You strike …`; Round Kick and Flying Kick as
  `You kick …`. The game names the live one exactly once (`You will now use
  <X> while auto attacking.` — a GRANT, also how a lane RESETS — and
  `… instead of <Y> …`, an in-lane upgrade), so the lane label is STATE, not
  parsing: `combat/specialAttacks.ts` tracks the live special per VERB lane
  and ingest renames the skill. **`Slam instead of Bash` is REFUSED** — a
  documented non-distinguishable (law 6), not a guess. SKILL-UPS ARE NOT AN
  INPUT anywhere here. Full evidence: docs/agents-archive.md.
- Zone: `You have entered X.` — REJECT pseudo-zones ("an area where
  levitation…"). **The zone name is the ONLY thing that ever states a
  difficulty**, so `zoneTier()` decides what every kill's difficulty was,
  and it answers FOUR kinds of thing, not one number in five (JOS-166): a
  trailing `(Awakened|Adaptive|Fused|Refined)` = **d1–d4**; a `- Solo` /
  `- Group N` suffix with no adjective = **d0, the base INSTANCE with a real
  weekly lockout**; a bare zone name = **open world** (`TIER_OPEN_WORLD`, no
  lockout); empty or unknown adjective = **unknown** (`TIER_UNKNOWN`). The
  name is stripped of all three markers; all four are kill-record keys
  (`src/shared/kills.ts`), and only the five difficulties can green a weekly
  ladder rung. Pre-JOS-166 history: docs/agents-archive.md.
- Loot family (sole item-into-inventory lines): dashed
  `--You have looted X from Y's corpse.--`; currency (`…stored it in your
  currency`, NO period); sold (`…sold it for <money|free>.`). Dragon
  Hoard / depot / combine variants exist and are NOT yet parsed.
- AA: gains `…gained N ability point(s)! You now have M` (M = UNSPENT);
  spends in TWO formats (quoted rank-1 / `improved X <rank>`); cost-0 =
  auto-grants; respecs re-log purchases; no refund line exists. The quoted
  form is ALWAYS rank 1 and the improved form NEVER logs below rank 2, so a
  spend line states one rung of a per-ability LADDER — `shared/aaLedger.ts`
  regroups them. Two families that look like AA are NOT parsed, both
  deliberately: the `completed achievement` line restates a milestone the
  gain lines already carry (double-count risk), and `You activate X.` cannot
  distinguish an AA from a disc or a poison — a buffs/combat signal, never an
  AA-usage stat. Sweep: docs/agents-archive.md.
- Class SKILL grants share the AA verb: `You have gained the ability to use
  <Skill>.` (44×, Double Attack / Sneak / Riposte…) has NO cost clause and
  is not an AA purchase. `AA_ABILITY_RE` requires ` at a cost of`, which is
  the whole reason those lines never mint a spend.
- Resists (`resist` event, Task #51 v2): THREE shapes — `<target> resisted
  your <Spell>!` (caster=you), `<target> resisted <caster>'s <Spell>!`
  (caster=name; test YOUR form FIRST — 712 spell names contain `'s`), `You
  resist[ed] <mob>'s <Spell>!` (incoming). Spell keeps rank suffix for
  display, rank-normalized (spellCanonKey) for keys. Misses: `tries to … but
  misses!` family (miss/dodge/parry/riposte/block/absorb). Full-log sweep
  counts: docs/agents-archive.md.
- Stances: two mutually exclusive groups — 9 stances (`You assume a/an X
  stance.` — the article conjugates: "an offensive stance") and 9
  invocations (`You begin reciting the X invocation`);
  "begin to change your …" lines are flavor, not state.
- Quick Buff AA: `You activate Quick Buff.` → burst of landing emotes, NO
  cast lines. Permanent Illusion AA (ownership learned from its purchase
  line): illusion self-buffs permanent; ONE illusion per entity;
  `Your illusion fades.` is the shared remover.
  **THE BURST IS ALSO THE ONLY LINE THAT ENUMERATES YOUR GROUP BY NAME**
  (JOS-85): two or more `You healed <X> … by <Spell>.` lines in the SAME
  second — a fact about the ABILITY, not spell target types. It proves
  RECIPIENTS, not membership (bursts hit your own pets and, twice, a
  non-group-mate), so the roster admits a name only in conjunction with
  `You gain party experience!` earlier in the session (measured 2/2 correct,
  0 false positives). Weakest provenance rung (`buffed`); self / charmed /
  claimed-pet names refused. src/main/modules/buffFanOut.ts,
  docs/plans/group-model.md §1 G4; measurements: docs/agents-archive.md.
- Summoned pets have random proper names; they persist across zones (charmed
  pets do not). THREE binding signals, all through one `bindPetClaim`
  (ingest.ts), on purpose — a separate path would be a third retirement seam
  for some model to forget (law 4 is a scar from exactly that):
  - The owner-only tell `<Name> told you, '… Master.'` — **THE TELL ONLY
    FIRES WHEN THE PET IS ORDERED** (JOS-47); a pet engaging on its own
    aggro emits nothing private at all. **THE TELL IS THE WHOLE STORY, AND
    THE BLIND SPOT IS ACCEPTED** (owner, JOS-49): the ask-the-user offer and
    the pet-say nomination rung are DELETED — the answer is to order it
    once; an unordered pet is a documented non-distinguishable (law 6). **A
    TELL BINDS FORWARD, NOT BACKWARD** — nothing reaches back over damage
    already filed as nobody's.
  - The `/pet who leader` answer `<Name> says, 'My leader is <You>.'`
    (JOS-52) — EXACT sentence, never a `/leader/` pattern (the six-says
    rule). **THE LEADER'S NAME IS THE WHOLE GUARD** (compared to
    `ParserConfig.characterName`, session-injected) because the say is
    BROADCAST and forgeable — stated, costed, accepted. It parses to the
    SAME canonical `petClaim` event as the tell (`via: 'tell' | 'leader'`),
    so succession/idempotence/promotion are shared code.
  - **YOUR OWN PET-ONLY BUFF NAMES IT WITHOUT ASKING** (JOS-188): an own
    cast of a `targetType: Pet` spell (charmModel.ts `PET_TARGET_SPELLS`)
    ARMS the charm model and the named `buffApply` landing binds the pet.
    **THE MESSAGE IS NOT THE GATE, THE ARMED OWN CAST IS** — the landing's
    candidates must contain the spell being cast, and the arm is CONSUMED on
    a hit (a Quick Buff burst can never bind off one cast). This fixes the
    UPGRADED pet: a new name means succession triggers on the successor's
    claim, and an unordered successor had none.
  **AND THE APP NOW SAYS SO, ONCE, AND THEN STOPS** (JOS-258, owner ruling
  2026-08-12 — option (a), explicitly NOT a reopening of JOS-49). The blind
  spot is still accepted; the meter just no longer stays silent about it.
  `combat/petNudge.ts` arms on the player's own pet-summon cast
  (`spellEffectClass.ts`'s derived `summonPet` class; `Call Pet` excluded —
  it moves a pet rather than making one) and the overlay meter draws ONE
  sentence: *Pet summoned - order it once or type /pet who leader so the
  meter can see it.* **STALENESS AND REPETITION ARE THE FAILURE MODES, so
  the whole feature is a timeout**: 10s GRACE, 45s SHOW, 5m QUIET after one
  is ignored. ONE SLOT; cleared by any `bindPetClaim` (all three routes, one
  seam), by a fizzle/interrupt, or by its own clock — swept from the event
  stream AND from `snapshot(now)`. Armed only when `hydrating` is false.
  **IT COACHES, IT NEVER ADOPTS** — the unbound pet's damage is still
  dropped at routing while the sentence is up, and
  `tests/petSummonNudge.test.mts` asserts exactly that beside the timings.
  The renderer holds NO dismiss state (the snapshot's `petNudge` is absent
  in every state but the one). Full story: docs/agents-archive.md.
  A pet-claim tell from a name EVER seen charmed re-arms the charmed set,
  never the permanent one (`everCharmed`).
  **AND THE PET-BUFF RUNG IS NO LONGER THE COMBAT MODEL'S ALONE (JOS-454).**
  `bindPetBuffLanding` emits a derived `petClaim {via:'petBuff'}` on
  `bus.emitDerived` (Task #47's queue, the one `buffExpired` rides), so
  every model that binds a `petClaim` — progression's kill credit, buffs.ts
  entity succession, roster, the resist fold — learns the pet at the instant
  the meter does. ONE PRODUCER, ONE KIND, and the producer IGNORES its own
  kind (`ingestPetClaim`), which makes it provably loop-free. The ARM AND
  THE GATE ARE UNTOUCHED, so which names bind has not moved — only who is
  told. STILL NOT CLOSED: a pet its owner neither buffs nor orders stays
  invisible (order it once). Goldens: `p2`/`p3`/`p4` pet-arc logs,
  petBuffBind/petClaimWindows/petBuffKillCredit tests. The incident that
  bought it (Vibartik) + measurements: docs/agents-archive.md.
- Exp: `You gain (party )?experience!( (N.NN%))?` — the percent is an
  INCREMENT of the current level bar (sums to ~100 between dings);
  unstated ⇒ at the cap, modeled `pct: undefined` never 0. The exp line
  PRECEDES its kill line, same second (4,887/4,909) — joins consume the
  pending exp line at the next credited kill, never search forward.
- Self `/who` row (keyed on the tailed character's name via
  `ParserConfig.characterName`, never a constant) states the loadout;
  skill-ups `You have become better at <Skill>! (n)`; Wiki skill names ≠
  client skill names (`1 Hand Slashing` vs `1H Slashing`) — classes.json
  carries the alias table measured from the log.
  **A `/who` ROW IS GROUND TRUTH AT ITS TIMESTAMP, AND INFERENCE NEVER
  OUTRANKS IT** (JOS-192, JOS-287; the two live-log tripwires in
  comboWindows/comboWhoBoundary are this law): an interval may not
  contradict a row it covers, nor be extended or created BACKWARD over
  evidence that contradicts it. Two rows are two statements, never one
  event — so `mergeBoundaries` may narrow, move or absorb an INFERRED
  boundary but never a `/who` cut (`resolveGroup`), and an inferred window
  that covers a row cut is that swap dated better by the game (absorbed,
  recorded in `startAlso`). Frozen shape: fixture
  `cw7-who-swap-boundary-aug12.log` + tests/comboSwapBoundary.test.mts; the
  JOS-287 worked example: docs/agents-archive.md.
- **`Your <item> shimmers briefly.` / `feels alive with power.` IS A WORN
  FOCUS TALKING, NOT AN ITEM CASTING** (JOS-79, measured whole-log — this
  entry previously said the opposite and it was wrong). All five items that
  print it are focus items; the combo rule that acted on it is gone; the
  event stays and says nothing about class in either direction. A
  self-announcing clicky needs its own observed sample before any rule acts
  on one. Measurements: docs/agents-archive.md.
- Feign death has NO failure line (1.14M lines: only the success emote).
  An alert cannot fire on the absence of a line — the group ships hidden.
- **A TELL'S TENSE SAYS WHETHER A PERSON SENT IT** (JOS-69, measured
  whole-log): present tense (`tells you`) is a player, past tense (`told
  you`) is the game — that is the whole discriminator, and CAPITALIZATION IS
  NOT ONE (a charmed pet reads `A gorgon told you, …`). There is NO parsed
  tell event and no golden can carry one (the scrub drops all quoted
  speech), hence the `tells` alert group is a RAW trigger
  (`\] .+ tells you, '`) and its unit test constructs the sentence.
  Measurements: docs/agents-archive.md.
- **SLOWS ARE A ROSTER, NOT A NAME** (JOS-69). A slow wearing off a mob is
  the ordinary named-target `buffFade`, so the SPELL is the matcher and it
  has to be the whole family — a slow is the spell you replace as you level.
  spells.json enumerates it by landing emote; the ON-YOU side resolves to
  all-slow candidate lists, so the alert reports the family, never which
  one. Its tripwire is one word away: `Your speed returns to normal.` is
  NINE HASTES (law 3).
  **AND THE ROSTER HAS TWO SIDES NOW, BECAUSE ONE MEMBER CANNOT SAFELY BE ON
  BOTH** (JOS-233, owner ruling 2026-08-12): the bard binding pair joined
  the MOB side only — `The strands fade away.` is shared VERBATIM with a
  beneficial buff, and a `where.spell` matcher tests the whole candidate
  list (JOS-84); anchoring cannot fix identical sentences, only the split
  roster can. The wider binding line is EXPLICITLY UNRULED and stays silent;
  the table is in tests/charmCcRoster.test.mts. Full story:
  docs/agents-archive.md.
- **CHARM AND MEZ ARE ROSTERS TOO — AND THE SPELL DB IS THE ORACLE** (JOS-84).
  `Your <spell> spell has worn off of <mob>.` is ONE sentence for three
  facts; `rulesets.ts` matches the spell NAME: `charmSpell` ⇒ `uncharm`,
  `ccSpell` ⇒ `cc {refresh:true}`, neither ⇒ an ordinary `buffFade`. The
  rosters are enumerable from spells.json's landing-message families, and
  `tests/charmCcRoster.test.mts` RE-DERIVES both families every run — a
  future scrape that adds a member fails the suite instead of going mute.
  **A MESSAGE FAMILY IS NOT AN EFFECT FAMILY — THE ORACLE HAS BEEN WRONG IN
  BOTH DIRECTIONS** (Solon's Bewitching Bravura, a mez by family and really
  the bard's level-39 CHARM, JOS-200; both Largo's binding songs out of
  `ccSpell` entirely, JOS-225 — movement debuffs, settled by the log). Both
  reversals live as EVIDENCE-CARRYING TABLES in tests/charmCcRoster.test.mts
  (`FAMILY_EXCEPTIONS`, `NOT_A_HOLD`) precisely so the next scrape cannot
  sweep them back in; adding a row is a claim about what the game DOES,
  backed by log lines — never a way to quiet a noisy alert.
  **AND "NOT A HOLD" IS NOT "NOT AN ALERT"** (JOS-233): the SLOW group's
  mob-side roster claims both Largo's by name, and `NOT_A_HOLD` carries a
  `fires` column so a row states which group it ends up in and cannot drift
  silently between the two. Full story + the log evidence:
  docs/agents-archive.md.
- **THE CALM LINE IS A ROSTER TOO — AND ROUTING OBEYS RULING 8 (JOS-213).**
  Calm spells are Beneficial, so their timer landed in the player's BUFF
  overlay — while the thing they watch is a mob-state timer. The fix is a
  SECOND, orthogonal fact about the SPELL (`ActiveBuff.calmsTarget`,
  `spellCalmsTarget`, re-derived by an oracle every run, exactly like
  `ccSpell`); `cls` does NOT change. **THE CUT THAT FAILED IS THE LESSON**:
  routing on "the TARGET is a mob" reruns the error ruling 8
  (JOS-136/JOS-140) outlawed — nature, and now surface, comes from the
  spell, never from the shape of the target. Fixtures `w64`/`w65`, pinned in
  `tests/calmLineTimers.test.mts`; a pacified mob CAN be killed and takes
  the ordinary decrement-one death censor, never JOS-228's mez refusal.
  Full story: docs/agents-archive.md.
- **THE FRIEND SYSTEM ANNOUNCES NOTHING** (JOS-69): only the `/friends`
  roster print and the `<name> is now your friend.` confirmation exist — no
  login line, no logout line — so "a friend came online" is knowable only by
  polling, and the group ships hidden beside feign-death and pet-death.
  Sweep: docs/agents-archive.md.
- Motes (the Item Upgrade System's currency) arrive ONLY inside ordinary loot
  lines, which already parse to `loot { item, source }`; every one the items
  catalog knows is `Mote of <tier> Potential` (10 tiers, 7 seen: Infinitesimal
  220, Minor 31, Lesser 16, Major 8, Potential 7, Greater 2, Superior 1). Nothing
  anywhere RANKS the tiers, so a per-tier loot filter would be an invented fact.
- `LogEvent.raw` INCLUDES the `[timestamp] ` prefix: a `^`-anchored raw
  alert regex silently never matches — anchor on `\] ` (tripwire test).
- WorldModel labels append a spawn-generation ` (N)` suffix that appears
  in NO log line (law 2) — `mobKey` strips it.

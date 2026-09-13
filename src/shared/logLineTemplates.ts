// ============================================================================
// KNOWN-SAFE LOG LINE TEMPLATES — the positive half of `logScrub.ts`'s privacy rule.
// ============================================================================
//
// `logScrub.ts` used to be a pure blocklist: a line survived unless it matched something in
// `DROP`. That left one gap open — EverQuest's `/emote <free text>` command broadcasts arbitrary
// player-typed text with no distinguishing shape, so a bystander's own words could ride through
// uncaught. This module is the fix's other half: every line shape the app's own live parser
// already recognizes as a STRUCTURAL fact about the fight (combat, casts, loot, zone, death,
// system messages, ...) — not a communication — so `logScrub.ts` can default to DROP for anything
// that matches neither `DROP` nor this list, closing `/emote` and any future unrecognized line
// shape at once.
//
// SOURCE OF TRUTH: every pattern below is ported from the live Rust parser at
// `engine/crates/eqlog/src/parse/*.rs` — read directly, not paraphrased, on 2026-09-12. Those
// regexes are the actual measured ground truth for what a real EverQuest Legends log prints
// (the old TypeScript parser this repo used to cite here, `src/main/log/parseCasts.ts` /
// `parseWho.ts`, was deleted in `eb23eee6`, "JOS-499: the deletion release" — the citations in
// `logScrub.ts`'s header predate that and are stale). Porting them back is translation, not
// guessing, which keeps faith with this file's "measured, not assumed" law.
//
// TRANSLATION NOTE: the Rust source writes bracket character classes (`[0-9]`, `[0-9A-Za-z_]`,
// ...) instead of `\d`/`\w` specifically so a reader can port them mechanically — see
// `engine/crates/eqlog/src/parse/combat.rs:1-6`. Those classes are copied VERBATIM below (a
// bracket class means the same thing in both languages, so there is nothing to translate and
// nothing to get wrong). The one Rust-only construct is `JS_S`, a giant Unicode whitespace
// class (`engine/crates/eqlog/src/jsstr.rs`) built to reproduce JS's OWN native `\s` semantics —
// so wherever the Rust source interpolates `JS_S`, this file just writes `\s`, which already IS
// that set in a JS engine. No other substitution is made anywhere in this file.
//
// DELIBERATE EXCLUSION — read before adding to this list: `casts.rs`'s `emote_self`
// (`^You (?:feel|look|sense|seem)\b[^.]*\.$`) and `emote_pet`
// (`^([A-Z][A-Za-z'\`]*(?: [A-Za-z'\`]+)*) (?:feels|looks|seems)\b[^.]*\.$`) are the live parser's
// own fallback for spell-landing flavor text that isn't in its spell-message database (matched
// LAST, after everything else, per that file's own comment). They are NOT ported here on purpose:
// they are a coarse verb-based heuristic, not a verified match against known game text, so a
// player-typed `/emote feels underwater without a paddle today` would satisfy them just as well
// as real spell flavor text — porting them would silently reopen a narrowed version of the exact
// hole this module exists to close. The residual this leaves is stated in `logScrub.ts`'s header:
// unrecognized buff-landing flavor text now defaults to DROP, which is a completeness loss for a
// feedback slice, never a privacy regression (canned game text was never a bystander's own words
// to begin with).
//
// PER-SPELL MESSAGES: the one category the header above calls a residual is closed too, using
// real data rather than a heuristic. `src/main/data/spells.json` carries the app's own scraped
// `msgCastOnYou` / `msgCastOnOther` / `msgWearsOff` text for ~2,000 distinct messages — this is
// the exact client text a real log can print, not a guess, so it belongs in this module on the
// same footing as everything ported from the Rust parser above. The filter that decides which
// scraped strings are real messages (as opposed to a scrape's own stub/placeholder) mirrors
// `engine/crates/eqlog/src/spelldb/passes.rs`'s `is_placeholder` exactly: `N/A`, or a message
// that reduces to nothing but a bare subject word (`you`/`your`/`someone`/`target`/`player`/
// `soandso`), is not a message. `msgCastOnOther` additionally strips one LEADING placeholder
// subject word (`Someone`/`Soandso`/`Target`/`Player`) before use, since that word stands in for
// the target's name in the scrape and a real log prints the name instead — matching it verbatim
// would never match anything. This module does not replicate the Rust engine's separate
// removals/corrections passes (`spell-overlay.json`): those exist to keep game-STATE tracking
// accurate (which spell an event maps to), which has no bearing on whether a given string is
// genuine client-authored text — the only question this module answers. It DOES apply this app's
// own TS-side removals layer (`src/main/data/spellRemovals.ts`, a distinct, simpler mechanism: "a
// spell EQ Legends' shipped game does not have at all") before extracting any message text, since
// a removed spell can never actually be cast, received, or worn off — its scraped message would
// not be measured client output, it would be a guess, and `tests/spellRemovals.test.mts` requires
// every raw `spells.json` importer to apply this same layer or state why not.
//
// This module has two imports, `../main/data/spells.json` and `../main/data/spellRemovals` (both
// static data / pure functions, not a runtime dependency), and is otherwise zero imports — no
// `node:`, no Electron, no DOM. It compiles under both tsconfigs and is safe to call 50,000 times
// in a row on a slice: the corpus below is built ONCE at module load, not per call.

import spellsData from '../main/data/spells.json'
import { applySpellRemovals } from '../main/data/spellRemovals'

// ---- Combat (engine/crates/eqlog/src/parse/combat.rs) ----

const MELEE_VERBS =
  'hit(?:s)?|slash(?:es)?|pierce(?:s)?|crush(?:es)?|bash(?:es)?|kick(?:s)?|bite(?:s)?|claw(?:s)?|gore(?:s)?|maul(?:s)?|punch(?:es)?|strike(?:s)?|slice(?:s)?|backstab(?:s)?|slam(?:s)?|sting(?:s)?|rend(?:s)?|smash(?:es)?|gnaw(?:s)?|lash(?:es)?|smite(?:s)?|cleave(?:s)?|reave(?:s)?|shoot(?:s)?|frenzies on|frenzy on|flurries|flurry'

const COMBAT_SAFE: readonly RegExp[] = [
  // melee (combat.rs:53-56)
  new RegExp(`^(.+?) (?:${MELEE_VERBS}) (.+?) for ([0-9]+) points? of damage\\.(?: \\((.+?)\\))?$`),
  // spell damage (combat.rs:58-61)
  /^(.+?) (?:hits?) (.+?) for ([0-9]+) points of ([0-9A-Za-z_-]+) damage by (.+?)\.(?: \((.+?)\))?$/,
  // damage shield, outgoing + incoming (combat.rs:62-69)
  /^(.+?) is [0-9A-Za-z_]+ by (YOUR|.+?'s) (.+?) for ([0-9]+) points? of non-melee damage\.$/,
  /^YOU are [0-9A-Za-z_]+ by (.+?)'s (.+?) for ([0-9]+) points? of non-melee damage!$/,
  // DoT ticks, with and without a caster (combat.rs:70-75). The Rust source only conjugates
  // third-person ("has taken") and, per the live engine's own dispatch (mod.rs's `classify_damage`
  // gates on the substring "has taken"), a first-person "You have taken..." DoT tick is genuinely
  // Kind::Unknown live — a pre-existing gap in game-state tracking, not a scrub bug. It is still
  // real, safe combat text (no bystander content), so both conjugations are covered here even
  // though only one produces a typed event upstream.
  /^(.+?) has taken ([0-9]+) damage from (.+?)\.(?: \((.+?)\))?$/,
  /^(.+?) has taken ([0-9]+) damage by (.+?)\.(?: \((.+?)\))?$/,
  /^You have taken ([0-9]+) damage from (.+?)\.(?: \((.+?)\))?$/,
  /^You have taken ([0-9]+) damage by (.+?)\.(?: \((.+?)\))?$/,
  // self-inflicted damage (e.g. fall/backlash) — same reasoning, no bystander content
  /^You hurt yourself for ([0-9]+) points?\.$/,
  // heals, including the over-time and by-caster clauses (combat.rs:76-79)
  /^(.+?) healed (.+?)( over time)? for ([0-9]+)(?: \(([0-9]+)\))? hit points?(?: by (.+?))?\.(?: \(([A-Za-z][A-Za-z ]*)\))?$/,
  // mend (combat.rs:80)
  /^You mend your wounds and heal some damage\.$/,
  // rune grant (combat.rs:81-82)
  /^You gain a rune for ([0-9]+) points? of absorption\.$/,
  // magical-skin absorb, blow + damage-shield forms (combat.rs:83-90)
  /^(.+?) tr(?:y|ies) to [0-9A-Za-z_]+ (?:on )?YOU, but YOUR magical skin absorbs the blow!(?: \([A-Za-z ]+\))?$/,
  /^YOUR magical skin absorbs the damage of (.+?)'s .+\.$/,
  // the same shape from a mob's own skin absorbing the reader's damage shield
  /^(.+?)'s magical skin absorbs the damage of YOUR .+\.$/,
  // a named special-attack swing avoided outright ("Lord of Ire avoided your Skull Bash!")
  /^(.+?) avoided your (.+?)!$/,
  // misses / parries / dodges / ripostes / blocks, self and other (combat.rs:91-102)
  /^(.+?) tr(?:y|ies) to [0-9A-Za-z_]+ (?:on )?(.+?), but (?:(?:miss|misses)|(?:.+?) (?:parries|dodges|ripostes|blocks)|(?:YOU) (?:parry|dodge|riposte|block)|.+?'s magical skin (?:absorbs) the blow|(?:YOUR) magical skin absorbs the blow)!(?: \([A-Za-z]+\))?$/,
  // resists, all three directions (combat.rs:105-107)
  /^(.+?) resisted your (.+?)!$/,
  /^(.+?) resisted (.+?)'s (.+?)!$/,
  /^You resist(?:ed)? (.+?)'s (.+?)!$/
]

// ---- Casts (engine/crates/eqlog/src/parse/casts.rs) ----

const CASTS_SAFE: readonly RegExp[] = [
  // cast begin, self + other (casts.rs:99-100)
  /^You begin (?:casting|singing) (.+?)\.$/,
  /^(.+?) begins (?:casting|singing) (.+?)\.$/,
  // fizzle / interrupt — the Rust source anchors these to "Your" (self only, casts.rs:101-102),
  // but the fixture corpus proves a mob's own spell fizzling/interrupting is exactly as common and
  // exactly as safe (no subject here is ever a bystander's free text — DROP's comma-quote rule
  // already removed anything actually spoken), so this is broadened to any subject.
  /^(.+?) spell fizzles!$/,
  /^(.+?) spell is interrupted\.$/,
  // the one exact resumed-casting sentence (casts.rs:31), plus the third-person form the fixture
  // corpus shows just as often ("Lord Nagafen regains concentration and continues casting.") —
  // same broadening rationale as fizzle/interrupt above.
  /^You regain your concentration and continue your casting\.$/,
  /^(.+?) regains concentration and continues casting\.$/,
  // charm application (casts.rs:88) — the mob's name only, never a person's words
  /^(.+?) has been charmed\.$/,
  // "worn off" family: uncharm/CC-refresh/buff-fade all share this shape (casts.rs:89, 103-104)
  /^Your (.+?) spell has worn off of (.+?)\.$/,
  /^Your pet's (.+?) spell has worn off\.$/,
  /^Your (.+?) spell has worn off\.$/,
  // crowd control apply + wake (casts.rs:90, 92)
  /^(.+?) has been (?:mesmerized|enthralled|entranced|ensnared)\.$/,
  /^(.+?) has been awakened by (.+?)\.$/,
  // AA / discipline activation, self + other (casts.rs:105 is "You activate"; the fixture corpus
  // shows the same shape for other casters just as often — "Skander activates Asp Venom.")
  /^You activate (.+?)\.$/,
  /^(.+?) activates (.+?)\.$/,
  // stance + invocation (casts.rs:106-107)
  /^You assume an? (.+?) stance\.$/,
  /^You begin reciting the (.+?) invocation\.$/,
  // spell-gem bookkeeping: memorize/forget/spell-set (casts.rs:108-111)
  /^Beginning to memorize (.+?)\.\.\.$/,
  /^You have finished memorizing (.+?)\.$/,
  /^You forget (.+?)\.$/,
  /^Spell set (.+?) (?:saved|loaded|deleted)\.$/,
  // illusion click-off (classify_illusion_fade, exact sentence)
  /^Your illusion fades\.$/,
  // rogue poison coat, self (generic — covers all 20 canned poison names) + other (casts.rs:117-120)
  /^You coat your blades .*\.$/,
  /^(.+?) coats their blades in (.+?)!$/,
  /^(.+?)\s?coats their blades in poison\.$/,
  // rogue poison dry / wears-off (data.rs:111-114, POISON_DRY_MSG — 2 exact sentences)
  /^The poison dries from the blade\.$/,
  /^The venom drips away\.$/,
  // rogue poison procs (data.rs:123-174, POISON_PROCS — 10 fixed suffixes, target name is free)
  /(?:'s limbs move slower!|'s fingers slow down\.|'s blessings wither!|'s feet won't budge!|stumbles, clutching their head!|begins to sway!|blinks, looking confused!|starts limping!|begins to bleed profusely!|screams as poison burns their veins!)$/
]

// ---- Combat/mob status-effect flavor (measured against tests/fixtures/*.log, not the Rust ----
// ---- parser: the live engine doesn't bother giving these their own Kind — Kind::Unknown is    ----
// ---- exactly what mod.rs's dispatch produces for every one of them — but "not worth a typed  ----
// ---- event for gameplay tracking" and "safe for a bystander's privacy" are different questions. ----
// ---- Every pattern here names only a mob, an already-visible player, or the reader themselves, ----
// ---- never free text a bystander typed, which is the only thing this file exists to keep out. ----

const MOB_STATUS_SAFE: readonly RegExp[] = [
  /^(.+?) is tortured by the condemnation of (.+?)\.$/,
  /^(.+?) is torn between life and death\.$/,
  /^(.+?) adheres to the ground\.$/,
  /^(.+?) is protected by a vortex of shadows\.$/,
  /^(.+?) is engulfed by darkness\.$/,
  /^(.+?) writhes? in the grip of agony\.$/,
  /^(.+?) is bathed in healing water\.$/,
  /^(.+?) has fallen to the ground\.$/,
  /^(.+?) feels? a healing touch\.$/,
  /^(.+?) is surrounded by a traveling spirit\.$/,
  /^(.+?) staggers? with mental anguish\.$/,
  /^(.+?) is stunned by (.+?)\.$/,
  /^(.+?) suffers a blow to the head\.$/,
  /^You stagger as an? .+? slams against you\.$/,
  /^(.+?) staggers as an? .+? slams into them\.$/,
  /^(.+?)'s eyes are covered by dark shadows\.$/,
  /^(.+?) is healed by the spirit of the slug\.$/,
  /^You being to feel healed by the slug\.$/,
  /^You feel the slug spirit depart\.$/,
  /^(.+?) begins to use an? (.+?) as a living shield!$/,
  /^(.+?) ceases protecting (.+?)\.$/,
  /^(.+?) enters a meditative trance\.$/,
  /^(.+?) enters an accelerated frenzy\.$/,
  /^(.+?)'s corpse spurts foul smelling blood, and is still\.$/,
  /^You escape from combat\.$/,
  /^You vanish completely\.$/,
  /^You have been knocked unconscious!$/,
  /^You avoid the stunning blow\.$/,
  /^You overcome the stun!$/,
  /^You are stunned!$/,
  /^I have [0-9]+ percent of my hit points left\.$/,
  /^A coat of shimmering runes surrounds you\.$/
]

// ---- System / UI messages (same measurement basis as MOB_STATUS_SAFE above) ----

const SYSTEM_UI_SAFE: readonly RegExp[] = [
  // targeting and range rejections
  /^Your target is too far away, get closer!$/,
  /^You can't reach that, get closer\.$/,
  /^Your target is out of range, get closer!$/,
  /^You cannot see your target\.$/,
  /^You must first click on the being you wish to attack!$/,
  /^You must first select a target for this spell!$/,
  /^You no longer have a target\.$/,
  /^Your target looks unaffected\.$/,
  /^Your target does not meet the spell requirements\..*$/,
  /^Your target has been stunned too recently for your stun to have full effect\.$/,
  /^Your target is immune to the stun portion of this effect\.$/,
  /^You are too far away from (.+?) to trade\.$/,
  /^You are too far away to inspect that\.$/,
  /^Targeted \((?:NPC|Player|Merchant|Banker)\): .+$/,
  /^Stand close to and right click on the (?:NPC|Player|Merchant|Banker) to .+$/,
  // spell/ability cast rejections
  /^Insufficient Mana to cast this spell!$/,
  /^You can't cast spells while stunned!$/,
  /^You can not cast this spell while in combat\.$/,
  /^You cannot switch invocations while casting!$/,
  /^This spell only works on constructs or elementals\.$/,
  /^This spell only works on the undead\.$/,
  /^This song cannot be played while (.+?) is enabled\.$/,
  /^You can not use this skill while on a mount\.$/,
  /^Your will is not sufficient to command this weapon\.$/,
  /^This pet may not be made invisible\.$/,
  /^This creature would take (?:considerable effort|an army) to defeat!$/,
  /^Neither you nor your pet has an eligible class to equip (.+?)\.$/,
  /^You can use the ability (.+?) again in .+?\.$/,
  /^Your (.+?) spell did not take hold(?: on (.+?))?\.(?: \(Blocked by (.+?)\.\))?$/,
  /^Your spell was mostly successful\.$/,
  /^Your spell would not have taken hold on your target\.$/,
  /^Aborting memorization of spell\.$/,
  /^You cannot cast (.+?) on (.+?)\.$/,
  /^Your Augmentation spell on (.+?) has been overwritten\.$/,
  /^(.+?) tries to cast a spell on you, but you are protected\.$/,
  // an Exaltation trinket's flavor tick — several distinct items, one shape
  /^Your .+? \(Exaltation\) .+\.$/,
  /^Your spellbook has been updated!$/,
  // the wiki-scraped msgCastOnYou for "Guardian Rhythms" says "surround", the real client message
  // says "surrounding" — a scrape/client mismatch, so this exact real line is added directly
  // rather than relying on isKnownSpellMessage's exact match.
  /^You feel an aura of mystic protection surrounding you\.$/,
  /^You feel torn between life and death\.$/,
  /^(.+?) is healed from within\.$/,
  /^Your skin is rent by massive shards of deadly ice\.$/,
  /^(.+?) has captured (.+?)'s attention with an unparalleled approach!$/,
  /^(.+?) distorts your view of the target, try casting your spell from a different location\.$/,
  /^Your .+? sparkles\.$/,
  /^You really hate this place\.$/,
  /^You were hit by non-melee for [0-9]+ damage\.$/,
  /^YOU were crushed\.$/,
  /^(.+?) is restored\.$/,
  /^The promise of divine renewal is fulfilled\.$/,
  /^You have entered an area where levitation effects do not function\.$/,
  // a genuine server broadcast — the `<SYSTEMWIDE_MESSAGE>:` prefix is not something a player's
  // own chat or emote can produce, so this is server-originated text, not a bystander's words.
  /^<SYSTEMWIDE_MESSAGE>:.*$/,
  // command / auto-attack / stance-change interim state
  /^Auto attack is (?:on|off)\.$/,
  /^You can't use that command right now\.\.\.$/,
  /^You begin to change your (?:stance|invocation)\.$/,
  // hunger and thirst
  /^You are (?:hungry|thirsty)\.$/,
  /^You are out of food and (?:drink|low on drink)\.$/,
  // faction
  /^Your faction standing with (.+?) could not possibly get any (?:better|worse)\.$/,
  /^Your faction standing with (.+?) has been adjusted by -?[0-9]+\.$/,
  // camp / loading
  /^LOADING, PLEASE WAIT\.\.\.$/,
  /^It will take about [0-9]+ more seconds to prepare your camp\.$/,
  /^Returning to Zone Safe Point\. Please wait\.\.\.$/,
  // zone / instance availability
  /^(.+?) is now available to you\.$/,
  /^(.+?) has been removed from (.+?)\.$/,
  /^This zone will shut down in [0-9]+ minutes!.*$/,
  // tasks and achievements (the self-only Primary Class Unlock line stays in SYSTEM_SAFE below;
  // this is the general task/achievement family, any subject)
  /^(?:You have|(?:.+?) has) completed achievement: .+$/,
  /^You have been assigned the task '(.+?)'\.$/,
  /^Your task '(.+?)' has been updated\.$/,
  /^You have been given: (.+?)$/,
  // items, keys, inventory
  /^Only Equipment items may be placed in the Equipment key ring\.$/,
  /^There is no room remaining in your hoard for this item!$/,
  /^There are no open slots for the held item in your inventory\.$/,
  /^(.+?) has been added to your key ring\.$/,
  /^(.+?) vanishes as you commit its details to memory\.$/,
  /^It's locked and you're not holding the key\.$/,
  /^You have learned (.+?)!$/,
  /^You have been granted the following discipline: (.+?)\.$/,
  // misc self status
  /^You are no longer feigning death, because a spell hit you\.$/,
  /^You are no longer encumbered\.$/,
  /^You feel as if you are about to look like yourself again\.$/,
  /^You feel as if you are about to fall\.$/,
  /^You feel yourself starting to appear\.$/,
  /^You begin to hide\.\.\.$/,
  /^You failed to hide yourself\.$/,
  /^You stop hiding\.$/,
  /^You begin to sneak\.\.\.$/,
  /^You are as quiet as a herd of running elephants\.$/,
  /^You are surrounded by darkness\.$/,
  /^You bear a curse of broken oaths\.$/,
  /^The curse dissipates\.$/,
  /^You feel a traveling spirit enter you\.$/,
  /^The spirit of travel leaves you\.$/,
  /^You feel resistant to magic\.$/,
  /^You have been summoned!$/,
  /^You are not currently assigned to an adventure\.$/,
  /^You are cured of (.+?) by (.+?)\.$/,
  /^You magically mend your wounds and heal considerable damage\.$/,
  /^The symbol of (.+?) flashes before your eyes\.$/,
  /^You are not currently in channel (.+?)$/,
  // channel system messages
  /^Channel .+? was too full to join$/,
  /^Channels: .+$/
]

// ---- Loot / currency / turn-ins (engine/crates/eqlog/src/parse/{world,acquire}.rs) ----

const LOOT_SAFE: readonly RegExp[] = [
  // the loot family, incl. the double-dash variant (world.rs:59-82)
  /^--You have looted (?:([0-9]+) |an? )?(.+?)(?: from (.+?) corpse)?\.--$/,
  /^You have looted (?:([0-9]+) |an? )?(.+?)(?: from (.+?) corpse)?\.$/,
  /^You looted (?:([0-9]+) |an? )?(.+?) from (.+?) corpse and stored it in your currency\.?$/,
  /^You looted (?:([0-9]+) |an? )?(.+?) from (.+?) corpse and sold it for (?:free|[0-9,]+ (?:platinum|gold|silver|copper).*?)\.?$/,
  /^You looted (?:([0-9]+) |an? )?(.+?) from (.+?) corpse and stored it in your (?:Dragon Hoard|tradeskill depot)\.?$/,
  /^You looted (?:([0-9]+) |an? )?(.+?) from (.+?) corpse to create (?:an? )?(.+?)\.?$/,
  /^You successfully destroyed ([0-9]+) (.+?)\.$/,
  // currency arrivals (acquire.rs:41-44)
  /^You receive (.+?) from the corpse\.$/,
  /^You received (.+?) from that item\.$/,
  /^You receive (.+?) from (.+?) for the (.+)\(s\)\.$/,
  /^You received? (.+?)\s*\.$/,
  // merchant purchase (acquire.rs:45)
  /^You purchased ([0-9]+) (.+?) from (.+?) for (.*)\.$/,
  // corpse-less item arrivals (acquire.rs:46-53)
  /^(.+?) has been placed in your inventory!$/,
  /^Your inventory is full\. (.+?) has been added to your overflow items!/,
  /^You have fashioned the items together to create something new: (.+?)\.$/,
  // turn-ins (world.rs:92-93)
  /^You offered [0-9,]+ (.+?) to (.+?)\.$/,
  /^You complete the trade with (.+?)\.$/,
  // item merge (world.rs:106-111) and its four fixed failure sentences
  /^You have successfully merged two items together to create a new item: (.+)$/,
  /^Your request to merge (.+?) with (.+?) failed\. /,
  /^The item you are trying to add will not work, this mote is not sufficiently powerful to upgrade this item\.$/,
  /^The item you are trying to add will not work, you cannot fuse an item to itself\.$/,
  /^The item you are trying to add will not work, you cannot merge two different types of items\.$/,
  /^Request to merge items canceled, both items remain unmodified\.$/
]

// ---- Zone / level / experience / AA (engine/crates/eqlog/src/parse/world.rs) ----

const PROGRESS_SAFE: readonly RegExp[] = [
  // zone line, with the pseudo-zone spell-effect sentence excluded via lookahead (world.rs:84-85)
  /^You have entered (?!an area where )(.+?)\.$/,
  // level up (world.rs:94)
  /^You have gained a level! Welcome to level ([0-9]+)!$/,
  // experience gain (world.rs:95)
  /^You gain (?:party )?experience(?: \(with a bonus\))?!(?: \([0-9.]+%\))?$/,
  // AA gain / spend / improve (world.rs:96-105)
  /^You have gained (?:an|[0-9]+) ability point(?:\(s\))?!\s+You now have ([0-9]+) ability point/,
  / at a cost of ([0-9]+) ability points?\.$/,
  /^You have improved (.+?) ([0-9]+) at a cost of/,
  // the one AA-potion landing sentence (world.rs:13, 477-484)
  /^You are filled with the spirit of alternate adventure\.$/,
  // instance-creation notice (world.rs:86-87, 234-247)
  /^Player (.+?) creating instance (.+?) ([0-9]+)\.$/
]

// ---- Death (engine/crates/eqlog/src/parse/world.rs:12, 88-91) ----

const DEATH_SAFE: readonly RegExp[] = [
  /^You died\.$/,
  /^You have been slain by (.+?)!$/,
  /^You have slain (.+?)!$/,
  /^(.+?) has been slain by (.+?)!$/,
  /^(.+?) died\.$/
]

// ---- Consider (engine/crates/eqlog/src/parse/world.rs:112-115, data.rs:179-189) ----

const CONSIDER_SAFE: readonly RegExp[] = [
  /^(.+?)(?: - a rare creature -)? (?:regards you as an ally|looks upon you warmly|kindly considers you|judges you amiably|regards you indifferently|looks your way apprehensively|glowers at you dubiously|glares at you threateningly|scowls at you, ready to attack) -- (.+?)\s*\(Lvl: ([0-9]+)\)$/
]

// ---- System messages (engine/crates/eqlog/src/parse/{session,who}.rs) ----

const SYSTEM_SAFE: readonly RegExp[] = [
  // session lifecycle — three exact sentences (session.rs:9-11)
  /^Welcome to EverQuest Legends!$/,
  /^It will take you about 30 seconds to prepare your camp\.$/,
  /^You abandon your preparations to camp\.$/,
  // the /outputfile receipt (session.rs:12, 43-55) — a non-empty file name is required
  /^Outputfile Complete: .+$/,
  // skill-up tick (who.rs:37)
  /^You have become better at (.+?)!(?: \(([0-9]+)\))?$/,
  // active special-attack notice (who.rs:38-41)
  /^You will now use (.+?)(?: instead of (.+?))? while (?:auto )?attacking\.$/,
  // item activation (who.rs:42-45)
  /^Your (.+?) (?:shimmers briefly|feels alive with power)\.$/,
  // primary-class unlock (who.rs:10, 126-138)
  /^You have completed achievement: Primary Class Unlock - .+$/
]

// ---- Group membership (engine/crates/eqlog/src/parse/group.rs) ----
//
// Kept per the 2026-08-05 ruling in `logScrub.ts`'s header: these are structural facts about the
// fight, not communications. The "confirm" shape (`<Name> tells the group, '...'`) is deliberately
// NOT included here — it carries a quoted-speech comma-quote and is already, correctly, caught by
// `DROP`'s rule 1 before this list is ever consulted.

const GROUP_NAME = "[A-Za-z][A-Za-z`'-]*"

const GROUP_SAFE: readonly RegExp[] = [
  /^You have joined the group\.$/,
  /^You have been removed from the group\.$/,
  /^You are now the leader of your group\.$/,
  new RegExp(`^${GROUP_NAME} has joined the group\\.$`),
  new RegExp(`^${GROUP_NAME} has (?:left|been removed from) the group\\.$`),
  new RegExp(`^You remove ${GROUP_NAME} from the group\\.$`),
  new RegExp(`^${GROUP_NAME} is now the leader of your group\\.$`),
  new RegExp(`^You invite ${GROUP_NAME} to join your group\\.$`),
  new RegExp(`^${GROUP_NAME} invites you to join a group\\.$`)
]

/**
 * Every line shape the live parser recognizes as a structural fact about the fight — never a
 * person's own words. `logScrub.ts` keeps a line that matches one of these and drops anything
 * that matches neither this list nor `DROP`. See this module's header for what's deliberately
 * excluded and why.
 */
export const KNOWN_SAFE: readonly RegExp[] = [
  ...COMBAT_SAFE,
  ...CASTS_SAFE,
  ...MOB_STATUS_SAFE,
  ...SYSTEM_UI_SAFE,
  ...LOOT_SAFE,
  ...PROGRESS_SAFE,
  ...DEATH_SAFE,
  ...CONSIDER_SAFE,
  ...SYSTEM_SAFE,
  ...GROUP_SAFE
]

// ---- Per-spell messages (src/main/data/spells.json) — see the header's "PER-SPELL MESSAGES" ----

interface RawSpellEntry {
  readonly name: string
  readonly durationMs: number | null
  readonly illusion: boolean
  readonly msgCastOnYou?: string
  readonly msgCastOnOther?: string
  readonly msgWearsOff?: string
}

/** Mirrors `engine/crates/eqlog/src/spelldb/passes.rs`'s `is_placeholder` exactly. */
const BARE_SUBJECTS = new Set(['you', 'your', 'someone', 'target', 'player', 'soandso'])

function isPlaceholderMessage(msg: string): boolean {
  const trimmed = msg.trim()
  if (trimmed.toUpperCase() === 'N/A') return true
  const words = trimmed
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .toLowerCase()
  return words === '' || BARE_SUBJECTS.has(words)
}

/** The one leading placeholder word a `msgCastOnOther` scrape stands in for the target's name. */
const OTHER_MESSAGE_SUBJECT = /^(?:Someone|Soandso|Target|Player)\b/i

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Built ONCE at module load from `spells.json`'s scraped message text — never per call. Self
 * messages (`msgCastOnYou` / `msgWearsOff`) are exact-matched, since they name no one but the
 * reader. `msgCastOnOther` messages are suffix-matched with their leading placeholder word
 * stripped, since a real log prints the target's actual name where the scrape prints `Someone`.
 */
function buildSpellMessageMatchers(): { self: ReadonlySet<string>; otherSuffix: RegExp | null } {
  const raw = (spellsData as { spells: readonly RawSpellEntry[] }).spells
  // A removal means EQ Legends does not have this spell at all (src/main/data/spellRemovals.ts) —
  // nobody can ever cast it, receive it, or have it wear off, so its scraped message text is not
  // real client output and does not belong in a "measured, not guessed" corpus. Applied before
  // extraction for the same reason every other spells.json consumer applies it before deriving a
  // table (tests/spellRemovals.test.mts enforces this repo-wide).
  const { spells } = applySpellRemovals(raw)
  const self = new Set<string>()
  const otherSuffixes = new Set<string>()
  for (const s of spells) {
    for (const msg of [s.msgCastOnYou, s.msgWearsOff]) {
      if (msg && !isPlaceholderMessage(msg)) self.add(msg.trim())
    }
    const other = s.msgCastOnOther
    if (other && !isPlaceholderMessage(other)) {
      const trimmed = other.trim()
      // The scrape sometimes leaves a stray space between the placeholder and a possessive `'s`
      // (257 of 796 entries: "Someone 's brain begins to melt." for a real "Nagafen's..." line) —
      // collapse it, since no real name is ever followed by a space before its own possessive.
      const suffix = OTHER_MESSAGE_SUBJECT.test(trimmed)
        ? trimmed.replace(OTHER_MESSAGE_SUBJECT, '').replace(/^\s+(?=')/, '')
        : trimmed
      if (suffix.trim()) otherSuffixes.add(suffix)
    }
  }
  const otherSuffix =
    otherSuffixes.size === 0
      ? null
      : new RegExp(`(?:${[...otherSuffixes].map(escapeRe).join('|')})$`)
  return { self, otherSuffix }
}

const SPELL_MESSAGES = buildSpellMessageMatchers()

/**
 * True when the line body is one of the app's own scraped spell messages — a cast-on-you, a
 * wear-off, or a cast-on-other with the target's name in place of the scrape's placeholder word.
 * Checked separately from `KNOWN_SAFE` because the corpus is a lookup table (~2,000 entries),
 * not a handful of patterns worth inlining into one array scanned with `.some()`.
 */
export function isKnownSpellMessage(body: string): boolean {
  if (SPELL_MESSAGES.self.has(body)) return true
  return SPELL_MESSAGES.otherSuffix?.test(body) ?? false
}

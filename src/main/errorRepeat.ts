// ============================================================================
// errorRepeat.ts — the same error line, over and over, capped once (JOS-133).
// ============================================================================
//
// THE PROBLEM THE FLEET SHOWED US. Over 14 days the error store's only recurring cohort-wide
// issue was ONE fingerprint with 17,632 occurrences. It was not an error (image-cache fetch
// failures — demoted to a counter by the other half of this ticket), but the shape it exposed is
// general and will happen again with something that IS an error: a condition that fires on a
// timer, or once per image, or once per tick, writes the identical line until it fills the 1 MB
// errors.log and truncates away everything that came before it. The hundredth copy of a line
// teaches a reader nothing the fifth did not, and it costs them the ninety-five earlier lines of
// CONTEXT that would have explained it.
//
// SO: THE FIRST FEW COPIES ARE WRITTEN NORMALLY, THE REST ARE COUNTED. Not sampled, not dropped —
// counted, and the count ships with the health rollup (`suppressedErrorLines`,
// telemetry/health.ts), so `mainErrorLogLines + suppressedErrorLines` is still exactly how many
// times the thing happened. A cap that deflated the fleet's error rate would make a build that
// started looping look like a build that got better, which is worse than the noise it fixed.
//
// WHY FIVE. It is the smallest number that still shows a reader the two things a repeat is read
// for — that it repeats at all, and how fast (four inter-arrival gaps, from the timestamps the
// log already carries) — while bounding the worst case at five lines per distinct failure instead
// of one per occurrence. One is not enough (a single line cannot be told apart from a one-off);
// ten would have cost 176,320 lines to say what 8,816 already said. It is deliberately NOT tuned
// per site: a knob here would be a second opinion about what "identical" is worth, at 80-odd call
// sites that cannot each be reasoned about.
//
// THIS MODULE IMPORTS NOTHING, and for `consoleForward.ts`'s reason (see also
// telemetry/health.ts): `errorLog.ts` is its only caller and sits on the app's error path, where a
// module-init cycle is the single worst bug to discover. A leaf cannot participate in one. The
// happy consequence is that the whole rule is drivable from a node test with no Electron in the
// process — `tests/errorRepeat.test.mts` runs the real production code, not a copy of it.
//
// WHAT IT IS NOT. `telemetry/errorReports.ts` also dedupes, per FINGERPRINT, and reports its own
// `count`. That one is about the wire; this one is about the local file a human greps, and they
// run independently on purpose — a suppressed line still produces its error report, so nothing
// the fleet can see is lost by capping what the disk holds.

/** Copies of one identical line written to errors.log before the rest become a count. */
export const MAX_IDENTICAL_ERROR_LINES = 5

/**
 * Distinct lines tracked at once. A bound on memory, and — because a key holds a slice of the
 * line — a bound the app's own behavior can never push past by producing more VARIETY.
 *
 * PAST IT, NOTHING IS SUPPRESSED. A key that cannot be tracked is written every time, which is
 * the old behavior and the honest failure direction: this module may cost the file lines it did
 * not have to, and may never cost it a line it cannot account for.
 */
export const MAX_TRACKED_ERROR_KEYS = 500

/**
 * How much of the payload identifies a line. A stack trace's first 300 characters carry the error
 * class, the message and the top frames — everything two occurrences of one fault share and
 * everything two different faults differ in — while a whole trace as a Map key would hold
 * kilobytes per entry for no extra discrimination.
 */
export const ERROR_KEY_CHARS = 300

export interface RepeatDecision {
  /** Append this occurrence to errors.log as usual. */
  readonly write: boolean
  /** Append this one-off notice INSTEAD. Only ever set on the occurrence that crosses the cap. */
  readonly notice: string | null
  /** Count it as suppressed (`noteSuppressedErrorLine`). True for every occurrence past the cap,
   *  including the one that carries the notice: the notice is not the line it replaced. */
  readonly suppressed: boolean
}

const WRITE: RepeatDecision = { write: true, notice: null, suppressed: false }
const DROP: RepeatDecision = { write: false, notice: null, suppressed: true }

/** Occurrences per key, this session. Reset only by `resetErrorRepeat` (tests, and nothing else —
 *  the cap is per SESSION by design, because a process that restarts has already lost the
 *  context the earlier copies were written for). */
const seen = new Map<string, number>()

/**
 * What makes two error lines "the same one".
 *
 * The SOURCE tag is part of it: the identical message from `main:uncaughtException` and from
 * `renderer:ErrorBoundary` are two different facts about where the app broke, and collapsing them
 * would hide one behind the other. The TIMESTAMP is not — it is the only thing that differs
 * between two copies of the same fault, so keying on the formatted line would defeat the cap
 * entirely.
 */
export function errorRepeatKey(source: string, body: string): string {
  // NUL separator, spelled as an escape: no source tag can contain it, so
  // ('a', 'b:c') and ('a:b', 'c') can never collide. A raw NUL byte here makes
  // git treat the file as binary.
  return `${source}\u0000${body.slice(0, ERROR_KEY_CHARS)}`
}

/**
 * Count one occurrence and say what to do with it. Total, allocation-light, and never throws —
 * it runs inside `logError`, which is itself the app's last line of defense.
 */
export function errorRepeat(source: string, body: string): RepeatDecision {
  const key = errorRepeatKey(source, body)
  const before = seen.get(key)
  // A NEW key with no room left is never tracked and so never suppressed (see the constant).
  if (before === undefined && seen.size >= MAX_TRACKED_ERROR_KEYS) return WRITE
  const n = (before ?? 0) + 1
  // Stop counting past the cap: what the number would become is nobody's question, and leaving it
  // unbounded is the one way an integer in here could ever surprise someone.
  seen.set(key, n > MAX_IDENTICAL_ERROR_LINES ? MAX_IDENTICAL_ERROR_LINES + 1 : n)
  if (n <= MAX_IDENTICAL_ERROR_LINES) return WRITE
  if (n === MAX_IDENTICAL_ERROR_LINES + 1) {
    return {
      write: false,
      // Written to the file so a reader of errors.log is never left wondering why a line stopped.
      // It names the cap and where the rest went, and it carries no part of the payload — the five
      // copies above it are the payload.
      notice:
        `[errorRepeat] this line has now been written ${String(MAX_IDENTICAL_ERROR_LINES)} times ` +
        `from [${source}]; further identical copies this session are counted, not written`,
      suppressed: true,
    }
  }
  return DROP
}

/** Distinct lines currently tracked. For tests and diagnostics; never sent anywhere. */
export function errorRepeatTracked(): number {
  return seen.size
}

/** Forget every key. Tests only — the cap is per session (see `seen`). */
export function resetErrorRepeat(): void {
  seen.clear()
}

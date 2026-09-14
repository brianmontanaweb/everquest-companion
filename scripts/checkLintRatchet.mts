/**
 * checkLintRatchet.mts -- `npm run check:lint-ratchet <base-ref>`. THE RATCHET ONLY
 * SHRINKS, enforced instead of trusted.
 *
 * WHAT IT DOES NOT DO, and why the obvious thing is wrong: it never runs
 * `npm run lint:ratchet`. That script is a GENERATOR -- running it in CI would
 * regenerate the register against whatever the tree looks like now, which silently
 * WIDENS it. That is the single failure mode the ratchet design exists to prevent;
 * scripts/lint-report.mts says so in its own header, in capitals.
 *
 * New debt is ALREADY caught, and by lint rather than by this: eslint.ratchet.mjs
 * suppresses only the exact file x rule pairs it lists, so a new violation anywhere
 * else reds `npm run lint`. The gap this closes is somebody ADDING an entry to hide
 * that debt instead of fixing it. So this compares the committed register against the
 * SAME FILE AT THE BASE REF and fails on any key present now and absent there.
 *
 * Deletions pass. An unchanged file passes. Adding an entry is the INTEGRATOR's
 * deliberate call (the file's header says so) -- when that is genuinely the intent,
 * this step is what makes it an argued diff rather than a quiet one.
 *
 * THE OVERRIDE, and why there is one. Until 2026-09-13 that last sentence was pure
 * PROSE: the advisory said "say so in the commit message" and then failed anyway no
 * matter what the message said. So a widening the owner had actually approved -- the
 * 104-entry Prettier reflow batch was the first -- left this gate permanently red, and
 * the only move left was merging over it, which is how a gate stops being one. The
 * argument therefore now has a machine-readable form: a git trailer, in the style of
 * `Co-Authored-By:`, on ANY commit in `<base>..HEAD`:
 *
 *   Ratchet-Widening-Approved: <why, in one sentence>
 *
 * Present anywhere in the range, the growth PASSES -- and is still printed in full, with
 * the commit that carried the approval named beside it, because an override that hides
 * what it waived is worse than no gate at all. Absent, nothing changes: it fails, naming
 * every new entry. It is checked ACROSS THE WHOLE RANGE rather than on the tip because
 * the commit that widens the ratchet is rarely the last one on a branch. Nobody types
 * that token by accident, which is the entire reason it can be read as consent.
 *
 * IT TOUCHES NO NETWORK. It reads git objects and one file already in this repo.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** One `{ files, rules }` block of `eslint.ratchet.mjs`'s default export. */
export interface RatchetEntry {
  files: string[]
  rules: Record<string, string>
}

/**
 * One key per file x rule. The cross product is the point: an entry listing three files
 * is three suppressions, and flattening is what stops a widening from hiding inside an
 * existing block's `files` array.
 */
export function entryKeys(ratchet: RatchetEntry[]): Set<string> {
  const keys = new Set<string>()
  for (const e of ratchet) {
    for (const file of e.files) {
      for (const rule of Object.keys(e.rules)) keys.add(`${file}\u0000${rule}`)
    }
  }
  return keys
}

/** Keys in `head` that `base` did not have. Empty means the ratchet held or shrank. */
export function compareRatchets(base: RatchetEntry[], head: RatchetEntry[]): string[] {
  const before = entryKeys(base)
  return [...entryKeys(head)].filter((k) => !before.has(k)).sort()
}

/** The trailer that marks a widening as the integrator's deliberate, argued call. */
export const RATCHET_WIDENING_TRAILER = 'Ratchet-Widening-Approved:'

/**
 * Every approval trailer in `messages` -- one commit message, or a whole range's worth run
 * together. LINE-ANCHORED and CASE-SENSITIVE, and both halves of that matter: prose that
 * merely mentions the token ("we discussed whether Ratchet-Widening-Approved: applies") is
 * a description of the mechanism, not an invocation of it. The value of a gate that can be
 * waived is entirely in how hard the waiver is to write by accident.
 */
export function ratchetWideningApprovalLines(messages: string): string[] {
  return messages
    .split(/\r?\n/)
    .filter((line) => line.startsWith(RATCHET_WIDENING_TRAILER))
    .map((line) => line.trimEnd())
}

/** Whether any commit in `messages` approved a widening. The gate's actual question. */
export function hasRatchetWideningApproval(messages: string): boolean {
  return ratchetWideningApprovalLines(messages).length > 0
}

/**
 * `{ sha, message }` for every commit in `baseRef..HEAD`, newest first.
 *
 * Record- and field-separated rather than a bare `--format=%B` for one reason: the audit
 * line has to NAME the commit that approved a widening, and messages run together cannot.
 * \x1e/\x1f are the ASCII separators for exactly this, and cannot occur in a message.
 *
 * A failed git call returns [] -- which reads as "no approval" and so preserves the
 * existing red. A git invocation that cannot answer must never be why something goes green.
 */
function commitsSince(baseRef: string): { sha: string; message: string }[] {
  const RECORD = '\u001e'
  const FIELD = '\u001f'
  let out: string
  try {
    out = execFileSync('git', ['log', `${baseRef}..HEAD`, `--format=%H${FIELD}%B${RECORD}`], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
  } catch {
    return []
  }
  return out
    .split(RECORD)
    .map((record) => record.replace(/^\s+/, ''))
    .filter((record) => record.includes(FIELD))
    .map((record) => ({
      sha: record.slice(0, record.indexOf(FIELD)),
      message: record.slice(record.indexOf(FIELD) + 1),
    }))
}

/** The module's default export, loaded from a file URL so a path with a space still resolves. */
async function loadRatchet(path: string): Promise<RatchetEntry[]> {
  const mod = (await import(pathToFileURL(path).href)) as { default: RatchetEntry[] }
  return mod.default
}

/**
 * Whether `ref` names a commit we actually HAVE. Two cases must not be confused, and
 * conflating them is a false red that would burn this check's credibility on day one:
 *
 *   UNRESOLVABLE -- the first push of a new branch hands `github.event.before` an
 *     all-zero SHA, and a shallow clone may simply not hold the base commit. There is
 *     no "before" to compare against, so the only honest answer is SKIP.
 *   RESOLVABLE, file absent -- a real commit that predates eslint.ratchet.mjs. The
 *     empty set is correct there: every entry genuinely is new.
 */
function haveCommit(ref: string): boolean {
  try {
    execFileSync('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], {
      stdio: 'ignore',
    })
    return true
  } catch {
    return false
  }
}

/** The ratchet as it stood at `ref`. Absent there (predates the file) = empty. */
async function ratchetAt(ref: string): Promise<RatchetEntry[]> {
  let source: string
  try {
    source = execFileSync('git', ['show', `${ref}:eslint.ratchet.mjs`], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
  } catch {
    return []
  }
  // Written to disk rather than parsed: the file is a MODULE, and executing it is the
  // only reader guaranteed to agree with what ESLint itself will load.
  const file = join(mkdtempSync(join(tmpdir(), 'ratchet-')), 'base.mjs')
  writeFileSync(file, source)
  return loadRatchet(file)
}

async function main(): Promise<void> {
  const baseRef = process.argv[2]
  if (baseRef === undefined || baseRef === '') {
    console.error('usage: checkLintRatchet.mts <base-ref>')
    process.exit(2)
  }
  if (!haveCommit(baseRef)) {
    console.log(`eslint.ratchet.mjs: no comparable base at ${baseRef} -- skipped.`)
    return
  }
  const head = await loadRatchet(join(process.cwd(), 'eslint.ratchet.mjs'))
  const added = compareRatchets(await ratchetAt(baseRef), head)
  if (added.length > 0) {
    const grew = `eslint.ratchet.mjs GREW by ${String(added.length)} entry/entries vs ${baseRef}:`
    const approvals = commitsSince(baseRef).filter((c) => hasRatchetWideningApproval(c.message))
    if (approvals.length > 0) {
      // APPROVED -- and printed in full anyway, because the override exists to make a
      // sanctioned widening AUDITABLE, not invisible. Whoever reads this log later gets
      // both halves: exactly what grew, and exactly which commit said it could.
      console.log(grew)
      for (const k of added) console.log(`  ${k.replace('\u0000', '  ->  ')}`)
      console.log('')
      console.log(
        `APPROVED: widening sanctioned by ${String(approvals.length)} commit(s) in range:`,
      )
      const cited = approvals.flatMap((c) =>
        ratchetWideningApprovalLines(c.message).map((line) => `${c.sha.slice(0, 8)}  ${line}`),
      )
      for (const line of cited) console.log(`  ${line}`)
      return
    }
    console.error(grew)
    for (const k of added) console.error(`  ${k.replace('\u0000', '  ->  ')}`)
    console.error('')
    console.error('The ratchet only shrinks. Fix the code -- or, if this widening is')
    console.error('deliberate and yours to make, say so where a MACHINE can read it:')
    console.error('a trailer on ANY commit in this range, carrying the reason.')
    console.error('')
    console.error(`  ${RATCHET_WIDENING_TRAILER} <why, in one sentence>`)
    console.error('')
    console.error('This step then passes and logs both the growth above and the commit')
    console.error('that approved it. Prose alone in a commit message does not count --')
    console.error('it never did; until 2026-09-13 this advisory just failed to say so.')
    process.exit(1)
  }
  console.log(
    `eslint.ratchet.mjs: no new entries vs ${baseRef} (${String(entryKeys(head).size)} suppressed)`,
  )
}

// Run only when INVOKED, never when imported -- tests/lintRatchetCheck.test.mts imports
// the comparators and the approval predicate, and must not trip process.exit() by doing so.
const invokedDirectly = process.argv[1]?.endsWith('checkLintRatchet.mts') ?? false
if (invokedDirectly) {
  await main()
}

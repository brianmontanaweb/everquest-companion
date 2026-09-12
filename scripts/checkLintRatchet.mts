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
      stdio: 'ignore'
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
      maxBuffer: 64 * 1024 * 1024
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
    console.error(`eslint.ratchet.mjs GREW by ${String(added.length)} entry/entries vs ${baseRef}:`)
    for (const k of added) console.error(`  ${k.replace('\u0000', '  ->  ')}`)
    console.error('')
    console.error('The ratchet only shrinks. Fix the code, or -- if this widening is')
    console.error("deliberate and yours to make -- say so in the commit message.")
    process.exit(1)
  }
  console.log(`eslint.ratchet.mjs: no new entries vs ${baseRef} (${String(entryKeys(head).size)} suppressed)`)
}

// Run only when INVOKED, never when imported -- tests/lintRatchetCheck.test.mts imports
// the two comparators and must not trip process.exit() by doing so.
const invokedDirectly = process.argv[1]?.endsWith('checkLintRatchet.mts') ?? false
if (invokedDirectly) {
  await main()
}

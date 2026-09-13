#!/usr/bin/env node
// A thin passthrough to electron-vite's own CLI, with one fix applied first.
//
// The preload build's `isolatedEntries` option (electron.vite.config.ts — added for the sandbox
// hardening pass, see src/main/windows.ts's `WEB_PREFERENCES`) reports progress by calling
// `process.stdout.clearLine` / `cursorTo` / `moveCursor` UNCONDITIONALLY, with no guard for a
// non-TTY stdout. Node only defines those methods on a real terminal stream, so any
// non-interactive invocation — CI, a piped `npm run build`, this project's own e2e build step —
// crashes before writing a single file. Nothing in electron-vite's own config, `logLevel`
// included, suppresses the crashing call; only the methods being ABSENT does, which is what this
// polyfill supplies. `isolatedEntries` is `@experimental` in electron-vite 5.0.0's own types —
// this file is safe to delete once a release fixes the crash upstream.
if (!process.stdout.clearLine) process.stdout.clearLine = () => true
if (!process.stdout.cursorTo) process.stdout.cursorTo = () => true
if (!process.stdout.moveCursor) process.stdout.moveCursor = () => true
if (!process.stdout.columns) process.stdout.columns = 80

import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const requireFromHere = createRequire(import.meta.url)

/** electron-vite's CLI entry, via its package manifest — `bin` names it, and the subpath itself
 *  is not in the package's `exports` map, so it cannot be resolved directly (same technique as
 *  tests/e2e/build.mts's `electronViteCli`). */
function electronViteCli() {
  const manifestPath = requireFromHere.resolve('electron-vite/package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const rel = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.['electron-vite']
  if (!rel) throw new Error('electron-vite declares no bin entry')
  return join(dirname(manifestPath), rel)
}

const cli = electronViteCli()
// The CLI reads its own argv at import time; forward everything after `node electron-vite.mjs`.
process.argv = [process.argv[0], cli, ...process.argv.slice(2)]
await import(pathToFileURL(cli).href)

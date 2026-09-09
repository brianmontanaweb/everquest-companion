// =============================================================================
// ensure-electron.mjs — the Electron binary is PRESENT, and we checked.
// =============================================================================
//
//     node scripts/ensure-electron.mjs      -> exits 0 with the binary on disk,
//                                              or non-zero saying why not
//
// WHY THIS EXISTS. `.npmrc` sets ignore-scripts=true, so `npm ci` installs the
// `electron` PACKAGE without ever fetching its ~190 MB BINARY. The rule has
// always been "run `npm run deps:electron` afterwards", and that rule is easy to
// follow badly: `node node_modules/electron/install.js` prints NOTHING on
// success and NOTHING on failure, so a run that did not restore the binary looks
// exactly like a run that did. The tree then stays green through typecheck,
// lint, unit tests and `npm run build` — none of which need the binary — and the
// break surfaces later, somewhere unrelated, as a stranger's error string.
//
// .npmrc says the download "can now be triggered implicitly, by the first thing
// that imports electron". THAT IS TRUE, AND IT DOES NOT COVER `npm run dev`.
// Electron's own node_modules/electron/index.js self-heals: getElectronPath()
// calls downloadElectron() when path.txt or the binary is missing. But
// electron-vite does NOT go through it — it reimplements getElectronPath(), reads
// path.txt itself, and throws a bare `Error: Electron uninstall` when the file is
// absent (node_modules/electron-vite/dist/chunks/lib-*.js). So the one command a
// developer runs most is the one command the lazy path cannot rescue.
//
// WHAT THIS DOES. Resolves the binary through Electron's OWN logic — so we
// inherit the self-heal rather than reimplementing a third copy of it — and then
// asserts the file it named actually exists. index.js downloads when path.txt is
// missing but returns its computed path without re-checking, so the assert is not
// redundant.
//
// It is a no-op costing ~65 ms once the binary matches, which is why the scripts
// that launch Electron can afford to call it every time instead of trusting that
// somebody remembered.
// =============================================================================

import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

let binary
try {
  // Electron's index.js is `module.exports = getElectronPath()` — requiring it
  // from plain Node returns the path string and downloads first if it has to.
  // This does not start Electron.
  binary = require('electron')
} catch (err) {
  console.error('ensure-electron: could not resolve the Electron binary.')
  console.error(`ensure-electron: ${err.message}`)
  console.error('ensure-electron: try `rm -rf node_modules/electron && npm install electron`')
  process.exit(1)
}

if (typeof binary !== 'string' || !existsSync(binary)) {
  console.error(`ensure-electron: resolved to ${binary}, but nothing is there.`)
  console.error('ensure-electron: node_modules/electron/dist is missing or partial.')
  console.error('ensure-electron: try `rm -rf node_modules/electron && npm install electron`')
  process.exit(1)
}

console.log(`ensure-electron: ready — ${binary}`)

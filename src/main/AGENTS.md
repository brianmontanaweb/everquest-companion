# src/main/AGENTS.md — the Electron main process

Moved from the root AGENTS.md (2026-09-13, phase-3 colocation split). This
file holds the rules for Electron's main process: the runtime trust
boundary, product identity and channel isolation, the persisted-store
migration law, auto-update and EQ-install discovery, and the data-fetching
subsystems main owns (item knowledge, bundled wiki art, the image cache,
sound packs). See also `src/main/dataServer/README.md` (main's half of the
Rust engine seam) and `engine/AGENTS.md` (the fold's own semantics). The
root `AGENTS.md` carries the operating model, workflow rules, and release
process; read both when your work touches main.

## Electron trust boundary (do not weaken)

- ONE `WEB_PREFERENCES()` in `src/main/windows.ts` builds the webPreferences for
  EVERY window (main, all five overlays, and the tray popover) — never inline a
  second opinion. contextIsolation on; nodeIntegration (+InWorker/+InSubFrames),
  webviewTag, allowRunningInsecureContent, experimentalFeatures,
  enableBlinkFeatures, navigateOnDragDrop, spellcheck all off; webSecurity on.
  Stated explicitly even where they match Electron's default — the default is
  someone else's decision.
  **EXPORTED SINCE JOS-139, and the rule it protects is unchanged.** It was
  module-private on the argument that every window is created in one file, which
  made "never inline a second opinion" structural. The tray popover could not be
  created there — windows.ts sits exactly at the 400-code-line factoring ceiling
  and this repo answers a ceiling with a split, never a widened threshold — so
  the WINDOW moved (`src/main/tray.ts`) and the POSTURE did not. The guard is now
  the review, not the module boundary: a window built with anything but this
  object is the drift this section exists to prevent.
- **`sandbox: true` SINCE 2026-09-12 — MEASURED, not assumed.** (This entry said
  the opposite for a year; it is corrected here rather than carried across.) The
  blocker used to be real: all four preloads
  (`src/preload/{index,overlay,cursor,tray}.ts`) import the shared
  `src/shared/ipc.ts` registry, a multi-entry rollup build hoists it into
  `out/preload/chunks/`, and a SANDBOXED preload's `require` resolves only
  `electron` plus a small polyfill set — so the chunk `require` failed and
  `window.eq`/`eqOverlay`/`eqCursor`/`eqTray` were never installed. The fix is
  `electron.vite.config.ts`'s `preload.build.isolatedEntries: true` (each entry
  rebuilt through its own isolated Rollup pass, nothing hoisted) plus
  `externalizeDeps: false` — electron-vite's own stated pairing for sandbox
  correctness. Verified two ways: built `out/preload/*.js` carry no `chunks/`
  reference, and `npm run test:e2e` passes with every window sandboxed.
  `isolatedEntries`' progress reporter calls TTY-only `process.stdout` methods
  with no guard and crashes any non-interactive build, which is why
  `scripts/electron-vite.mjs` (not the raw CLI) is what `build`/`dev`/`preview`
  invoke. The layered mitigations that mattered BEFORE the OS sandbox are all
  still on, superseded by nothing: contextIsolation, no nodeIntegration in any
  form, deny-by-default navigation (hardenWebContents), permissions denied
  wholesale (hardenSession), and a CSP with no script-src escape hatch.
- Navigation/window-open/webview policy is installed ONCE from
  `app.on('web-contents-created')` (hardenWebContents), never per window: a
  window added later must not be able to miss it. `will-navigate` allows only the
  bundled renderer dir (or, in dev, the electron-vite server's ORIGIN — the
  server's own URL, so 5173/5174 both work); `setWindowOpenHandler` is
  deny-always and hands ONLY an allowlisted https URL to `shell.openExternal`.
  **That allowlist is the boundary, not a formality**: link URLs are built from
  WIKI PAGE TITLES (`shared/wiki.ts`), and an unvalidated openExternal would let
  one ask the OS to run `file:///…exe`. Widen `EXTERNAL_LINK_ALLOWLIST`
  (security.ts) deliberately or not at all, **and an entry is a HOST PLUS AN
  OPTIONAL PATH SCOPE — write the narrowest one that serves the link** (owner
  ruling, JOS-263). Widened ONCE (JOS-254), with a REPO-SCOPED github.com
  entry — only `https://github.com/brianmontanaweb/everquest-companion/…` opens; the
  three wiki entries stay host-wide because a wiki link's PATH is a page title
  this app cannot predict. The path prefix is matched SEGMENT-AWARE
  (`…-companion-evil` is not inside `…-companion`) against the
  WHATWG-normalized pathname, so `..` — and its `%2e%2e` spelling — is
  resolved away before the check. Full rationale: docs/agents-archive.md.
  All permissions are denied wholesale
  (this app needs none); pure policy lives in `src/main/security.ts` and is
  pinned by `tests/security.test.mts` (no Electron, never skips).
- Renderer-supplied strings that reach `join()` are validated AT THE IPC
  HANDLER (`sounds:getData`'s packId → `isSafePackId`), not trusted because
  today's only caller is the app's own UI.

## Data sources main owns

Scraper etiquette and the wiki API helpers stay in the root AGENTS.md
until the `scripts/` colocation phase; what follows is the half main
owns.

- Item knowledge: `itemLookup.ts` — local-first (posky) → wiki
  `{{Itempage}}` (`statsblock` flags / `relatedquests` / `notes`), userData
  cache with negative caching, live-loot background prefetch.
- **THE WIKI ART SHIPS IN THE BOX, AND THE FETCH IS THE FALLBACK** (JOS-198,
  `src/main/bundledImages.ts` + `resources/wiki-images/`): every distinct
  item iconId + all 29 boss portraits (780 files, 3.75 MB), COMMITTED — a
  build-time fetch would make `npm run dist` depend on two volunteer wikis'
  uptime. `npm run fetch:images` regenerates them + `manifest.json`. Files
  are named by the cache's OWN `cacheFileName()`, so the bundle and
  `<userData>/image-cache` are ONE namespace that cannot drift;
  `bundledImageRoots` probes dev/e2e, `app.asar`, `app.asar.unpacked` in
  order. electron-builder names `resources/wiki-images/**` EXPLICITLY, never
  `resources/**`. A source build without images is a SUPPORTED state that
  falls back to the runtime cache. CREDIT IS PART OF THE FEATURE (both wikis
  named in-app + README). Pins: `tests/bundledImages.test.mts` re-hashes all
  780; `bosses-week.e2e.mts` proves cold userData + no network. Full story:
  docs/agents-archive.md.
- **Downloaded images are cached PERMANENTLY** (`src/main/imageCache.ts`): no
  image the app fetches may ever be fetched twice — and since JOS-198 a
  normal install fetches NONE. Item icons serve from `eqimg://item/<id>` (a
  `protocol.handle` on the DEFAULT session — one handler covers every
  window); a miss is ONE polite fetch, written ATOMICALLY and only if the
  bytes sniff as an image. NEGATIVES ARE NEVER CACHED **ON DISK** — a
  refusal IS remembered IN MEMORY, only when the HOST SPOKE; a NETWORK
  failure is DELIBERATELY NOT remembered. On disk: no TTL, no eviction. The
  second route, `eqimg://url/<encoded>`, has a STRICT host allowlist — exact
  `new URL().hostname` equality, https only; never substring/endsWith. Entry
  name = `url-<sha256[0:24]>.<sniffed ext>`. **`img-src` does NOT list
  `https:`** (exactly `'self' data: eqimg:`): that is what makes "every
  downloaded image is cached" structurally true — widening the CSP is never
  the fix; wrap the URL through the `url` route. Full story:
  docs/agents-archive.md.
- Sound packs: og-packs registry (peonping.github.io/registry) —
  browse/install ~350 packs in-app. The single shipped default
  (`alan-rickman`, pinned tag) is GITIGNORED audio, self-provisioned via the
  same installPack path (additive, retried with backoff — and since JOS-273
  honouring the tombstone and the default-pack preference above). The
  synthesized `default` chime pack is DELETED; alerts pointing at any
  retired pack were rewritten by a ONE-TIME store migration
  (`migrateAlertSounds`), so an upgrading user's alerts never go silently
  mute. Pickers pre-select through the preference (`fallbackPack`), never
  `packs[0]`.
- **BRING YOUR OWN SOUND (JOS-68): `my-sounds` is a RESERVED pack with its own
  ROOT.** The user's imports live in `<userData>/my-sounds/` (the ordinary
  pack shape), NOT under `soundpacks/` — the sibling root makes a registry
  collision UNREPRESENTABLE rather than unlikely (`packDir()` resolves the
  reserved id FIRST, `installPack` refuses the name). **The file is COPIED,
  and the id BECOMES the filename** (`userSoundId()`: lowercase slug, capped,
  de-duped), so a moved original can never mute an alert and no byte of
  user-supplied path text reaches `join()`. The picker is
  `dialog.showOpenDialog` in MAIN — no absolute path crosses IPC in either
  direction; serving goes through the same `sounds:getData` + `isSafePackId`
  door as every pack, never a second one. **A missing custom sound is NOT
  silence** (falls back to the shipped default's line). Removal WARNS by
  naming the alerts that play it and leaves their defs ALONE. Identity /
  formats / the 25 MB cap: `shared/userSounds.ts`; the file work takes its
  ROOT as an argument (tests/userSounds.test.mts drives real copies in a
  temp dir). Full story: docs/agents-archive.md.

## Auto-update and EQ-install discovery

- Auto-update: electron-updater in `src/main/updater.ts` — channel from
  store; check at +10s then 30min; toast → quitAndInstall; dev-guarded on
  `app.isPackaged` EXCEPT channel IPC (settings UI needs it in dev).
- First-run self-sufficiency: the default sound pack self-provisions from
  its pinned registry tag; spell DB/overlay baseline inlined in the main
  bundle; EQ dir resolves via env → registry → drive-sweep with the
  Settings-gear override; zero logs anywhere → quiet empty state, never an
  error. Full detail: docs/agents-archive.md.
- **DISCOVERY SPAWNS NOTHING, AND THAT IS AN AV DECISION AS MUCH AS A SPEED ONE
  (JOS-184).** `src/main/log/discovery.ts` used to shell out (eight `reg.exe`
  queries + `wmic`); both reads now go in-process through `native-reg`
  (~150 ms of blocked main thread → ~6 ms, and no AV heuristic signature).
  Two invariants pinned by `tests/eqDiscovery.test.mts`: `eqInstallPathValue`
  reproduces the OLD command's contract exactly, and `fixedDrives` reads
  `HKLM\SYSTEM\MountedDevices` (mapped NETWORK drives are never there — the
  property that keeps the offline-share hang fixed). `native-reg` ships its
  N-API prebuild INSIDE the tarball; it is `require`d LAZILY and its failure
  swallowed — a bad `.node` must cost one of three discovery paths, not the
  launch. Full story: docs/agents-archive.md.

## Product identity + channel isolation (Task #58)

- ONE name everywhere: `everquest-companion` (package name, appId, installer,
  install dir, store file, log prefixes, scraper UAs); the DISPLAY name
  stays "EQ Legends Companion". `eq-tools` survives ONLY as the
  legacy-migration source. NSIS install dir + updater cache derive from
  package.json `name`, NOT productName. Full inventory:
  docs/agents-archive.md.
- Channels are decided in `src/main/channel.ts`, the FIRST import of
  index.ts (it must run before electron-store is constructed at module
  scope). Nothing else in the tree hardcodes a userData path — soundpacks,
  errors.log, item/registry caches and the learned overlay all resolve
  through `app.getPath('userData')`, so redirecting the root redirects
  everything:

  | channel | when | userData |
  |---|---|---|
  | prod | `app.isPackaged` | `%APPDATA%\everquest-companion` |
  | dev | not packaged | `%APPDATA%\everquest-companion-dev` |
  | e2e | `EQ_E2E=1` | temp dir (`EQ_E2E_USER_DATA` or `mkdtemp`) |

- Separate dirs ⇒ separate single-instance locks (Chromium keys
  ProcessSingleton off the user-data dir), so the installed app and the dev
  app genuinely run at the same time — verified with two Electron processes
  that both won `requestSingleInstanceLock()` on different dirs and where
  the second lost on a shared dir. Never "fix" a second instance quitting by
  weakening the lock; check the channel first.
- ONE-TIME SEED (prod + dev, never e2e): if the channel's dir does not exist
  and `%APPDATA%\eq-tools` does, an allowlist is COPIED and a
  `migrated-from.json` stamp written; Chromium caches / lockfile / errors.log
  deliberately skipped; the old dir is never modified — it's the backup.
  Guard is "target dir absent" so it can't run twice; failures log and
  startup continues. **UPDATE CONTINUITY BREAK (conscious)**: the rename
  means per-user NSIS sees a NEW app — an old `eq-tools` install never
  chain-updates; the user uninstalls once and state carries via the seed
  (documented in README). Allowlist + detail: docs/agents-archive.md.

## Settings migrations (persisted store schema)

- **LAW: any commit that changes a persisted shape ships a migration in the
  SAME commit.** Bump `CURRENT_SCHEMA_VERSION` in
  `src/main/storeMigrations.ts`, append a step to `MIGRATIONS`, add a fixture.
  That rule is the whole reason "an upgrade is clean, going back indefinitely"
  can be true: a store written by ANY past build must load in today's build,
  and auto-update means users jump many versions at once. `MIGRATIONS` is
  APPEND-ONLY — never renumber, edit a shipped step, or delete one.
- An explicit integer `schemaVersion` INSIDE the file, not app semver: CI
  stamps versions from tags and dev runs unstamped, so electron-store's
  semver-keyed `migrations` fire in surprising orders across channels. Absent
  ⇒ 1 (every pre-framework store), and the chain runs 1→2→…→CURRENT.
- Runs ONCE at startup from store.ts module scope, BEFORE `new Store()`, so no
  reader ever sees a pre-migration shape — and after channel.ts's one-time
  `eq-tools` seed (store.ts imports channel.ts first). Ad-hoc fixups in read
  paths are the anti-pattern it replaces: the flat `overlay` →
  `overlays.fight` fold moved out of `getOverlayConfig()` into migration 1→2.
  (`alertSoundMigration` predates the framework and keeps its own stamp — its
  "respect a user who re-points an alert" semantics aren't schema-shaped.)
- Migration 1→2 is REAL work, not a dormant no-op: it also recovers the
  `progress` blob commit 41831cc orphaned (salvaged under
  `legacy:pre-character` only when no real character exists — never guess an
  owner) and drops the dead `liveLoot` map.
- **Startup never dies here.** Unreadable ⇒ untouched, unstamped. Unparseable
  ⇒ QUARANTINED to `<name>.corrupt.json` and start fresh (conf leaves
  `clearInvalidConfig` false, so one truncated write otherwise throws on every
  read forever). A step that throws ⇒ keep what succeeded, stamp the last
  version that fully landed, retry next launch. Before the first write the
  original bytes are copied to `<name>.v<from>.backup.json`, once per source
  version (a later run never overwrites the pristine copy).
- **Downgrade (file newer than the build)**: log, back up, and leave the file
  ALONE — no down-migration, no reset, no stamping backwards. The old build
  runs best-effort, which is safe because every reader defaults on a missing
  key and electron-store rewrites the whole parsed object, so future keys
  survive round-trips. Verified by `tests/storeMigrations.test.mts`, which
  drives the pure runner + the file half with authored fixtures of the real
  historical shapes (no Electron, never skips).


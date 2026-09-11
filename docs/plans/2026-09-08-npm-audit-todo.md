# npm audit remediation — task list

Branch: `deps/npm-audit-2026-09-08` → PR
[#4](https://github.com/brianmontanaweb/everquest-companion/pull/4).
Plan: [tasks/plan.md](plan.md).

> Reconstructed 2026-09-09 after both files vanished from `tasks/` mid-session.
> Cause never established: the directory is not gitignored, the repo has no
> active git hooks and no husky, and nothing run here removes untracked files
> (`git reset --hard` and `git checkout -- <path>` both leave them). `plan.md`
> was restored from the original plan file; this file was rebuilt from the PR
> description. Flagged rather than quietly repaired.

## Commits (7 local, 6 pushed)

- [x] **Task 0 — Branch.** Clean tree on `main`, `deps/npm-audit-2026-09-08` cut,
      baseline `5 vulnerabilities (3 moderate, 2 high)`.
- [x] **Task 1 — `fast-uri` 3.1.5 → 3.1.7** (4× high, via `ajv`) `503b1e90`
- [x] **Task 2 — `nanoid` 3.3.16 → 3.3.18** (high, via `vite` → `postcss`) `cf9c51bf`
- [x] **Task 3 — `fflate` 0.8.1 → 0.8.3 + `@smithy/middleware-compression`
      4.5.16 → 4.6.2** (moderate; `@smithy/types` and `@smithy/core` are peer
      collateral) `20ab3ef0`
- [x] **Task 4 — `@xmldom/xmldom` 0.8.13 → 0.8.15** `a177e25c`
- [x] **Task 5 — Full gate.** typecheck + lint + unit + build + Lambda bundles.
- [x] **Task 6 — `js-yaml` 4.3.1 → 4.3.2** (high, published a day later) `5fa92fdd`
- [x] **Task 8 — Node version pin** `c75ead83`
- [x] **Task 7 — CI supply-chain gate** `fb293f62` — **committed, NOT pushed**

Every dependency fix was **in range** for its parents: `package.json` needed no
edit and no `overrides` entry. Seven packages moved, exactly what
`npm audit fix --dry-run` predicted.

## Final state

`npm audit`: **found 0 vulnerabilities** (from 6 across two days).

| gate | result |
|---|---|
| `npm run typecheck` | clean, both projects |
| `npm run lint` | clean |
| `npm test` | 4218/4223, 1 skipped, 4 pre-existing failures |
| `npm run build` | main + preload + 4 renderer entries |
| `node infra/build.mjs` | submit / telemetry / export all deterministic |
| `npm run gen:protocol` | byte-identical, no drift |
| `npm audit --audit-level=high` | exit 0 (exit 1 on `main` — the gate bites) |

## The 4 failing tests are PRE-EXISTING and environmental

Proven, not assumed: `main` was checked out and `npm ci`'d back to the ORIGINAL
dependency versions, and all four fail there identically.

1. `tests/spellRemovals.test.mts` ×2 — `new URL('..', import.meta.url).pathname`
   (lines 509, 531) does not percent-decode, so a checkout path containing a
   space yields `C:\Users\Brian%20Montana\...` and every read throws ENOENT. The
   canonical checkout (`C:\Users\jmoye\...`) has no space. Fix: `fileURLToPath()`.
2. `tests/engineDataParity.test.mts` — same idiom in
   `scripts/gen-engine-spell-overlay.mts`.
3. `tests/presenceNative.test.mts` — koffi process scan cannot find its own
   process under `dirname(process.execPath)`. Machine-specific; koffi untouched.

Worth a ticket; out of scope for this branch.

## Notes worth keeping

- **`@xmldom/xmldom` was re-rated mid-flight.** 1 moderate on 2026-09-08 → **10
  advisories rated high** on 2026-09-09 (ReDoS, quadratic parsing, quadratic
  memory). The committed 0.8.15 clears all ten. "moderate" in `a177e25c` is
  stale — accurate when written. Reachability caveat stands: `app-builder-lib`
  loads `plist` only from macOS paths and this project builds `nsis` only.
- **`js-yaml` is the one bump on a live path.** `electron-updater` is a
  production dependency and js-yaml parses its update feed.
- **`npm ci` is not safe to run while the app is open.** Eight Electron
  processes held `electron/dist/resources/default_app.asar`; the remove
  succeeded and the reinstall did not (EBUSY), leaving 73 of ~650 packages.
- **Node floor is 21, preference is 24.** `engines.node = ">=21"` states the
  true floor (`node --test` glob expansion); `.nvmrc` = `24` matches CI.
  Deliberately not `engine-strict`.

## Deliberately NOT done

- **No merge.** PR #4 is open for review.
- **`fb293f62` (CI gate) is not pushed** — the `gh` token has `repo` but not
  `workflow` scope, so GitHub rejects any push touching `.github/workflows/`.
  After `gh auth refresh -s workflow`, pushing the branch lands it on PR #4.
- **`build.yml` has no `pull_request` trigger**, so PR #4 gets no CI at all and
  the new gate would only run post-merge. Adding one would make it a true
  pre-merge gate — a cost decision left to the owner.
- No e2e sweep, no `electron-builder` pack (the lighter gate was chosen).
- `tasks/` stays **untracked**; this repo's convention for plan docs is
  `docs/plans/`.

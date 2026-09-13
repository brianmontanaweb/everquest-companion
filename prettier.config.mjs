// prettier.config.mjs — formatting config for everquest-companion.
//
// Chosen to match the tree's existing de-facto style (no formatter enforced
// it before this; verified against src/main/windows.ts and others) rather
// than Prettier's own defaults, so the one-time mass-reformat diff is a
// whitespace/quote/semicolon change and nothing else.
//
// semi: false / singleQuote: true — already the tree's convention.
// trailingComma: 'all' — Prettier 3's own default; the tree was inconsistent
//   on this (compare the FACTORING_RULES object vs. a multiline import list
//   in eslint.config.mjs before this config existed), so this picks one.
// printWidth: 100 — the tree already runs longer than Prettier's 80-char
//   default (e.g. windows.ts's multi-symbol import lines); 100 is close to
//   observed width without being unusually wide.
// endOfLine: 'lf' — LOAD-BEARING WITH .gitattributes; the two only work as a
//   pair. Prettier reads the WORKING TREE, not the git blob, so what git
//   STORES is irrelevant to this setting: under core.autocrlf=true (the
//   Git-for-Windows default, and what GitHub's windows-latest runners use) a
//   checkout smudges LF blobs to CRLF on disk, and `format:check` then reds
//   every file it just wrote. That is not a theory — it failed this branch's
//   first CI run on 1493 files. .gitattributes therefore pins `eol=lf` on
//   exactly the extensions this config formats, so a fresh checkout hands
//   Prettier the line endings it is configured to expect. Change one of those
//   two lists and you must change the other.

/** @type {import('prettier').Config} */
export default {
  semi: false,
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 100,
  tabWidth: 2,
  endOfLine: 'lf',
}

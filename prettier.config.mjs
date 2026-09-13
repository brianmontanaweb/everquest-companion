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
// endOfLine: 'lf' — matches what git actually stores (this machine runs
//   core.autocrlf=true; the few files pinned eol=lf in .gitattributes exist
//   for the same reason — LF is the canonical stored form).

/** @type {import('prettier').Config} */
export default {
  semi: false,
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 100,
  tabWidth: 2,
  endOfLine: 'lf',
}

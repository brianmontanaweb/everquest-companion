// packArchive.ts — the untrusted-archive half of the sound-pack installer (split out of
// packRegistry.ts to keep it under this repo's 400-line-per-file ceiling; see that file's header
// for the three jobs packRegistry.ts itself still owns).
//
// A registry pack's release tarball comes from an untrusted host (github.com's tag download,
// reached via a repo/ref the registry names — malicious or MITM'd is the threat model). Three
// things here bound what a crafted archive can do before any byte of it is trusted:
//   1. gunzipTar() caps the INFLATED size in memory — the compressed-download cap in
//      packRegistry.ts only ever bounded what arrived over the wire, and a small, highly
//      compressible download can still expand orders of magnitude past it.
//   2. readTar() is a minimal, read-only tar reader (this pack format needs nothing more).
//   3. stageEntries() caps what actually lands on disk, tighter than the in-memory cap on
//      purpose (a transient over-large buffer is freed; a file written to the user's disk is
//      not), and safeJoin() refuses any entry whose path would escape the stage directory.

import { resolve, sep, join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { rmSync, writeFileSync } from 'node:fs'

// Two tiers, two different resources: the first bounds the TRANSIENT in-memory tar (however much
// of it is throwaway padding a real pack would never carry), the second — tighter, on purpose —
// bounds what actually lands PERSISTENTLY on disk as pack files. Both are generous for a real
// voice pack (audio barely compresses, and packs are a few tens of MB) and hard enough to bound a
// bomb's worst case on the Electron main process, which also owns every window.
const MAX_DECOMPRESSED_BYTES = 512 * 1024 * 1024 // 512MB cap on the inflated tar, in memory
const MAX_STAGED_BYTES = 256 * 1024 * 1024 // 256MB cap on bytes actually written to disk

/** Gunzip with a hard ceiling on the inflated size — throws instead of over-allocating. */
export function gunzipTar(gz: Buffer): Buffer {
  try {
    return gunzipSync(gz, { maxOutputLength: MAX_DECOMPRESSED_BYTES })
  } catch (err) {
    if (err instanceof RangeError) throw new Error('archive exceeded decompressed size cap')
    throw err
  }
}

export interface TarEntry {
  name: string
  type: string // '0'/'\0' = file, '5' = dir, 'x'/'g'/'L' = pax/longname (skipped)
  size: number
  data: Buffer
}

/** Parse an octal numeric tar header field (space/NUL terminated). */
function parseOctal(buf: Buffer, offset: number, length: number): number {
  const s = buf
    .toString('ascii', offset, offset + length)
    .replace(/[\0 ]+$/, '')
    .trim()
  if (!s) return 0
  const n = parseInt(s, 8)
  return Number.isFinite(n) ? n : 0
}

/**
 * Read a (already-gunzipped) tar archive into file entries. 512-byte headers;
 * name (0..100) + optional prefix (345..500) joined; size at 124; typeflag at 156.
 * pax/global/GNU-longname entries ('x','g','L','K') are skipped defensively (their
 * data block is consumed but not interpreted) — we don't need long names for these
 * packs. Two consecutive zero blocks end the archive.
 */
export function readTar(buf: Buffer): TarEntry[] {
  const out: TarEntry[] = []
  let off = 0
  let zeroBlocks = 0
  while (off + 512 <= buf.length) {
    const header = buf.subarray(off, off + 512)
    // End-of-archive: a full zero block.
    if (header.every((b) => b === 0)) {
      zeroBlocks++
      off += 512
      if (zeroBlocks >= 2) break
      continue
    }
    zeroBlocks = 0

    const name = header.toString('ascii', 0, 100).replace(/\0.*$/, '')
    const prefix = header.toString('ascii', 345, 500).replace(/\0.*$/, '')
    const fullName = prefix ? `${prefix}/${name}` : name
    const size = parseOctal(header, 124, 12)
    const type = String.fromCharCode(header[156] || 0x30) // '0' default
    off += 512

    const dataStart = off
    const padded = Math.ceil(size / 512) * 512
    off += padded

    // Skip pax extended headers / GNU long-name entries defensively.
    if (type === 'x' || type === 'g' || type === 'L' || type === 'K') continue
    // Only regular files ('0' or NUL) carry usable content; skip dirs/links.
    if (type !== '0' && type !== '\0') continue

    out.push({
      name: fullName,
      type,
      size,
      data: buf.subarray(dataStart, dataStart + size),
    })
  }
  return out
}

/** Reject a path that would escape the target dir once resolved. Also used by
 *  packRegistry.ts's uninstallPack, which guards its own delete the same way. */
export function safeJoin(targetRoot: string, relPath: string): string | null {
  const dest = resolve(targetRoot, relPath)
  const rootWithSep = targetRoot.endsWith(sep) ? targetRoot : targetRoot + sep
  if (dest !== targetRoot && !dest.startsWith(rootWithSep)) return null
  return dest
}

/** What the archive walk produced: the raw CESP manifest (if the pack carried one) and how
 *  many audio files were written into the stage dir. */
export interface StagedEntries {
  cespRaw: string | null
  wrote: number
}

/**
 * Write the pack root's files out of the archive into `stageDir`: `openpeon.json` verbatim
 * (kept alongside for provenance) and every audio file flattened under `sounds/`. Throws —
 * after removing the stage dir — on an entry that would escape the target or push the total
 * written past MAX_STAGED_BYTES.
 */
export function stageEntries(
  entries: TarEntry[],
  rootPrefix: string,
  stageDir: string,
): StagedEntries {
  let cespRaw: string | null = null
  let wrote = 0
  let stagedBytes = 0
  for (const entry of entries) {
    if (!entry.name.startsWith(rootPrefix)) continue
    const rel = entry.name.slice(rootPrefix.length)
    if (!rel || rel.endsWith('/')) continue

    const dest = safeJoin(stageDir, rel)
    if (!dest) {
      rmSync(stageDir, { recursive: true, force: true })
      throw new Error(`unsafe archive path: ${entry.name}`)
    }

    const base = rel.split('/').pop() ?? rel
    const isManifest = rel === 'openpeon.json'
    const isAudio = /\.(wav|mp3|ogg)$/i.test(base)
    if (!isManifest && !isAudio) continue

    // A running total across every entry actually written — the per-download cap only bounds
    // the compressed bytes that arrived over the wire, not what a bomb inflates to on disk.
    stagedBytes += entry.data.length
    if (stagedBytes > MAX_STAGED_BYTES) {
      rmSync(stageDir, { recursive: true, force: true })
      throw new Error('archive exceeded staged size cap')
    }

    if (isManifest) {
      cespRaw = entry.data.toString('utf8')
      // keep the original alongside for provenance
      writeFileSync(dest, entry.data)
      continue
    }
    // Only keep audio files, flattened under sounds/ (matches our manifest paths).
    writeFileSync(join(stageDir, 'sounds', base), entry.data)
    wrote++
  }
  return { cespRaw, wrote }
}

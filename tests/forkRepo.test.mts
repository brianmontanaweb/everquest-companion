// ONE REPO, NAMED FOUR TIMES (the first fork release, v1.17.0). The update feed in
// electron-builder.yml, the external-link allowlist in main, and the What's new panel's releases
// link must all name the same GitHub repo. If the feed moves and a link doesn't, the link fails
// silently: the allowlist refuses it and nothing opens. Read as text on purpose: none of these
// files can be imported into a unit test without Electron.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EXTERNAL_LINK_ALLOWLIST } from '../src/main/security'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (...parts: string[]): string =>
  readFileSync(join(ROOT, ...parts), 'utf8').replace(/\r\n/g, '\n')

const FORK = 'brianmontanaweb/everquest-companion'

// The subject CN of the fork's Azure Artifact Signing certificate profile. electron-updater
// compares the installer's Authenticode publisher against this string verbatim.
const CERT_CN = 'Brian Montana'

test('the update feed publishes to and reads from the fork', () => {
  const yml = read('electron-builder.yml')
  const block = /^publish:\n((?: {2}.*\n)+)/m.exec(yml)
  assert.ok(block, 'electron-builder.yml has a top-level publish: block')
  const owner = /^ {2}owner: (\S+)$/m.exec(block[1])?.[1]
  const repo = /^ {2}repo: (\S+)$/m.exec(block[1])?.[1]
  assert.equal(`${owner}/${repo}`, FORK)
})

test('publisherName pins the fork owner of the certificate CN, not upstream', () => {
  // electron-updater rejects every update not Authenticode-signed by this exact name, and skips
  // checking entirely when it is absent. Either drift — upstream's name, or no name at all —
  // is silent: updates keep "working" with no publisher check, or stop working altogether.
  const yml = read('electron-builder.yml')
  assert.equal(/^\s*publisherName: (.*)$/m.exec(yml)?.[1], CERT_CN)
})

test('the external-link allowlist opens the fork, and only the fork, on github.com', () => {
  const gh = EXTERNAL_LINK_ALLOWLIST.filter((r) => r.host === 'github.com')
  assert.equal(gh.length, 1)
  assert.equal(gh[0].pathPrefix, `/${FORK}`)
})

test("What's new links to the fork's releases page", () => {
  const src = read('src', 'renderer', 'src', 'features', 'whatsnew', 'WhatsNewPanel.tsx')
  const url = /^const GITHUB_RELEASES_URL = '([^']+)'$/m.exec(src)?.[1]
  assert.equal(url, `https://github.com/${FORK}/releases`)
})

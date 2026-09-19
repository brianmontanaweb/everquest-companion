import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import vm from 'node:vm'

const SITE = join(import.meta.dirname, '..', 'site')
const UPSTREAM = 'https://github.com/jmoyers/everquest-companion'
const PAGES = ['index.html', 'launch.html']

const read = (name: string): string => readFileSync(join(SITE, name), 'utf8')
const anchors = (html: string): string[] => html.match(/<a\b[^>]*>/g) ?? []
const attr = (tag: string, name: string): string | null => {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(tag)
  return m?.[1] ?? null
}

interface FakeLink {
  href: string
  getAttribute: (n: string) => string | null
}

function runRepoJs(source: string, paths: string[]): { links: FakeLink[]; repo: unknown } {
  const links: FakeLink[] = paths.map((p) => ({
    href: 'unset',
    getAttribute: (n) => (n === 'data-repo-path' ? p : null),
  }))
  const win: Record<string, unknown> = {}
  const document = {
    querySelectorAll: (sel: string) => {
      assert.equal(sel, 'a[data-repo-path]')
      return links
    },
  }
  vm.runInNewContext(source, { window: win, document })
  return { links, repo: win.EQC_REPO }
}

test('site/repo.js exists and defaults EQC_REPO to upstream', () => {
  assert.ok(existsSync(join(SITE, 'repo.js')))
  const { repo } = runRepoJs(read('repo.js'), [])
  assert.equal(repo, 'jmoyers/everquest-companion')
})

test('repo.js rewrites every data-repo-path link from the one constant', () => {
  const forked = read('repo.js').replace(
    "'jmoyers/everquest-companion'",
    "'brianmontanaweb/everquest-companion'",
  )
  const { links } = runRepoJs(forked, ['', '/releases', '/blob/main/LICENSE'])
  assert.deepEqual(
    links.map((l) => l.href),
    [
      'https://github.com/brianmontanaweb/everquest-companion',
      'https://github.com/brianmontanaweb/everquest-companion/releases',
      'https://github.com/brianmontanaweb/everquest-companion/blob/main/LICENSE',
    ],
  )
})

for (const page of PAGES) {
  test(`${page}: every upstream repo link is switchable and its fallback matches`, () => {
    const repoLinks = anchors(read(page)).filter((a) => attr(a, 'href')?.startsWith(UPSTREAM))
    assert.ok(repoLinks.length > 0, 'expected at least one repo link')
    for (const a of repoLinks) {
      const path = attr(a, 'data-repo-path')
      assert.notEqual(path, null, `missing data-repo-path: ${a}`)
      assert.equal(attr(a, 'href'), UPSTREAM + path, `fallback href drifted: ${a}`)
    }
  })

  test(`${page}: author credit links are not repo-switched`, () => {
    for (const a of anchors(read(page))) {
      const href = attr(a, 'href') ?? ''
      if (href === 'https://jmoyers.org' || href === 'https://github.com/jmoyers') {
        assert.equal(attr(a, 'data-repo-path'), null, `author link must stay fixed: ${a}`)
      }
    }
  })

  test(`${page}: loads repo.js (before the inline script on index.html)`, () => {
    const html = read(page)
    const tag = html.indexOf('<script src="repo.js"></script>')
    assert.ok(tag >= 0, 'repo.js not loaded')
    const firstInline = html.search(/<script>/)
    if (firstInline >= 0 && page === 'index.html') assert.ok(tag < firstInline)
  })
}

test('index.html releases API call is built from EQC_REPO, not hard-coded', () => {
  const html = read('index.html')
  assert.doesNotMatch(html, /api\.github\.com\/repos\/jmoyers/)
  assert.match(
    html,
    /'https:\/\/api\.github\.com\/repos\/' \+ window\.EQC_REPO \+ '\/releases\/latest'/,
  )
})

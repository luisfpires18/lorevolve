// Run with `npm run lines` (Node 22.18+ strips the types itself). CI runs it as "Line limit".
//
// No web source file goes over 300 lines. lineLimit.allow.json holds the files that were already
// over on 2026-11-17, each with its line count then. The list only shrinks: a listed file may not
// grow, and a task that splits one removes it from the list in its own PR. Tracker: #380.
//
// Regenerate the list after a split: `node lineLimit.test.ts --write`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const LIMIT = 300
const srcRoot = join(import.meta.dirname, 'src')
const allowPath = join(import.meta.dirname, 'lineLimit.allow.json')

function lineCounts(): Map<string, number> {
  const counts = new Map<string, number>()
  for (const entry of readdirSync(srcRoot, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !/\.(ts|tsx|css)$/.test(entry.name)) continue
    const full = join(entry.parentPath, entry.name)
    const lines = readFileSync(full, 'utf8').replace(/\n$/, '').split('\n').length
    counts.set(full.slice(srcRoot.length + 1).replaceAll('\\', '/'), lines)
  }
  return counts
}

if (process.argv.includes('--write')) {
  const over = [...lineCounts()]
    .filter(([, lines]) => lines > LIMIT)
    .sort(([a], [b]) => a.localeCompare(b))
  writeFileSync(allowPath, JSON.stringify(Object.fromEntries(over), null, 2) + '\n')
} else {
  const allowed: Record<string, number> = JSON.parse(readFileSync(allowPath, 'utf8'))
  const counts = lineCounts()

  test(`no new source file is over ${LIMIT} lines`, () => {
    const fresh = [...counts].filter(([file, lines]) => lines > LIMIT && !(file in allowed))
    assert.deepEqual(fresh, [], 'split these files along their jobs')
  })

  test('a file on the list did not grow', () => {
    const grown = Object.entries(allowed).filter(([file, max]) => (counts.get(file) ?? 0) > max)
    assert.deepEqual(grown, [], 'these files grew past their recorded size: split them instead')
  })

  test('the list holds no stale entry', () => {
    const stale = Object.keys(allowed).filter((file) => (counts.get(file) ?? 0) <= LIMIT)
    assert.deepEqual(
      stale,
      [],
      'remove these from lineLimit.allow.json: they are gone or small enough now',
    )
  })
}

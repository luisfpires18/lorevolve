// Run with `npm run lines` (Node 22.18+ strips the types itself). CI runs it as "Line limit".
//
// No web source file goes over 300 lines. There is no list of exceptions: a file that grows past the
// limit is split along its jobs. Tracker: #380.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const LIMIT = 300
const srcRoot = join(import.meta.dirname, 'src')

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

test(`no source file is over ${LIMIT} lines`, () => {
  const over = [...lineCounts()].filter(([, lines]) => lines > LIMIT)
  assert.deepEqual(over, [], 'split these files along their jobs')
})

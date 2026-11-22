// Run with `node --test settleRead.test.ts` (Node 22.18+ strips the types itself).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { settleRead } from './src/lib/settleRead.ts'

const later = () => new Promise((resolve) => setTimeout(resolve, 0))

test('a value that lands after abort is dropped, even from a read that ignores the signal', async () => {
  const controller = new AbortController()
  const seen: string[] = []
  settleRead(
    later().then(() => 'old'),
    controller.signal,
    (value) => seen.push(value),
    () => seen.push('error'),
  )
  controller.abort()
  await later()
  await later()
  assert.deepEqual(seen, [])
})

test('a value and an error reach their handler while the read is current', async () => {
  const signal = new AbortController().signal
  const seen: string[] = []
  settleRead(
    Promise.resolve('new'),
    signal,
    (v) => seen.push(v),
    () => seen.push('error'),
  )
  settleRead(
    Promise.reject(new Error('x')),
    signal,
    (v) => seen.push(String(v)),
    () => seen.push('error'),
  )
  await later()
  assert.deepEqual(seen.sort(), ['error', 'new'])
})

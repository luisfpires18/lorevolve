import assert from 'node:assert/strict'
import { test } from 'node:test'
import { gameGateLoad } from './src/projects/gameGateLoad.ts'

const game = { id: 'g1' }

test('an address that names nothing is not found while the game is still loading', () => {
  const load = gameGateLoad({ loading: true, failed: false, game: null }, true, 'failed')
  assert.deepEqual(load, { kind: 'ready', value: null })
})

test('an address that names nothing is not found when the game read failed', () => {
  const load = gameGateLoad({ loading: false, failed: true, game: null }, true, 'failed')
  assert.deepEqual(load, { kind: 'ready', value: null })
})

test('the game read decides otherwise: loading, failed, then the game', () => {
  assert.deepEqual(gameGateLoad({ loading: true, failed: false, game: null }, false, 'failed'), {
    kind: 'loading',
  })
  assert.deepEqual(gameGateLoad({ loading: false, failed: true, game: null }, false, 'failed'), {
    kind: 'error',
    message: 'failed',
  })
  assert.deepEqual(gameGateLoad({ loading: false, failed: false, game }, false, 'failed'), {
    kind: 'ready',
    value: game,
  })
})

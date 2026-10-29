// Run with `node --test devVersion.test.ts` (Node 22.18+ strips the types itself).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEV_RUN_BASELINE, displayVersion } from './devVersion.ts'

test('a build that is not a DEV deployment shows package.json as it is', () => {
  assert.equal(displayVersion('0.1.0', undefined), '0.1.0')
  assert.equal(displayVersion('0.1.0', ''), '0.1.0')
  assert.equal(displayVersion('1.0.0-alpha', undefined), '1.0.0-alpha')
})

test('each DEV run is the next patch, marked -dev', () => {
  assert.equal(displayVersion('0.1.0', `${DEV_RUN_BASELINE + 1}`), '0.1.1-dev')
  assert.equal(displayVersion('0.1.0', `${DEV_RUN_BASELINE + 2}`), '0.1.2-dev')
  assert.equal(displayVersion('0.1.0', `${DEV_RUN_BASELINE + 5}`), '0.1.5-dev')
  assert.equal(displayVersion('0.2.3', `${DEV_RUN_BASELINE + 1}`), '0.2.4-dev')
  // A pre-release mark gives way to -dev on DEV.
  assert.equal(displayVersion('1.0.0-alpha', `${DEV_RUN_BASELINE + 1}`), '1.0.1-dev')
  assert.equal(displayVersion('1.0.0-rc.2', `${DEV_RUN_BASELINE + 3}`), '1.0.3-dev')
})

test('a run that could reuse or lower a version, or a version that is not a release, does not build', () => {
  for (const run of [`${DEV_RUN_BASELINE}`, '1', '0', '-3', '101.5', 'abc']) {
    assert.throws(() => displayVersion('0.1.0', run), /LOREVOLVE_DEV_RUN/)
  }
  assert.throws(() => displayVersion('0.1.0-dev', `${DEV_RUN_BASELINE + 1}`), /MAJOR.MINOR.PATCH/)
  assert.throws(() => displayVersion('1.0', `${DEV_RUN_BASELINE + 1}`), /MAJOR.MINOR.PATCH/)
})

// Run with `node --test buttonClass.test.ts` (Node 22.18+ strips the types itself).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buttonClass,
  iconButtonClass,
  ICON_SIZE,
  SIZE,
  TONE,
  type ButtonSize,
  type ButtonTone,
} from './src/lib/buttonClass.ts'

// One expected string per tone: a new tone without a case here fails the loop below.
const TONE_CLASS: Record<ButtonTone, string> = {
  primary: 'button',
  secondary: 'button button--secondary',
  text: 'button button--text',
  danger: 'button button--danger',
  'danger-quiet': 'button button--secondary button--danger-quiet',
}

test('every tone has its class string, alone and at every size', () => {
  assert.deepEqual(Object.keys(TONE_CLASS).sort(), Object.keys(TONE).sort())
  for (const tone of Object.keys(TONE) as ButtonTone[]) {
    assert.equal(buttonClass({ tone }), TONE_CLASS[tone])
    for (const size of Object.keys(SIZE) as ButtonSize[]) {
      const sm = size === 'sm' ? ' button--sm' : ''
      assert.equal(buttonClass({ tone, size }), `${TONE_CLASS[tone]}${sm}`)
      assert.equal(
        buttonClass({ tone, size, className: 'saveaction' }),
        `${TONE_CLASS[tone]}${sm} saveaction`,
      )
    }
  }
})

test('the defaults are a primary, medium button', () => {
  assert.equal(buttonClass(), 'button')
  assert.equal(buttonClass({}), 'button')
  assert.equal(buttonClass({ className: 'lore__create' }), 'button lore__create')
})

test('danger-quiet always carries secondary', () => {
  assert.match(TONE['danger-quiet'], /\bbutton--secondary\b/)
  assert.equal(
    buttonClass({ tone: 'danger-quiet', size: 'sm' }),
    'button button--secondary button--danger-quiet button--sm',
  )
})

test('an icon button is the iconbutton class plus the screen classes', () => {
  assert.deepEqual(Object.keys(ICON_SIZE), ['sm'])
  assert.equal(iconButtonClass(), 'iconbutton')
  assert.equal(iconButtonClass({ size: 'sm' }), 'iconbutton')
  assert.equal(iconButtonClass({ className: 'viewer__close' }), 'iconbutton viewer__close')
})

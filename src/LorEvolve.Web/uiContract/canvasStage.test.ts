// Run with `node --test uiContract/canvasStage.test.ts` (Node 22.18+ strips the types itself).
//
// Keeps the pan and zoom canvases on their shared parts (#456): the stage, its layer, zoom group and hint are
// `CanvasStage`, a pressable line is `CanvasLine` (both in `components/CanvasStage.tsx`), and a card's drag is
// `itemDrag` in `lib/canvasDrag.ts`. The stage keys (arrows pan, plus and minus zoom, 0 fits) are `panZoomKey` and a
// card's arrow step `arrowMove`, both in `lib/canvasKeys.ts`, for both canvases and the map viewer (B3b). The lists
// below only shrink, and a stale entry fails. Catalogue: docs/design/ui-components.md.

import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { itemDrag, type Drop } from '../src/lib/canvasDrag.ts'
import { classStrings, read, stripComments, tsxFiles, webRoot } from './support.ts'

function drag(place: (x: number, y: number) => { x: number; y: number } | null) {
  const dropAt: { current: Drop | null } = { current: null }
  const dragging: (Drop | null)[] = []
  const dropped: [number, number][] = []
  let pressed = 0
  const handlers = itemDrag({
    id: 'a',
    x: 10,
    y: 20,
    scale: 2,
    dropAt,
    setDragging: (drop) => dragging.push(drop),
    place,
    onDrop: (x, y) => dropped.push([x, y]),
    onPress: () => pressed++,
  })
  return { handlers, dropAt, dragging, dropped, pressed: () => pressed }
}

const free = (x: number, y: number) => ({ x, y })
const blocked = () => null

test('a move sets the drop and the dragging state through place, in canvas units', () => {
  const seen: [number, number][] = []
  const run = drag((x, y) => (seen.push([x, y]), { x: Math.round(x), y: Math.round(y) }))
  run.handlers.onMove(0, 0, 31, 41)
  assert.deepEqual(seen, [[25.5, 40.5]])
  assert.deepEqual(run.dropAt.current, { id: 'a', x: 26, y: 41 })
  assert.deepEqual(run.dragging, [{ id: 'a', x: 26, y: 41 }])
})

test('a place that returns null leaves the drop and the dragging state untouched', () => {
  const run = drag(blocked)
  run.handlers.onMove(0, 0, 30, 40)
  assert.equal(run.dropAt.current, null)
  assert.deepEqual(run.dragging, [])
})

test('a release after a move clears both, then drops at the last place, not a press', () => {
  const run = drag(free)
  run.handlers.onMove(0, 0, 10, 10)
  run.handlers.onMove(0, 0, 30, 40)
  run.handlers.onEnd(true, 0, 0)
  assert.equal(run.dropAt.current, null)
  assert.equal(run.dragging.at(-1), null)
  assert.deepEqual(run.dropped, [[25, 40]])
  assert.equal(run.pressed(), 0)
})

test('a release after a move that place blocked throughout neither drops nor presses', () => {
  const run = drag(blocked)
  run.handlers.onMove(0, 0, 30, 40)
  run.handlers.onEnd(true, 0, 0)
  assert.equal(run.dropAt.current, null)
  assert.deepEqual(run.dragging, [null])
  assert.deepEqual(run.dropped, [])
  assert.equal(run.pressed(), 0)
})

test('a release without a move clears both and presses, not a drop', () => {
  const run = drag(free)
  run.handlers.onEnd(false, 0, 0)
  assert.equal(run.dropAt.current, null)
  assert.deepEqual(run.dragging, [null])
  assert.deepEqual(run.dropped, [])
  assert.equal(run.pressed(), 1)
})

test('a cancel clears both and neither drops nor presses', () => {
  const run = drag(free)
  run.handlers.onMove(0, 0, 30, 40)
  run.handlers.onCancel!()
  assert.equal(run.dropAt.current, null)
  assert.equal(run.dragging.at(-1), null)
  assert.deepEqual(run.dropped, [])
  assert.equal(run.pressed(), 0)
})

// Every `.ts` and `.tsx` under `src/`: a card drag can be written in a plain `.ts` (machineCanvasActions.ts).
const sourceFiles = readdirSync(join(webRoot, 'src'), { recursive: true, encoding: 'utf8' })
  .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
  .map((file) => 'src/' + file.replaceAll('\\', '/'))
  .sort()

const tokens = (source: string) =>
  classStrings(source).flatMap((value) =>
    value.replaceAll('\u0001', ' \u0001').split(/\s+/).filter(Boolean),
  )
const STAGE = [
  'boardcanvas',
  'boardcanvas__stage',
  'boardcanvas__layer',
  'boardline',
  'boardline__hit',
]
const drawsStage = (source: string) => tokens(source).some((token) => STAGE.includes(token))
const drawsStroke = (source: string) => tokens(source).includes('boardline__stroke')
const drawsBoardZoom = (source: string) => /look="board"/.test(source)
const writesDrop = (source: string) => /dropAt\.current = \{/.test(stripComments(source))
const namesStep = (source: string) => /\b(PAN_STEP|MOVE_STEP|BIG_MOVE_STEP)\b/.test(source)
const zoomsByStep = (source: string) => /zoomAbout\((1 \/ )?ZOOM_STEP\b/.test(source)

function only(found: string[], allowed: string[], say: string) {
  assert.deepEqual(
    found.filter((file) => !allowed.includes(file)),
    [],
    say,
  )
  assert.deepEqual(
    allowed.filter((file) => !found.includes(file)),
    [],
    'stale allowlist entry: remove it',
  )
}

const c = (file: string) => `src/components/${file}.tsx`

test('the guards catch a hand-written stage, line, zoom group and drag', () => {
  assert.ok(drawsStage('<div className="boardcanvas" data-connecting={connecting}>'))
  assert.ok(drawsStage('<g className="boardline" data-selected={isSelected || undefined}>'))
  assert.ok(drawsStage("<line className={'boardline__hit'} />"))
  assert.ok(!drawsStage('<svg className="boardcanvas__lines" width="1" height="1">'))
  assert.ok(drawsStroke('<line className="boardline__stroke" x1={a} />'))
  assert.ok(drawsBoardZoom('<ZoomControls look="board" zoomAbout={zoomAbout} />'))
  assert.ok(writesDrop('dropAt.current = { id: card.id, x, y }'))
  assert.ok(!writesDrop('dropAt.current = null'))
  assert.ok(namesStep('const PAN_STEP = 48'))
  assert.ok(namesStep('const step = event.shiftKey ? BIG_MOVE_STEP : MOVE_STEP'))
  assert.ok(!namesStep('const PAN_STEPS = 2'))
  assert.ok(zoomsByStep('zoomAbout(ZOOM_STEP, about.x, about.y)'))
  assert.ok(zoomsByStep('zoomAbout(1 / ZOOM_STEP, about.x, about.y)'))
  assert.ok(!zoomsByStep('zoomAbout(scale, x, y)'))
})

test('the stage keys and the arrow step are panZoomKey and arrowMove', () => {
  const keyFiles = [
    'src/ideas/boardCanvasKeys.ts',
    'src/maps/mapViewerActions.ts',
    'src/worldLogic/machineCanvasActions.ts',
  ]
  only(
    sourceFiles.filter((file) => namesStep(read(file))),
    keyFiles,
    'use panZoomKey and arrowMove (lib/canvasKeys.ts)',
  )
  only(
    sourceFiles.filter((file) => zoomsByStep(read(file))),
    [c('ZoomControls'), ...keyFiles],
    'use panZoomKey (lib/canvasKeys.ts); the zoom buttons are ZoomControls',
  )
})

test('the stage, its lines, its zoom group and the card drag are the shared parts', () => {
  only(
    tsxFiles.filter((file) => drawsStage(read(file))),
    [c('CanvasStage')],
    'use CanvasStage and CanvasLine',
  )
  only(
    tsxFiles.filter((file) => drawsStroke(read(file))),
    [c('CanvasStage'), c('worldLogic/MachineLines')],
    'use CanvasLine (the dashed pending line in MachineLines is the one stroke of its own)',
  )
  only(
    tsxFiles.filter((file) => drawsBoardZoom(read(file))),
    [c('CanvasStage')],
    'use CanvasStage',
  )
  only(
    sourceFiles.filter((file) => writesDrop(read(file))),
    ['src/lib/canvasDrag.ts'],
    'drag a card with itemDrag (lib/canvasDrag.ts)',
  )
})

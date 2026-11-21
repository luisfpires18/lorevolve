// Run with `node --test uiContract/readGates.test.ts` (Node 22.18+ strips the types itself).
//
// Keeps a read's loading and failed lines on ReadGate (#456): a file that imports both LoadingNote and LoadError
// draws the ladder between them by hand. No file does (I44 moved the last ones), and none may. A Game Entities
// screen's game read and its gate are GameGate's (projects/gameGate.tsx), so no page rebuilds them by hand.
// Catalogue: docs/design/ui-components.md.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { read, tsxFiles } from './support.ts'

// The names one file imports, from every `import ... from` statement, renames and line breaks included.
const imported = (source: string) =>
  [...source.matchAll(/import\s+(?:type\s+)?([^;]*?)\s+from\s/g)].flatMap((m) =>
    m[1]
      .replace(/[{}]/g, ',')
      .split(',')
      .map((name) =>
        name
          .trim()
          .split(/\s+as\s+/)[0]
          .trim(),
      )
      .filter(Boolean),
  )

const handLadder = (source: string) => {
  const names = imported(source)
  return names.includes('LoadingNote') && names.includes('LoadError')
}

test('the read gate guard catches a file importing both parts, however the imports are written', () => {
  assert.ok(
    handLadder(
      "import { LoadError } from './LoadError'\nimport { LoadingNote } from './LoadingNote'",
    ),
  )
  assert.ok(handLadder("import {\n  LoadError,\n  LoadingNote as Wait,\n} from './states'"))
  assert.ok(
    handLadder(
      "import { LoadError as Failed } from '../LoadError'\nimport { LoadingNote } from '../LoadingNote'",
    ),
  )
  assert.ok(
    !handLadder("import { LoadError } from './LoadError'\nimport { ReadGate } from './ReadGate'"),
  )
  assert.ok(
    !handLadder("import { LoadingNoteText } from './x'\nimport { LoadError } from './LoadError'"),
  )
  assert.ok(
    !handLadder(
      "// LoadingNote and LoadError are its pieces\nimport { ReadGate } from './ReadGate'",
    ),
  )
})

test('a read with loading and failed states is drawn by ReadGate', () => {
  assert.deepEqual(
    tsxFiles.filter((file) => file !== 'src/components/ReadGate.tsx' && handLadder(read(file))),
    [],
    'use <ReadGate> from components/ReadGate',
  )
})

test('a Game Entities screen reads its game through GameGate', () => {
  assert.deepEqual(
    tsxFiles.filter((file) => /\buseGameProject\(/.test(read(file))),
    ['src/projects/gameGate.tsx'],
    'wrap the screen in <GameGate> from projects/gameGate',
  )
})

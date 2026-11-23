// Run with `node --test uiContract/placeholders.test.ts` (Node 22.18+ strips the types itself).
//
// Keeps placeholders off the workspace's inputs (#567, owner rule 2026-11-22: "Avoid placeholders on inputs"). A field
// with a visible label, or a visible heading that names it, shows no placeholder: the label names the field. The
// allow-list below holds the fields where the placeholder is the only visible name or prompt; each carries its reason.
// The counts are exact, so a new use fails and a stale entry fails. The list only shrinks. Catalogue and rule:
// docs/design/ui-components.md and docs/design/PRODUCT_VOICE.md.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { read, tsxFiles } from './support.ts'

// A JSX attribute (`placeholder={...}`, `notePlaceholder="..."`) or an object key that carries a placeholder
// (`namePlaceholder: ...`) handed on to a field. `aria-placeholder` is not one: it is an attribute of the rich text writer.
const PASSES = /(?<![\w-])[A-Za-z]*[pP]laceholder\s*=\s*[{"']|\b[A-Za-z]*Placeholder\??\s*:/g

const passes = (source: string) => source.match(PASSES)?.length ?? 0

// The portal is out of this rule; its search box is its own.
const PORTAL =
  /^src\/components\/portal\/|^src\/components\/PortalSearch\.tsx$|\/Public[A-Z]\w*\.tsx$/

// File -> [uses, reason]. A use is one prop or key that passes a placeholder.
const KEPT = new Map<string, [number, string]>([
  [
    'src/components/lore/EntryHeader.tsx',
    [
      2,
      'entry name and summary in edit mode: aria-label only; "Name this" is the visible prompt of the document',
    ],
  ],
  [
    'src/components/lore/LoreControls.tsx',
    [1, 'the Lore filter box: hideLabel search, the text is its only name on screen'],
  ],
  [
    'src/components/UniverseSearch.tsx',
    [1, 'the header search: a visually hidden label, the text is its only name on screen'],
  ],
  [
    'src/components/stories/ManuscriptBody.tsx',
    [1, 'the scene writer: aria-label only; the text also says "Type @ to mention Lore"'],
  ],
  [
    'src/components/projectEntities/ScriptPartFields.tsx',
    [1, 'the script writer: aria-label only; the text also says "Type @ to mention Lore"'],
  ],
  [
    'src/components/stories/SceneFormFields.tsx',
    [
      2,
      'beat title and note rows: hideLabel fields, the text is the only visible name of each row',
    ],
  ],
  ['src/components/worldLogic/Operand.tsx', [1, 'guard slot: aria-label only, no visible label']],
  ['src/components/worldLogic/Related.tsx', [1, 'guard slot: aria-label only, no visible label']],
  [
    'src/components/worldLogic/TypedValue.tsx',
    [3, 'guard slots: aria-label only, no visible label'],
  ],
  [
    'src/components/ComicPageEditor.tsx',
    [1, 'not a field: the empty picture slot handed to FieldImageInput'],
  ],
  [
    'src/components/FieldImageInput.tsx',
    [1, 'not a field: the empty picture slot handed to FieldImageRow'],
  ],
])

test('the placeholder guard catches a prop, a literal and a words key, and spares the rest', () => {
  assert.equal(passes('<Field label="Name" placeholder={t("x")} />'), 1)
  assert.equal(passes('<input placeholder="Search" />'), 1)
  assert.equal(passes('<NameNoteFields notePlaceholder={t("x")} placeholder={t("y")} />'), 2)
  assert.equal(passes('words={{ namePlaceholder: t("x"), inversePlaceholder: t("y") }}'), 2)
  assert.equal(passes("attributes: { 'aria-placeholder': text }"), 0)
  assert.equal(passes('<div data-testid="comic-art-placeholder-1" />'), 0)
  assert.equal(passes('const placeholder = <span />'), 0)
  assert.equal(passes('<Field label="Name" hint={t("x")} />'), 0)
})

test('a workspace field shows no placeholder outside the kept cases', () => {
  const found = new Map<string, number>()
  for (const file of tsxFiles) {
    if (PORTAL.test(file)) continue
    const uses = passes(read(file))
    if (uses > 0) found.set(file, uses)
  }
  const expected = new Map([...KEPT].map(([file, [uses]]) => [file, uses]))
  assert.deepEqual(
    Object.fromEntries([...found].sort()),
    Object.fromEntries([...expected].sort()),
    'a labelled field has no placeholder: remove it, or keep it here with its reason (only a field with no visible label)',
  )
})

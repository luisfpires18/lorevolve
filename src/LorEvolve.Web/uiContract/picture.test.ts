// Run with `node --test uiContract/picture.test.ts` (Node 22.18+ strips the types itself).
//
// Keeps the picture controls on their shared parts (#456): PictureActions draws the file input, the pick
// label, Reframe and Remove; usePictureFraming holds the busy flag, the picker, the framing and the object
// URLs. Each list below only shrinks, and a stale entry fails. Catalogue: docs/design/ui-components.md.

import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { read, webRoot } from './support.ts'

const codeFiles = readdirSync(join(webRoot, 'src'), { recursive: true, encoding: 'utf8' })
  .filter((file) => /\.tsx?$/.test(file) && !file.endsWith('.d.ts') && !file.includes('.test.'))
  .map((file) => 'src/' + file.replaceAll('\\', '/'))
  .sort()

const filesWhere = (check: (source: string) => boolean) =>
  codeFiles.filter((file) => check(read(file)))

function onlyAllowed(found: string[], allowed: Map<string, string>) {
  const names = [...allowed.keys()]
  assert.deepEqual(
    found.filter((file) => !names.includes(file)),
    [],
    'New offender: use PictureActions and usePictureFraming, see docs/design/ui-components.md',
  )
  assert.deepEqual(
    names.filter((file) => !found.includes(file)),
    [],
    'No longer an exception: remove it from the list',
  )
}

// The file filter of a picture input. `MAP_IMAGE_ACCEPT` is another name and does not count.
const readsImageAccept = (source: string) => /(?<![\w$])IMAGE_ACCEPT\b/.test(source)
// The cropper dialog, imported by name. CroppedPicture and the SaveStage type are other jobs.
const importsCropDialog = (source: string) =>
  /import\s*(?:type\s*)?\{[^}]*\bImageCropDialog\b[^}]*\}\s*from/.test(source)
// The classes of a hand-built pick control, anywhere in the raw text: a class string, a template or an
// option. Not read through string literals, where an apostrophe in a comment pairs the wrong quotes.
const writesPickClass = (source: string) => /\b(imagefield|avatar)__(input|pick)\b/.test(source)
// A cropper opened on a stored picture's original (#456 A3): the reframe of an Image field and of an entry's picture
// is `fieldImageActions`'s, not a copy in the input.
const setsStoredFraming = (source: string) => /setFraming\(\{\s*kind: 'stored'/.test(source)

const IMAGE_ACCEPT_READERS = new Map<string, string>([
  ['src/components/PictureActions.tsx', 'the component'],
  ['src/lib/imageCrop.ts', 'where it is defined'],
  ['src/maps/api.ts', 're-exported as MAP_IMAGE_ACCEPT for the map picture, which is not cropped'],
  [
    'src/components/lore/AppearanceGallery.tsx',
    'adds several pictures at once, no crop, no Reframe',
  ],
])

const CROP_DIALOG_IMPORTERS = new Map<string, string>([
  [
    'src/components/EntityImageField.tsx',
    'the cropper sits outside the actions row, which PictureActions draws',
  ],
  [
    'src/components/FieldImageInput.tsx',
    'the cropper sits outside the actions row, which PictureActions draws',
  ],
  [
    'src/components/UniverseArtworkField.tsx',
    'the cropper sits outside the actions row, which PictureActions draws',
  ],
  [
    'src/components/ProfileAvatar.tsx',
    'the cropper sits outside the actions row, which PictureActions draws',
  ],
])

const STORED_FRAMING_SETTERS = new Map<string, string>([
  ['src/lore/fieldImageActions.ts', "an Image field's and an entry's picture"],
  ['src/components/ProfileAvatar.tsx', 'the profile picture: its own route and words'],
  ['src/components/UniverseArtworkField.tsx', "a universe's artwork: its own route and words"],
])

const PICK_CLASS_WRITERS = new Map<string, string>([
  ['src/components/PictureActions.tsx', 'the component'],
  [
    'src/components/lore/AppearanceGallery.tsx',
    'adds several pictures at once: small button, aria-disabled',
  ],
])

test('the guards fail on a bad snippet', () => {
  assert.equal(readsImageAccept('accept={IMAGE_ACCEPT}'), true)
  assert.equal(readsImageAccept("import { IMAGE_ACCEPT as X } from '../lib/imageCrop'"), true)
  assert.equal(readsImageAccept('accept={MAP_IMAGE_ACCEPT}'), false)
  assert.equal(
    importsCropDialog("import { CroppedPicture, ImageCropDialog } from './ImageCropDialog'"),
    true,
  )
  assert.equal(
    importsCropDialog("import { ImageCropDialog, type SaveStage } from './ImageCropDialog'"),
    true,
  )
  assert.equal(importsCropDialog("import type { SaveStage } from './ImageCropDialog'"), false)
  assert.equal(importsCropDialog("import { CroppedPicture } from './ImageCropDialog'"), false)
  assert.equal(writesPickClass('<input className="imagefield__input" />'), true)
  assert.equal(writesPickClass("buttonClass({ className: 'avatar__pick' })"), true)
  assert.equal(writesPickClass('<label className={`btn avatar__pick ${x}`}>'), true)
  assert.equal(writesPickClass('<label className={`avatar__input${x}`}>'), true)
  assert.equal(
    writesPickClass(`// the browser's own copy
<input className="avatar__input" />`),
    true,
  )
  assert.equal(writesPickClass('<div className="avatar__photo">'), false)
  assert.equal(writesPickClass('<div className="imagefield__preview">'), false)
  assert.equal(
    setsStoredFraming(`setFraming({
  kind: 'stored',
  image,`),
    true,
  )
  assert.equal(setsStoredFraming("setFraming({ kind: 'file', file, source })"), false)
})

test('IMAGE_ACCEPT is read by PictureActions and the listed files only', () => {
  onlyAllowed(filesWhere(readsImageAccept), IMAGE_ACCEPT_READERS)
})

test('ImageCropDialog is imported by the listed files only', () => {
  onlyAllowed(filesWhere(importsCropDialog), CROP_DIALOG_IMPORTERS)
})

test('the picture input and pick classes are written by PictureActions and the listed files only', () => {
  onlyAllowed(filesWhere(writesPickClass), PICK_CLASS_WRITERS)
})

test('a stored picture is reframed by fieldImageActions or the listed files only', () => {
  onlyAllowed(filesWhere(setsStoredFraming), STORED_FRAMING_SETTERS)
})

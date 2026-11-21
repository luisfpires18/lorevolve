// Run with `node --test uiContract/revisions.test.ts` (Node 22.18+ strips the types itself).
//
// Keeps every record's history on Lore's parts (#456, I41): the manuscript's history is Lore's `ArticleHistory`, so no
// file writes the old `mshistory` classes, and a version is put back with its question asked in one place,
// `lore/useRevisionHistory.ts`, which an entry's, an article's, a manuscript's and a progression's history all use
// (#494). The list below only shrinks: a stale entry fails. Catalogue: docs/design/ui-components.md.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { classStrings, read, webRoot } from './support.ts'

const sourceFiles = readdirSync(join(webRoot, 'src'), { recursive: true, encoding: 'utf8' })
  .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
  .map((file) => 'src/' + file.replaceAll('\\', '/'))
  .sort()

// A class string that names an `mshistory` class, however it is built.
const writesOldHistory = (source: string) =>
  classStrings(source).some((value) => /(^|\s)mshistory/.test(value.replaceAll('\u0001', ' ')))

// A file that asks a confirm question and puts a saved version back.
const asksRestore = (source: string) =>
  /\bconfirmAction\s*\(/.test(source) && /\brestore\w*Revision\b|\.restore\s*\(/.test(source)

const RESTORE_ASKERS = ['src/lore/useRevisionHistory.ts']

test('the history guard catches an mshistory class, however it is written', () => {
  assert.ok(writesOldHistory('<section className="mshistory">'))
  assert.ok(writesOldHistory("<p className={'mshistory__title'}>"))
  assert.ok(writesOldHistory('<p className={`mshistory__${part}`}>'))
  assert.ok(writesOldHistory('<p className={`version ${open ? `mshistory__open` : ""}`}>'))
  assert.ok(writesOldHistory("<div className={['prose', 'mshistory__text'].join(' ')}>"))
  assert.ok(writesOldHistory('<p triggerClassName="quiet mshistory__done">'))
  assert.ok(!writesOldHistory('<ol className="history__list">'))
  assert.ok(!writesOldHistory('// the old mshistory rules are gone\n<p className="version__what">'))
  assert.ok(!writesOldHistory('<p className={`${kind}history__quiet`}>'))
})

test('no file writes an mshistory class', () => {
  assert.deepEqual(
    sourceFiles.filter((file) => writesOldHistory(read(file))),
    [],
    'use lore/ArticleHistory and its history and version classes',
  )
})

test('the restore guard catches a confirm question beside a version put back', () => {
  assert.ok(asksRestore('await confirmAction({ title })\nawait restoreArticleRevision(u, e, r, v)'))
  assert.ok(
    asksRestore('if (!(await confirmAction(words))) return\nawait store.restore(id, version)'),
  )
  assert.ok(asksRestore('confirmAction ( q ); restoreManuscriptRevision(a, b, c, d, e)'))
  assert.ok(!asksRestore('await confirmAction({ title })\nawait restoreFromTrash(id)'))
  assert.ok(!asksRestore('await store.restore(id, version)'))
  assert.ok(!asksRestore('await restoreArticleRevision(u, e, r, v)'))
})

test('a version is put back with its question asked only in useRevisionHistory', () => {
  assert.deepEqual(
    sourceFiles.filter((file) => asksRestore(read(file))),
    RESTORE_ASKERS,
    'ask through lore/useRevisionHistory; a stale allowlist entry: remove it',
  )
})

import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { EditorNotices } from '../EditorNotices'
import { EmptyState } from '../EmptyState'
import { Quoted } from '../NameList'
import { ReadGate } from '../ReadGate'
import { t, tx, useI18n } from '../../i18n'
import type { TextKey } from '../../i18n/core'
import type { Dictionary } from '../../i18n/en'
import type { Load } from '../../lib/useAsyncRead'
import { wordKey } from '../../ideas/recordKind'
import type { RecoveredDraftProps } from '../RecoveredDraft'
import { SaveBar } from '../SaveAction'

/**
 * What an idea's or a board's editor shows instead of the record: loading, missing, in another universe, or failed to
 * open. `words` is the record's keys (`ideas.editor`, `ideas.board`); `elsewhere` holds the link words of the other
 * universe's hint (`open`, and `back` where the hint has one). Catalogue: `docs/design/ui-components.md`.
 */
export function RecordUnavailable({
  load,
  testIdPrefix: id,
  words: w,
  listPath,
  contextUniverse,
  elsewhere,
  reread,
}: {
  load: Load<null> | { kind: 'elsewhere' }
  testIdPrefix: string
  words: 'ideas.editor' | 'ideas.board'
  listPath: string
  contextUniverse: { id: string; name: string } | null
  elsewhere: { open: ReactNode; back?: ReactNode }
  reread: () => void
}) {
  useI18n() // Re-renders on a language change; the words are read through the module's t.
  const key = (name: string) => `${w}.${name}` as TextKey<Dictionary>

  return (
    <ReadGate
      load={load}
      loading={{ text: t(key('loading')), testId: `${id}-loading` }}
      error={{ onRetry: reread, retryLabel: t(key('retry')), testId: `${id}-load-error` }}
      missing={
        <EmptyState
          testId={`${id}-missing`}
          title={t(key('missing.title'))}
          hint={tx(key('missing.hint'), {
            link: <Link to={`${listPath}?view=deleted`}>{t(key('missing.link'))}</Link>,
          })}
        />
      }
      elsewhere={
        <EmptyState
          testId={`${id}-not-in-universe`}
          title={tx(key('elsewhere.title'), {
            universe: <Quoted text={contextUniverse?.name ?? ''} />,
          })}
          hint={tx(key('elsewhere.hint'), {
            open: <Link to={listPath}>{elsewhere.open}</Link>,
            ...(elsewhere.back !== undefined
              ? { back: <Link to={listPath}>{elsewhere.back}</Link> }
              : {}),
          })}
        />
      }
    >
      {() => null}
    </ReadGate>
  )
}

/**
 * The notices above an idea's or a board's editor, in `EditorNotices`: the recovery copy offered with its preview
 * (the title, then `preview(copy)`: the idea's body, the board's counts), the stale-save choice and why a save failed.
 * `editor` is the editor hook's result, passed whole; `words` and `testId` as for `RecordUnavailable`.
 */
export function RecordNotices<C extends { title: string }>({
  words,
  testId,
  recoveryId,
  editor,
  preview,
}: {
  words: 'ideas.editor' | 'ideas.board'
  testId: string
  recoveryId: string
  editor: {
    isNew: boolean
    offer: RecoveredDraftProps['draft'] | null
    copy: C | null
    stored: { updatedAt: string | null }
    conflict: { updatedAt: string | null } | null
    save: (expectedUpdatedAt: string | null) => Promise<void>
    loadSavedVersion: () => Promise<void> | void
    recoverDraft: () => void
    discardDraft: () => void
    isSaving: boolean
    failure: string | null
  }
  preview: (copy: C) => ReactNode
}) {
  useI18n() // Re-renders on a language change; the words are read through the module's t.
  const key = (name: string) => wordKey(words, name)
  const { conflict } = editor

  return (
    <EditorNotices
      testId={testId}
      recoveryId={recoveryId}
      recovery={
        editor.offer && editor.copy
          ? {
              what: editor.isNew ? t(key('recoveryNew')) : t(key('recoveryThis')),
              draft: editor.offer,
              savedUpdatedAt: editor.stored.updatedAt,
              preview: (
                <div
                  className="recovery__prose idea__preview prose"
                  role="region"
                  aria-label={t(key('recoveredDraft'))}
                  tabIndex={0}
                >
                  <p className="idea__previewtitle">{editor.copy.title || t(key('untitled'))}</p>
                  {preview(editor.copy)}
                </div>
              ),
              onRecover: editor.recoverDraft,
              onDiscard: editor.discardDraft,
            }
          : null
      }
      conflict={
        conflict
          ? {
              text: t(key('conflict.text')),
              onKeepMine: () => void editor.save(conflict.updatedAt),
              keepLabel: t(key('conflict.keepMine')),
              onLoadSaved: () => void editor.loadSavedVersion(),
              loadLabel: t(key('conflict.loadSaved')),
              busy: editor.isSaving,
            }
          : null
      }
      failure={editor.failure}
      failureClassName="idea__failure"
    />
  )
}

/**
 * The save bar of an idea's or a board's editor, in `SaveBar record keyShortcuts`. With `onSave` Save is a button
 * outside a form (the board); without it Save submits the form it is in (the idea).
 */
export function RecordSaveBar({
  words,
  testId,
  statusId,
  editor,
  onSave,
}: {
  words: 'ideas.editor' | 'ideas.board'
  testId: string
  statusId: string
  editor: {
    isNew: boolean
    failed: boolean
    isDirty: boolean
    isSaving: boolean
    isTooLong?: boolean
    isHeld: boolean
    saves: number
    stored: { updatedAt: string | null }
  }
  onSave?: () => void
}) {
  useI18n() // Re-renders on a language change; the words are read through the module's t.
  const key = (name: string) => wordKey(words, name)

  return (
    <SaveBar
      record
      keyShortcuts
      warning={
        editor.failed && editor.isDirty
          ? { text: t(key('recoveryWarning')), testId: `${testId}-recovery-warning` }
          : null
      }
      save={{
        label: editor.isNew ? t(key('create')) : t(key('save')),
        isDirty: editor.isDirty,
        isSaving: editor.isSaving,
        isBlocked: editor.isTooLong || editor.isHeld,
        saves: editor.saves,
        restingStatus: editor.stored.updatedAt === null ? t(key('notSavedYet')) : t(key('saved')),
        statusId,
        statusTestId: `${testId}-status`,
        testId: `${testId}-save`,
        ...(onSave ? { type: 'button' as const, onSave } : {}),
      }}
    />
  )
}

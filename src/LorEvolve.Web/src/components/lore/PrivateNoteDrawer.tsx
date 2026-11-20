import { QuietNote } from '../QuietNote'
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { SaveAction } from '../SaveAction'
import { ApiError } from '../../lib/api'
import { formatDateTime } from '../../lib/dates'
import { Drawer } from '../Drawer'
import { isChangedElsewhere } from '../../lib/editConflict'
import { useReturnFocus } from '../../lib/returnFocus'
import {
  getPrivateNote,
  PRIVATE_NOTE_CHANGED,
  PRIVATE_NOTE_MAX_LENGTH,
  savePrivateNote,
  type PrivateNote,
} from '../../lore/privateNote'
import { useI18n } from '../../i18n'
import { Field } from '../Field'
import type { PrivateNotesProps } from '../PrivateNotes'
import { PrivateNoteConflict } from './PrivateNoteConflict'
import { FormActions } from '../FormActions'
import { LoadError } from '../LoadError'
import { LoadingNote } from '../LoadingNote'

interface DrawerProps extends PrivateNotesProps {
  onClose: () => void
}

type LoadState = 'loading' | 'ready' | 'error'

export function PrivateNoteDrawer({ universeId, entityId, entryName, onClose }: DrawerProps) {
  const { t } = useI18n()
  const editor = useRef<HTMLTextAreaElement>(null)
  const headingId = useId()
  const textId = useId()
  const hintId = useId()
  const statusId = useId()

  const [load, setLoad] = useState<LoadState>('loading')
  const [reads, setReads] = useState(0)
  const [stored, setStored] = useState<PrivateNote>({
    entityId,
    content: '',
    updatedAt: null,
    version: 0,
  })
  const [draft, setDraft] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [saves, setSaves] = useState(0)
  const [failure, setFailure] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const inFlight = useRef(false)

  const isReady = load === 'ready'
  const isDirty = isReady && draft !== stored.content
  const isTooLong = draft.length > PRIVATE_NOTE_MAX_LENGTH

  useReturnFocus()

  useEffect(() => {
    const controller = new AbortController()

    getPrivateNote(universeId, entityId, controller.signal)
      .then((note) => {
        setStored(note)
        setDraft(note.content)
        setLoad('ready')
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoad('error')
      })

    return () => controller.abort()
  }, [universeId, entityId, reads])

  function reread() {
    setConflict(false)
    setFailure(null)
    setLoad('loading')
    setReads((current) => current + 1)
  }

  async function save() {
    if (inFlight.current || !isDirty || isTooLong) return

    const content = draft
    inFlight.current = true
    setIsSaving(true)
    setFailure(null)
    setConflict(false)

    try {
      const saved = await savePrivateNote(universeId, entityId, {
        content,
        expectedVersion: stored.version,
      })
      // Measured against what was sent, so anything typed while the save was in flight is still unsaved.
      setStored(saved)
      setSaves((current) => current + 1)
    } catch (error: unknown) {
      if (isChangedElsewhere(error, PRIVATE_NOTE_CHANGED)) {
        setConflict(true)
      } else if (error instanceof ApiError && error.status === 404) {
        setFailure(t('entity.privateNote.gone'))
      } else if (error instanceof ApiError && error.status === 400) {
        setFailure(error.message)
      } else {
        setFailure(t('entity.privateNote.saveFailed'))
      }
    } finally {
      inFlight.current = false
      setIsSaving(false)
    }
  }

  /** Ctrl+S / Cmd+S saves from anywhere in the drawer, and never opens the browser's "Save page". */
  function onKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 's') {
      event.preventDefault()
      void save()
    }
  }

  /** The owner has seen the latest note and keeps their own: still unsaved, now measured against the latest. */
  function keepMine(latest: PrivateNote) {
    setStored(latest)
    setConflict(false)
    requestAnimationFrame(() => editor.current?.focus())
  }

  const describedBy = [hintId, statusId].filter(Boolean).join(' ')

  return (
    <Drawer
      testId="private-note-drawer"
      titleId={headingId}
      eyebrow={t('entity.privateNote.eyebrow')}
      title={<bdi>{entryName}</bdi>}
      context={
        <QuietNote size="ui" wrap className="drawer__context" id={hintId}>
          {t('entity.privateNote.privacy')}
        </QuietNote>
      }
      isDirty={isDirty}
      leaveMessage={t('entity.privateNote.discardGuard')}
      onClose={onClose}
      actions={(close) => (
        <FormActions onCancel={close} dismiss="close" cancelTestId="private-note-close" />
      )}
    >
      {load === 'loading' ? (
        <LoadingNote testId="private-note-loading">{t('entity.privateNote.opening')}</LoadingNote>
      ) : null}

      {load === 'error' ? (
        <LoadError
          message={t('entity.privateNote.openFailed')}
          onRetry={reread}
          retryLabel={t('entity.privateNote.retry')}
          testId="private-note-load-error"
        />
      ) : null}

      {isReady ? (
        <form
          className="reviewform privatenote"
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
          onKeyDown={onKeyDown}
        >
          {conflict ? (
            <PrivateNoteConflict
              universeId={universeId}
              entityId={entityId}
              keepMine={keepMine}
              reread={reread}
            />
          ) : null}

          {failure ? (
            <p className="form__message" role="alert" data-testid="private-note-error">
              {failure}
            </p>
          ) : null}

          <Field
            as="textarea"
            label={t('entity.privateNote.field')}
            id={textId}
            ref={editor}
            controlClassName="privatenote__text"
            rows={12}
            dir="auto"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={t('entity.privateNote.placeholder')}
            spellCheck
            aria-describedby={describedBy}
            aria-keyshortcuts="Control+S Meta+S"
            data-testid="private-note-text"
            count={{
              used: draft.length,
              max: PRIVATE_NOTE_MAX_LENGTH,
              show: 'over',
              words: { tooLong: 'entity.privateNote.tooLong' },
              testId: 'private-note-too-long',
            }}
          />

          <div className="privatenote__bar">
            <SaveAction
              label={t('entity.privateNote.save')}
              isDirty={isDirty}
              isSaving={isSaving}
              isBlocked={isTooLong}
              saves={saves}
              restingStatus={
                stored.updatedAt === null
                  ? t('entity.privateNote.nothingSaved')
                  : t('entity.privateNote.savedAt', { when: formatDateTime(stored.updatedAt) })
              }
              statusId={statusId}
              statusTestId="private-note-status"
              testId="private-note-save"
              keyShortcuts="Control+S Meta+S"
            />
          </div>
        </form>
      ) : null}
    </Drawer>
  )
}

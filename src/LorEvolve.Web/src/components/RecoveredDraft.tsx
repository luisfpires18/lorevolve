import { useId, useState, type ReactNode } from 'react'
import { formatDateTime } from '../lib/dates'
import type { LocalDraft } from '../lib/localDrafts'
import { sameSave } from '../lib/useLocalDraft'
import { confirmAction } from '../lib/confirm'
import { useI18n } from '../i18n'

interface RecoveredDraftProps {
  /** What the copy is of, as it reads in a sentence: "this article", "this scene's manuscript". */
  what: string
  draft: LocalDraft

  /** The `updatedAt` of what is saved now, to say plainly whether it has been saved since the copy was made. */
  savedUpdatedAt: string | null

  /** The copy, drawn read-only, for the author to look at before choosing. */
  preview: ReactNode

  onRecover: () => void
  onDiscard: () => void
  testId: string
}

/**
 * The offer of a recovery copy: writing this device kept that was never saved.
 *
 * It never decides for the author. The saved text stays in place until they choose, the copy can be read first, and
 * recovering only puts it in the editor as unsaved changes - saving is still theirs to do. When the saved text has been
 * saved again since the copy was made, it says so, because a copy made later on this device is not therefore newer than
 * what was saved from another one.
 */
export function RecoveredDraft({
  what,
  draft,
  savedUpdatedAt,
  preview,
  onRecover,
  onDiscard,
  testId,
}: RecoveredDraftProps) {
  const { t, tx } = useI18n()
  const titleId = useId()
  const bodyId = useId()
  const previewId = useId()
  const [isShowing, setIsShowing] = useState(false)

  const savedSince = !sameSave(draft.baseUpdatedAt, savedUpdatedAt)

  async function discard() {
    if (
      await confirmAction({
        title: t('entity.recovered.confirm.title', { what }),
        message: t('entity.recovered.confirm.message'),
        confirmLabel: t('entity.recovered.confirm.confirm'),
        variant: 'destructive',
      })
    ) {
      onDiscard()
    }
  }

  return (
    <section
      className="recovery"
      aria-labelledby={titleId}
      data-testid={testId}
      data-saved-since={savedSince ? 'true' : 'false'}
    >
      <p className="recovery__title" id={titleId}>
        {t('entity.recovered.title')}
      </p>
      <div id={bodyId}>
        <p className="recovery__text">
          {tx('entity.recovered.kept', {
            what,
            time: <time dateTime={draft.savedAt}>{formatDateTime(draft.savedAt)}</time>,
          })}
        </p>
        {savedSince ? (
          <p className="recovery__text recovery__since" data-testid={`${testId}-saved-since`}>
            {savedUpdatedAt ? (
              <>
                {tx('entity.recovered.savedAgain', {
                  time: <time dateTime={savedUpdatedAt}>{formatDateTime(savedUpdatedAt)}</time>,
                })}
              </>
            ) : (
              <>{t('entity.recovered.savedChanged')}</>
            )}
          </p>
        ) : null}
        <p className="recovery__hint">{t('entity.recovered.hint')}</p>
      </div>

      <div className="recovery__actions">
        <button
          className="button button--secondary"
          type="button"
          onClick={onRecover}
          aria-describedby={bodyId}
          data-testid={`${testId}-recover`}
        >
          {t('entity.recovered.recover')}
        </button>
        <button
          className="button button--secondary"
          type="button"
          onClick={discard}
          aria-describedby={bodyId}
          data-testid={`${testId}-discard`}
        >
          {t('entity.recovered.discard')}
        </button>
        <button
          className="button button--secondary"
          type="button"
          aria-expanded={isShowing}
          aria-controls={previewId}
          onClick={() => setIsShowing((showing) => !showing)}
          data-testid={`${testId}-preview-toggle`}
        >
          {isShowing ? t('entity.recovered.hide') : t('entity.recovered.show')}
        </button>
      </div>

      {isShowing ? (
        <div className="recovery__preview" id={previewId} data-testid={`${testId}-preview`}>
          {preview}
        </div>
      ) : null}
    </section>
  )
}

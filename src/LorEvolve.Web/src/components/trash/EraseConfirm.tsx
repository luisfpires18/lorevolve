import type { ReactNode } from 'react'
import { t, tx, useI18n } from '../../i18n'
import { Quoted } from '../NameList'
import { TRASH_KIND_LABELS, type TrashItem } from '../../trash/types'
import { eraseText } from '../../trash/trashText'

/**
 * The one question before something is erased for good: what it is, what goes with it, and that it cannot be undone. One
 * deliberate confirmation - nothing to type - in the row it is about, as the universe's own deletion asks in Settings.
 */
export function EraseConfirm({
  item,
  panelRef,
  busy,
  error,
  onErase,
  onCancel,
}: {
  item: TrashItem
  panelRef: React.RefObject<HTMLDivElement | null>
  busy: boolean
  error: ReactNode
  onErase: () => void
  onCancel: () => void
}) {
  useI18n()
  const titleId = `trash-erase-title-${item.id}`
  const textId = `trash-erase-text-${item.id}`

  return (
    <div
      className="trash__confirm"
      role="group"
      aria-labelledby={titleId}
      aria-describedby={textId}
      tabIndex={-1}
      ref={panelRef}
      data-testid="trash-erase-confirm"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onCancel()
        }
      }}
    >
      <p className="trash__confirmtitle" id={titleId}>
        {tx('data.trash.erase.title', {
          kind: TRASH_KIND_LABELS[item.kind].toLowerCase(),
          name: <Quoted text={item.name} />,
        })}
      </p>
      <p className="trash__confirmtext" id={textId} data-testid="trash-erase-text">
        {eraseText(item.kind)}{' '}
        <strong className="trash__final">{t('data.trash.erase.cannotUndo')}</strong>
      </p>
      {error ? (
        <p className="trash__confirmerror" role="alert" data-testid="trash-erase-error">
          {error}
        </p>
      ) : null}
      <div className="form__actions">
        <button
          className="button button--danger"
          type="button"
          aria-disabled={busy || undefined}
          onClick={onErase}
          data-testid="trash-erase-delete"
        >
          {busy ? t('data.trash.erase.deleting') : t('data.trash.erase.delete')}
        </button>
        <button
          className="button button--secondary"
          type="button"
          aria-disabled={busy || undefined}
          onClick={onCancel}
          data-testid="trash-erase-cancel"
        >
          {t('data.trash.erase.cancel')}
        </button>
      </div>
    </div>
  )
}

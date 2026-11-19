import type { ReactNode } from 'react'
import { t, tx, useI18n } from '../../i18n'
import { Quoted } from '../NameList'
import { TRASH_KIND_LABELS, type TrashItem } from '../../trash/types'
import { eraseText } from '../../trash/trashText'
import { Button } from '../Button'
import { InlineConfirm } from '../InlineConfirm'

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
  const textId = `trash-erase-text-${item.id}`

  return (
    <InlineConfirm
      look="trash"
      title={tx('data.trash.erase.title', {
        kind: TRASH_KIND_LABELS[item.kind].toLowerCase(),
        name: <Quoted text={item.name} />,
      })}
      describedBy={textId}
      panelRef={panelRef}
      onKeep={onCancel}
      busy={busy}
      error={error}
      errorTestId="trash-erase-error"
      actions={
        <div className="form__actions">
          <Button
            tone="danger"
            aria-disabled={busy || undefined}
            onClick={onErase}
            data-testid="trash-erase-delete"
          >
            {busy ? t('data.trash.erase.deleting') : t('data.trash.erase.delete')}
          </Button>
          <Button
            tone="secondary"
            aria-disabled={busy || undefined}
            onClick={onCancel}
            data-testid="trash-erase-cancel"
          >
            {t('shell.actions.cancel')}
          </Button>
        </div>
      }
      testId="trash-erase-confirm"
    >
      <p className="trash__confirmtext" id={textId} data-testid="trash-erase-text">
        {eraseText(item.kind)}{' '}
        <strong className="trash__final">{t('data.trash.erase.cannotUndo')}</strong>
      </p>
    </InlineConfirm>
  )
}

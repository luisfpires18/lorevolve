import { t, useI18n } from '../../i18n'
import { TRASH_KIND_KEYS, TRASH_KIND_LABELS, type TrashItem } from '../../trash/types'
import { eraseText, keyOf } from '../../trash/trashText'
import { Button } from '../Button'
import { InlineConfirm } from '../InlineConfirm'

/**
 * The one question before a selection is erased for good: how many, which ones by kind and name, what goes with each kind
 * selected - said once per kind, from the same words a single row's question uses - and that it cannot be undone. A
 * selected story or arc takes rows that were not selected; a selected chapter takes none of its former scenes. It takes
 * the place of the selection bar, so nothing in the selection can change while it is open.
 */
export function BulkEraseConfirm({
  items,
  panelRef,
  busy,
  error,
  onErase,
  onCancel,
}: {
  items: TrashItem[]
  panelRef: React.RefObject<HTMLDivElement | null>
  busy: boolean
  error: string | null
  onErase: () => void
  onCancel: () => void
}) {
  const { tn } = useI18n()
  const kinds = [...new Set(items.map((item) => item.kind))].sort((a, b) => a - b)
  const count = items.length

  return (
    <InlineConfirm
      look="trash"
      className="trash__bulkconfirm"
      titleAs="h2"
      title={tn('data.trash.bulk.title', count, { n: count })}
      describedBy="trash-bulk-final"
      panelRef={panelRef}
      onKeep={onCancel}
      busy={busy}
      error={error}
      errorTestId="trash-bulk-error"
      actions={
        <div className="actions form__actions">
          <Button
            tone="danger"
            aria-disabled={busy || undefined}
            onClick={onErase}
            data-testid="trash-bulk-delete-confirm"
          >
            {busy ? t('data.trash.bulk.deleting') : t('data.trash.bulk.delete')}
          </Button>
          <Button
            tone="secondary"
            aria-disabled={busy || undefined}
            onClick={onCancel}
            data-testid="trash-bulk-cancel"
          >
            {t('shell.actions.cancel')}
          </Button>
        </div>
      }
      testId="trash-bulk-confirm"
    >
      <ul
        className="trash__bulklist"
        aria-label={t('data.trash.bulk.listLabel')}
        data-testid="trash-bulk-list"
      >
        {items.map((item) => (
          <li key={keyOf(item)}>
            <span className="trash__kind">{TRASH_KIND_LABELS[item.kind]}</span>{' '}
            <bdi className="trash__bulkname">{item.name}</bdi>
          </li>
        ))}
      </ul>
      <ul className="trash__confirmtext trash__bulkconsequences" data-testid="trash-bulk-text">
        {kinds.map((kind) => (
          <li key={kind} data-kind={TRASH_KIND_KEYS[kind]}>
            <span className="trash__kind">
              {t('data.trash.bulk.each', { kind: TRASH_KIND_LABELS[kind].toLowerCase() })}
            </span>{' '}
            {eraseText(kind)}
          </li>
        ))}
      </ul>
      <p className="trash__confirmtext" id="trash-bulk-final">
        <strong className="trash__final">{t('data.trash.bulk.cannotUndo')}</strong>
      </p>
    </InlineConfirm>
  )
}

import { t, useI18n } from '../../i18n'
import { TRASH_KIND_KEYS, TRASH_KIND_LABELS, type TrashItem } from '../../trash/types'
import { eraseText, keyOf } from '../../trash/trashText'
import { Button } from '../Button'

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
    <div
      className="trash__confirm trash__bulkconfirm"
      role="group"
      aria-labelledby="trash-bulk-title"
      aria-describedby="trash-bulk-final"
      tabIndex={-1}
      ref={panelRef}
      data-testid="trash-bulk-confirm"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onCancel()
        }
      }}
    >
      <h2 className="trash__confirmtitle" id="trash-bulk-title">
        {tn('data.trash.bulk.title', count, { n: count })}
      </h2>
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
      {error ? (
        <p className="trash__confirmerror" role="alert" data-testid="trash-bulk-error">
          {error}
        </p>
      ) : null}
      <div className="form__actions">
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
          {t('data.trash.bulk.cancel')}
        </Button>
      </div>
    </div>
  )
}

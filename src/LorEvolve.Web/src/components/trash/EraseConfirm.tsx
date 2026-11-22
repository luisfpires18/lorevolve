import type { ReactNode } from 'react'
import { t, tx, useI18n } from '../../i18n'
import { Quoted } from '../NameList'
import { TRASH_KIND_KEYS, TRASH_KIND_LABELS, type TrashItem } from '../../trash/types'
import { eraseText, keyOf } from '../../trash/trashText'
import { FormActions } from '../FormActions'
import { InlineConfirm } from '../InlineConfirm'

/**
 * The one question before something is erased for good: what it is, what goes with it, and that it cannot be undone. One
 * deliberate confirmation - nothing to type - as the universe's own deletion asks in Settings. Given `item`, it asks in
 * the row it is about. Given `items` (a selection), it names how many, which ones by kind and name, and what goes with
 * each kind selected - said once per kind, from the same words a single row's question uses. A selected story or arc
 * takes rows that were not selected; a selected chapter takes none of its former scenes. It takes the place of the
 * selection bar, so nothing in the selection can change while it is open.
 */
export function EraseConfirm(
  props: {
    panelRef: React.RefObject<HTMLDivElement | null>
    busy: boolean
    error: ReactNode
    onErase: () => void
    onCancel: () => void
  } & ({ item: TrashItem } | { items: TrashItem[] }),
) {
  const { tn } = useI18n()
  const { panelRef, busy, error, onErase, onCancel } = props
  // One row's question, or a selection's.
  const one = 'item' in props ? props.item : null
  const items = 'items' in props ? props.items : []
  const textId = one ? `trash-erase-text-${one.id}` : 'trash-bulk-final'

  return (
    <InlineConfirm
      look="trash"
      className={one ? undefined : 'trash__bulkconfirm'}
      titleAs={one ? undefined : 'h2'}
      title={
        one
          ? tx('data.trash.erase.title', {
              kind: TRASH_KIND_LABELS[one.kind].toLowerCase(),
              name: <Quoted text={one.name} />,
            })
          : tn('data.trash.bulk.title', items.length, { n: items.length })
      }
      describedBy={textId}
      panelRef={panelRef}
      onKeep={onCancel}
      busy={busy}
      error={error}
      errorTestId={one ? 'trash-erase-error' : 'trash-bulk-error'}
      actions={
        <FormActions
          inline
          softDisable
          submitLabel={one ? t('data.trash.erase.delete') : t('data.trash.bulk.delete')}
          busy={busy}
          busyLabel={one ? t('data.trash.erase.deleting') : t('data.trash.bulk.deleting')}
          submitTone="danger"
          onSubmit={onErase}
          submitTestId={one ? 'trash-erase-delete' : 'trash-bulk-delete-confirm'}
          onCancel={onCancel}
          cancelTestId={one ? 'trash-erase-cancel' : 'trash-bulk-cancel'}
        />
      }
      testId={one ? 'trash-erase-confirm' : 'trash-bulk-confirm'}
    >
      {one ? (
        <p className="trash__confirmtext" id={textId} data-testid="trash-erase-text">
          {eraseText(one.kind)}{' '}
          <strong className="trash__final">{t('data.trash.erase.cannotUndo')}</strong>
        </p>
      ) : (
        <>
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
            {[...new Set(items.map((item) => item.kind))]
              .sort((a, b) => a - b)
              .map((kind) => (
                <li key={kind} data-kind={TRASH_KIND_KEYS[kind]}>
                  <span className="trash__kind">
                    {t('data.trash.bulk.each', { kind: TRASH_KIND_LABELS[kind].toLowerCase() })}
                  </span>{' '}
                  {eraseText(kind)}
                </li>
              ))}
          </ul>
          <p className="trash__confirmtext" id={textId}>
            <strong className="trash__final">{t('data.trash.bulk.cannotUndo')}</strong>
          </p>
        </>
      )}
    </InlineConfirm>
  )
}

import { t, tx } from '../../i18n'
import type { useUniverseAccess } from '../../universes/access'
import { ArchiveRestore } from 'lucide-react'
import { formatDateTime } from '../../lib/dates'
import { TRASH_KIND_KEYS, TRASH_KIND_LABELS, TrashKind, type TrashItem } from '../../trash/types'
import { EntityTile } from '../EntityTile'
import type { WorkspaceContext } from '../../pages/UniverseWorkspace'
import type { useTrashState } from '../../trash/useTrashState'
import { blockedText, keyOf, whereItWas } from '../../trash/trashText'
import { EraseConfirm } from './EraseConfirm'
import { KindTile } from './KindTile'
import { RestorePublicConfirm } from './RestorePublicConfirm'
import { Button } from '../Button'
import { QuietNote } from '../QuietNote'

/** One row of the Trash: what it was and where, and Restore and Delete permanently with their questions; or its checkbox while selecting. */
export function TrashRow({
  item,
  universe,
  access,
  busy,
  isSelecting,
  selectedKeys,
  selectionLocked,
  toggle,
  restoring,
  restoreButtons,
  askToRestore,
  restore,
  confirming,
  confirmRef,
  cancelConfirming,
  erasing,
  eraseRef,
  eraseBusy,
  eraseError,
  eraseButtons,
  askToErase,
  erase,
  cancelErasing,
}: Pick<
  ReturnType<typeof useTrashState>,
  | 'isSelecting'
  | 'restoring'
  | 'restoreButtons'
  | 'confirming'
  | 'confirmRef'
  | 'erasing'
  | 'eraseRef'
  | 'eraseBusy'
  | 'eraseError'
  | 'eraseButtons'
> & {
  item: TrashItem
  universe: WorkspaceContext['universe']
  access: ReturnType<typeof useUniverseAccess>
  busy: boolean
  selectedKeys: ReadonlySet<string>
  selectionLocked: boolean
  toggle: (item: TrashItem) => void
  askToRestore: (item: TrashItem) => void
  restore: (item: TrashItem, keepPrivate?: boolean) => Promise<void>
  cancelConfirming: () => void
  askToErase: (item: TrashItem) => void
  erase: (item: TrashItem) => Promise<void>
  cancelErasing: () => void
}) {
  const kind = TRASH_KIND_LABELS[item.kind]
  const kindKey = TRASH_KIND_KEYS[item.kind]
  const waiting = blockedText(item)
  const waitingId = `trash-waiting-${item.id}`
  const isChecked = isSelecting && selectedKeys.has(keyOf(item))

  const what = (
    <>
      {/* What it is, at a glance: an entry's type tile, or the icon of the story part or rule. The kind is
                    said in words beside the name, so the tile is decorative. */}
      {item.kind === TrashKind.Entry ? (
        <EntityTile
          className="trash__tile"
          universeId={universe.id}
          entityId={item.id}
          image={null}
          typeIcon={item.entityTypeIcon}
          typeAccent={item.entityTypeAccentColor}
        />
      ) : (
        <KindTile kind={item.kind} />
      )}
      <div className="trash__what">
        <p className="trash__name">
          <bdi>{item.name}</bdi>
        </p>
        <QuietNote className="trash__meta" wrap>
          <span className="trash__kind" data-testid="trash-kind">
            {kind}
          </span>{' '}
          {tx('data.trash.row.meta', {
            where: whereItWas(item),
            date: formatDateTime(item.trashedAt),
          })}
        </QuietNote>
        {waiting ? (
          <p className="trash__waiting" id={waitingId} data-testid="trash-waiting">
            {waiting}
          </p>
        ) : null}
      </div>
    </>
  )

  if (isSelecting) {
    // Selecting: the row is its checkbox's label, so pressing anywhere on it - or Space on the box - selects
    // it. Restore and Delete permanently… step aside until selecting is done.
    return (
      <li
        className="trash__row"

        data-testid={`trash-row-${item.name}`}
        data-kind={kindKey}
        data-selected={isChecked ? 'true' : undefined}
      >
        <label className="trash__pick">
          <input
            className="trash__check"
            type="checkbox"
            checked={isChecked}
            disabled={selectionLocked}
            onChange={() => toggle(item)}
            aria-label={t('data.trash.row.selectLabel', {
              kind: kind.toLowerCase(),
              name: item.name,
            })}
            data-testid={`select-${item.name}`}
          />
          {what}
        </label>
      </li>
    )
  }

  return (
    <li
      className="trash__row"

      data-testid={`trash-row-${item.name}`}
      data-kind={kindKey}
    >
      {what}
      <div className="trash__actions">
        <Button
          tone="secondary"
          icon={ArchiveRestore}
          ref={(node) => {
            if (node) restoreButtons.current.set(item.id, node)
            else restoreButtons.current.delete(item.id)
          }}
          disabled={busy || waiting !== null}
          aria-label={t('data.trash.row.restoreLabel', {
            kind: kind.toLowerCase(),
            name: item.name,
          })}
          aria-describedby={waiting ? waitingId : undefined}
          onClick={() => askToRestore(item)}
          data-testid={`restore-${item.name}`}
        >
          {restoring === item.id ? t('data.trash.row.restoring') : t('data.trash.row.restore')}
        </Button>
        {access.permanentlyDelete ? (
          <Button
            tone="text"
            className="trash__erase"
            ref={(node) => {
              if (node) eraseButtons.current.set(item.id, node)
              else eraseButtons.current.delete(item.id)
            }}
            disabled={busy}
            aria-label={t('data.trash.row.eraseLabel', {
              kind: kind.toLowerCase(),
              name: item.name,
            })}
            onClick={() => askToErase(item)}
            data-testid={`erase-${item.name}`}
          >
            {t('data.trash.row.erase')}
          </Button>
        ) : null}
      </div>
      {confirming?.id === item.id && confirming.kind === item.kind ? (
        <RestorePublicConfirm
          item={item}
          panelRef={confirmRef}
          onRestore={() => void restore(item)}
          onRestorePrivate={() => void restore(item, true)}
          onCancel={cancelConfirming}
        />
      ) : null}
      {erasing?.id === item.id && erasing.kind === item.kind ? (
        <EraseConfirm
          item={item}
          panelRef={eraseRef}
          busy={eraseBusy}
          error={eraseError}
          onErase={() => void erase(item)}
          onCancel={cancelErasing}
        />
      ) : null}
    </li>
  )
}

import { ListTree, Pencil, Trash } from 'lucide-react'
import { ActionIcon } from './ActionIcon'
import { ActionMenu } from './ActionMenu'
import { useI18n } from '../i18n'
import { Button } from './Button'
import { DisclosureButton } from './DisclosureButton'
import { MoveItems } from './MoveItems'
import { NewButton } from './NewButton'

type Direction = 'up' | 'down'

/**
 * A type row's verbs in the Types order: Up and Down, Add child, Edit, Fields, and the menu with Add
 * child, the moves and Delete. Pass only what the row may do; the menu shows when it holds something.
 */
export function TypeRowActions({
  name,
  move,
  addChild,
  onEdit,
  editTestId,
  fields,
  onDelete,
  deleteLabel,
  deleteDisabled,
  deleteTestId,
  menuTestId,
}: {
  name: string
  move?: {
    isFirst: boolean
    isLast: boolean
    busy: boolean
    onMove: (direction: Direction) => void
    /** Keeps each Up and Down button, so the focus can come back to it after a move. */
    buttonRef: (direction: Direction, element: HTMLButtonElement | null) => void
  }
  /** `itemTestId` also names the menu item by the type, as the Types page does. */
  addChild?: { onAdd: () => void; testId: string; itemTestId?: string }
  onEdit?: () => void
  editTestId?: string
  fields: {
    open: boolean
    count: number
    onToggle: () => void
    testId: string
    /** The id of the fields region the button shows and hides. */
    controls: string
  }
  onDelete?: () => void
  deleteLabel?: string
  deleteDisabled?: boolean
  deleteTestId?: string
  menuTestId: string
}) {
  const { t } = useI18n()
  return (
    <>
      {move ? (
        <MoveItems
          look="icon"
          name={name}
          first={move.isFirst}
          last={move.isLast}
          busy={move.busy}
          onMove={(step) => move.onMove(step === -1 ? 'up' : 'down')}
          buttonRef={move.buttonRef}
          groupLabel={t('entityTypes.page.orderOf', { name })}
          groupClassName="types__move"
          endTitles={{
            first: t('entityTypes.page.alreadyFirst'),
            last: t('entityTypes.page.alreadyLast'),
          }}
          testIds={{ up: `move-up-${name}`, down: `move-down-${name}` }}
        />
      ) : null}
      {/* A type straight inside this one, its parent already chosen - the quick way to build a branch.
          Quiet like Up and Down; on a phone it waits in the row's menu instead. Coming back from the
          drawer, the focus is on this button again, ready for the next sibling. */}
      {addChild ? (
        <NewButton
          tone="text"
          size="sm"
          icon={ListTree}
          className="types__addchild"
          onClick={addChild.onAdd}
          aria-label={t('entityTypes.page.addChildLabel', { name })}
          data-testid={addChild.testId}
        >
          {t('entityTypes.page.addChild')}
        </NewButton>
      ) : null}
      {onEdit ? (
        <Button
          tone="secondary"
          size="sm"
          icon={Pencil}
          onClick={onEdit}
          aria-label={t('entityTypes.page.editLabel', { name })}
          data-testid={editTestId}
        >
          {t('entityTypes.page.edit')}
        </Button>
      ) : null}
      <DisclosureButton
        tone="secondary"
        size="sm"
        expanded={fields.open}
        controls={fields.controls}
        aria-label={t('entityTypes.page.fieldsLabel', { name })}
        onToggle={fields.onToggle}
        data-testid={fields.testId}
      >
        {t('entityTypes.page.fields')}
        {fields.count > 0 ? <span className="types__fieldcount">{fields.count}</span> : null}
      </DisclosureButton>
      {addChild || move || onDelete ? (
        <ActionMenu label={t('entityTypes.page.moreActions', { name })} triggerTestId={menuTestId}>
          {addChild ? (
            <button
              className="actionmenu__item types__addchilditem"
              type="button"
              onClick={addChild.onAdd}
              aria-label={
                addChild.itemTestId ? t('entityTypes.page.addChildLabel', { name }) : undefined
              }
              data-testid={addChild.itemTestId}
            >
              <ActionIcon icon={ListTree} />
              {t('entityTypes.page.addChildType')}
            </button>
          ) : null}
          {/* The grip's plain alternative on a wide screen, where Up and Down are not set out on the row. */}
          {move ? (
            <MoveItems
              first={move.isFirst}
              last={move.isLast}
              busy={move.busy}
              onMove={(step) => move.onMove(step === -1 ? 'up' : 'down')}
              itemClassName="types__moveitem"
              testIds={{ up: `move-up-item-${name}`, down: `move-down-item-${name}` }}
            />
          ) : null}
          {onDelete ? (
            <button
              className="actionmenu__item actionmenu__item--danger"
              type="button"
              disabled={deleteDisabled}
              onClick={onDelete}
              data-testid={deleteTestId}
            >
              <ActionIcon icon={Trash} />
              {deleteLabel ?? t('entityTypes.page.deleteType')}
            </button>
          ) : null}
        </ActionMenu>
      ) : null}
    </>
  )
}

import { ArrowDown, ArrowUp, ListTree, Pencil, Trash } from 'lucide-react'
import { ActionIcon } from './ActionIcon'
import { ActionMenu } from './ActionMenu'
import { useI18n } from '../i18n'
import { Button } from './Button'
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
  fields: { open: boolean; count: number; onToggle: () => void; testId: string }
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
        <span
          className="types__move"
          role="group"
          aria-label={t('entityTypes.page.orderOf', { name })}
        >
          {(['up', 'down'] as const).map((direction) => {
            const isEnd = direction === 'up' ? move.isFirst : move.isLast
            return (
              <Button
                tone="text"
                size="sm"
                icon={direction === 'up' ? ArrowUp : ArrowDown}
                className="types__movebutton"
                key={direction}
                ref={(element) => move.buttonRef(direction, element)}
                aria-disabled={isEnd || move.busy || undefined}
                aria-label={
                  direction === 'up'
                    ? t('entityTypes.page.moveUpLabel', { name })
                    : t('entityTypes.page.moveDownLabel', { name })
                }
                title={
                  isEnd
                    ? direction === 'up'
                      ? t('entityTypes.page.alreadyFirst')
                      : t('entityTypes.page.alreadyLast')
                    : undefined
                }
                onClick={() => {
                  if (!isEnd) move.onMove(direction)
                }}
                data-testid={`move-${direction}-${name}`}
              >
                {direction === 'up' ? t('entityTypes.page.up') : t('entityTypes.page.down')}
              </Button>
            )
          })}
        </span>
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
      <Button
        tone="secondary"
        size="sm"
        aria-expanded={fields.open}
        aria-label={t('entityTypes.page.fieldsLabel', { name })}
        onClick={fields.onToggle}
        data-testid={fields.testId}
      >
        {t('entityTypes.page.fields')}
        {fields.count > 0 ? <span className="types__fieldcount">{fields.count}</span> : null}
      </Button>
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
          {move
            ? (['up', 'down'] as const).map((direction) =>
                (direction === 'up' ? move.isFirst : move.isLast) ? null : (
                  <button
                    key={direction}
                    className="actionmenu__item types__moveitem"
                    type="button"
                    onClick={() => move.onMove(direction)}
                    disabled={move.busy}
                    data-testid={`move-${direction}-item-${name}`}
                  >
                    <ActionIcon icon={direction === 'up' ? ArrowUp : ArrowDown} />
                    {direction === 'up'
                      ? t('entityTypes.page.moveUp')
                      : t('entityTypes.page.moveDown')}
                  </button>
                ),
              )
            : null}
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

import type { ReactNode } from 'react'
import { ListTree, Pencil, Trash } from 'lucide-react'
import { ActionMenu, ActionMenuItem } from './ActionMenu'
import { useI18n } from '../i18n'
import { Button } from './Button'
import { DisclosureButton } from './DisclosureButton'
import { MoveItems } from './MoveItems'
import { NewButton } from './NewButton'

type Direction = 'up' | 'down'

/**
 * A type row's verbs in the Types order: Up and Down, Add child, Edit, Fields, and the menu with Add
 * child, the moves, `menuItems` and Delete. Pass only what the row may do; the menu shows when it holds something.
 * `words` names Add child and Edit for a row that is not a type (a season adds an episode, and is renamed): the word is
 * then the button's whole name.
 */
export function TypeRowActions({
  name,
  move,
  moveTestIds,
  addChild,
  onEdit,
  editTestId,
  fold,
  words,
  menuItems,
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
    buttonRef?: (direction: Direction, element: HTMLButtonElement | null) => void
  }
  /** The menu's Up and Down ids, in place of the type ones; the row's own Up and Down then carry none. */
  moveTestIds?: { up: string; down: string }
  /** `itemTestId` also names the menu item by the type, as the Types page does. */
  addChild?: { onAdd: () => void; testId: string; itemTestId?: string }
  onEdit?: () => void
  editTestId?: string
  /** The disclosure that shows and hides the row's body: a type's fields. */
  fold?: {
    open: boolean
    count: number
    onToggle: () => void
    testId: string
    /** The id of the fields region the button shows and hides. */
    controls: string
  }
  words?: { addChild?: string; edit?: string }
  /** More menu items, before Delete. */
  menuItems?: ReactNode
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
          testIds={moveTestIds ? undefined : { up: `move-up-${name}`, down: `move-down-${name}` }}
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
          aria-label={words?.addChild ? undefined : t('entityTypes.page.addChildLabel', { name })}
          data-testid={addChild.testId}
        >
          {words?.addChild ?? t('entityTypes.page.addChild')}
        </NewButton>
      ) : null}
      {onEdit ? (
        <Button
          tone="secondary"
          size="sm"
          icon={Pencil}
          onClick={onEdit}
          aria-label={words?.edit ? undefined : t('entityTypes.page.editLabel', { name })}
          data-testid={editTestId}
        >
          {words?.edit ?? t('entityTypes.page.edit')}
        </Button>
      ) : null}
      {fold ? (
        <DisclosureButton
          tone="secondary"
          size="sm"
          expanded={fold.open}
          controls={fold.controls}
          aria-label={t('entityTypes.page.fieldsLabel', { name })}
          onToggle={fold.onToggle}
          data-testid={fold.testId}
        >
          {t('entityTypes.page.fields')}
          {fold.count > 0 ? <span className="types__fieldcount">{fold.count}</span> : null}
        </DisclosureButton>
      ) : null}
      {addChild || move || menuItems || onDelete ? (
        <ActionMenu label={t('entityTypes.page.moreActions', { name })} triggerTestId={menuTestId}>
          {addChild ? (
            <ActionMenuItem
              icon={ListTree}
              className="types__addchilditem"
              onClick={addChild.onAdd}
              aria-label={
                addChild.itemTestId ? t('entityTypes.page.addChildLabel', { name }) : undefined
              }
              testId={addChild.itemTestId}
            >
              {words?.addChild ?? t('entityTypes.page.addChildType')}
            </ActionMenuItem>
          ) : null}
          {/* The grip's plain alternative on a wide screen, where Up and Down are not set out on the row. */}
          {move ? (
            <MoveItems
              first={move.isFirst}
              last={move.isLast}
              busy={move.busy}
              onMove={(step) => move.onMove(step === -1 ? 'up' : 'down')}
              itemClassName="types__moveitem"
              testIds={
                moveTestIds ?? { up: `move-up-item-${name}`, down: `move-down-item-${name}` }
              }
            />
          ) : null}
          {menuItems}
          {onDelete ? (
            <ActionMenuItem
              icon={Trash}
              tone="danger"
              disabled={deleteDisabled}
              onClick={onDelete}
              testId={deleteTestId}
            >
              {deleteLabel ?? t('entityTypes.page.deleteType')}
            </ActionMenuItem>
          ) : null}
        </ActionMenu>
      ) : null}
    </>
  )
}

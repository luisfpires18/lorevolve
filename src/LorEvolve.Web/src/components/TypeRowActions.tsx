import { useEffect, useRef, type ReactNode } from 'react'
import { ListTree, Pencil, Trash } from 'lucide-react'
import { ActionMenu, ActionMenuItem } from './ActionMenu'
import { useI18n } from '../i18n'
import { Button } from './Button'
import { DisclosureButton } from './DisclosureButton'
import { MoveItems } from './MoveItems'
import { NewButton } from './NewButton'
import { siblingMove, type MoveDirection, type Sibling } from '../lib/siblingMove'

/**
 * A type row's verbs in the Types order: Up and Down, Add child, Edit, Fields, and the menu with Add
 * child, the moves, `menuItems` and Delete. Pass only what the row may do; the menu shows when it holds something.
 * `words` names Add child and Edit for a row that is not a type (a season adds an episode, and is renamed): the word is
 * then the button's whole name, unless `addChildLabel` or `editLabel` gives it a longer one that holds the row's name.
 * `words.first` and `words.last` are the hover tips at the ends of Up and Down, in place of the Types ones, and
 * `words.more` names the menu. A fold with a `label` folds a row's body rather than a type's fields: it reads Expand or
 * Collapse and is named with the label, as a story's arcs, chapters and scenes fold. `sibling` is the row's place in its
 * list and what a move does (`lib/siblingMove.ts`): the first and last row and the direction are worked out here.
 */
export function TypeRowActions({
  name,
  sibling,
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
  sibling?: Sibling
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
    /** What the fold shows and hides, in words, for a fold that is not a type's fields. */
    label?: string
  }
  words?: {
    addChild?: string
    edit?: string
    addChildLabel?: string
    editLabel?: string
    first?: string
    last?: string
    more?: string
  }
  /** More menu items, before Delete. */
  menuItems?: ReactNode
  onDelete?: () => void
  deleteLabel?: string
  deleteDisabled?: boolean
  deleteTestId?: string
  menuTestId: string
}) {
  const { t } = useI18n()
  const move = sibling ? siblingMove(sibling) : undefined
  // The pressed button keeps the focus once the move is saved: the row moves and the button may be disabled meanwhile.
  const buttons = useRef(new Map<MoveDirection, HTMLButtonElement>())
  const refocus = useRef<MoveDirection | null>(null)
  const busy = move?.busy
  useEffect(() => {
    if (busy || !refocus.current) return
    buttons.current.get(refocus.current)?.focus()
    refocus.current = null
  }, [busy])
  return (
    <>
      {move ? (
        <MoveItems
          look="icon"
          name={name}
          first={move.isFirst}
          last={move.isLast}
          busy={move.busy}
          onMove={(step) => {
            const direction = step === -1 ? 'up' : 'down'
            refocus.current = direction
            move.onMove(direction)
          }}
          buttonRef={(direction, element) => {
            if (element) buttons.current.set(direction, element)
            else buttons.current.delete(direction)
            move.buttonRef?.(direction, element)
          }}
          groupLabel={t('entityTypes.page.orderOf', { name })}
          groupClassName="types__move"
          endTitles={{
            first: words?.first ?? t('entityTypes.page.alreadyFirst'),
            last: words?.last ?? t('entityTypes.page.alreadyLast'),
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
          aria-label={
            words?.addChildLabel ??
            (words?.addChild ? undefined : t('entityTypes.page.addChildLabel', { name }))
          }
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
          aria-label={
            words?.editLabel ??
            (words?.edit ? undefined : t('entityTypes.page.editLabel', { name }))
          }
          data-testid={editTestId}
        >
          {words?.edit ?? t('entityTypes.page.edit')}
        </Button>
      ) : null}
      {fold ? (
        fold.label !== undefined ? (
          <DisclosureButton
            tone="secondary"
            size="sm"
            expanded={fold.open}
            controls={fold.controls}
            aria-label={
              fold.open
                ? t('stories.page.fold.collapseLabel', { label: fold.label })
                : t('stories.page.fold.expandLabel', { label: fold.label })
            }
            title={fold.open ? t('stories.page.fold.collapse') : t('stories.page.fold.expand')}
            onToggle={fold.onToggle}
            expandedLabel={t('stories.page.fold.collapse')}
            data-testid={fold.testId}
          >
            {t('stories.page.fold.expand')}
          </DisclosureButton>
        ) : (
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
        )
      ) : null}
      {addChild || move || menuItems || onDelete ? (
        <ActionMenu
          label={words?.more ?? t('entityTypes.page.moreActions', { name })}
          triggerTestId={menuTestId}
        >
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

import { ArrowDown, ArrowUp, ListTree, Pencil } from 'lucide-react'
import { ActionIcon } from '../ActionIcon'
import { ActionMenu } from '../ActionMenu'
import { useI18n } from '../../i18n'
import type { EntityType } from '../../lore/typeDefinitions'
import { Button } from '../Button'
import { NewButton } from '../NewButton'

/** A type row's actions: Up and Down, Add child, Edit, Fields, and the menu with Add child, the moves and Delete. */
export function TypeRowActions({
  type,
  access,
  isFirst,
  isLast,
  moving,
  moveButtons,
  openTypeId,
  setOpenTypeId,
  setBlocked,
  setEditing,
  move,
  openChild,
  removeType,
}: {
  type: EntityType
  access: { editContent: boolean }
  isFirst: boolean
  isLast: boolean
  moving: string | null
  moveButtons: { current: Map<string, HTMLButtonElement> }
  openTypeId: string | null
  setOpenTypeId: (openTypeId: string | null) => void
  setBlocked: (blocked: { typeId: string; text: string } | null) => void
  setEditing: (editing: EntityType) => void
  move: (type: EntityType, direction: 'up' | 'down') => Promise<void>
  openChild: (parent: EntityType) => void
  removeType: (type: EntityType) => Promise<void>
}) {
  const { t } = useI18n()
  return (
    <span className="types__actions">
      {access.editContent ? (
        <>
          <span
            className="types__move"
            role="group"
            aria-label={t('entityTypes.page.orderOf', { name: type.name })}
          >
            {(['up', 'down'] as const).map((direction) => {
              const isEnd = direction === 'up' ? isFirst : isLast
              return (
                <Button
                  tone="text"
                  size="sm"
                  icon={direction === 'up' ? ArrowUp : ArrowDown}
                  className="types__movebutton"
                  key={direction}
                  ref={(element) => {
                    const key = `${type.id}:${direction}`
                    if (element) moveButtons.current.set(key, element)
                    else moveButtons.current.delete(key)
                  }}
                  aria-disabled={isEnd || moving !== null || undefined}
                  aria-label={
                    direction === 'up'
                      ? t('entityTypes.page.moveUpLabel', { name: type.name })
                      : t('entityTypes.page.moveDownLabel', { name: type.name })
                  }
                  title={
                    isEnd
                      ? direction === 'up'
                        ? t('entityTypes.page.alreadyFirst')
                        : t('entityTypes.page.alreadyLast')
                      : undefined
                  }
                  onClick={() => {
                    if (!isEnd) void move(type, direction)
                  }}
                  data-testid={`move-${direction}-${type.name}`}
                >
                  {direction === 'up' ? t('entityTypes.page.up') : t('entityTypes.page.down')}
                </Button>
              )
            })}
          </span>
          {/* A type straight inside this one, its parent already chosen - the quick way to build a branch.
                          Quiet like Up and Down; on a phone it waits in the row's menu instead. Coming back from the
                          drawer, the focus is on this button again, ready for the next sibling. */}
          <NewButton
            tone="secondary"
            size="sm"
            icon={ListTree}
            className="types__addchild"
            onClick={() => openChild(type)}
            aria-label={t('entityTypes.page.addChildLabel', { name: type.name })}
            data-testid={`add-child-${type.name}`}
          >
            {t('entityTypes.page.addChild')}
          </NewButton>
          <Button
            tone="secondary"
            size="sm"
            icon={Pencil}
            onClick={() => {
              setBlocked(null)
              setEditing(type)
            }}
            aria-label={t('entityTypes.page.editLabel', { name: type.name })}
            data-testid={`edit-type-${type.name}`}
          >
            {t('entityTypes.page.edit')}
          </Button>
        </>
      ) : null}
      <Button
        tone="secondary"
        size="sm"
        aria-expanded={openTypeId === type.id}
        aria-label={t('entityTypes.page.fieldsLabel', { name: type.name })}
        onClick={() => setOpenTypeId(openTypeId === type.id ? null : type.id)}
        data-testid={`fields-${type.name}`}
      >
        {t('entityTypes.page.fields')}
        {type.fields.length > 0 ? (
          <span className="types__fieldcount">{type.fields.length}</span>
        ) : null}
      </Button>
      {access.editContent ? (
        <ActionMenu
          label={t('entityTypes.page.moreActions', { name: type.name })}
          triggerTestId={`type-actions-${type.name}`}
        >
          <button
            className="actionmenu__item types__addchilditem"
            type="button"
            onClick={() => openChild(type)}
            aria-label={t('entityTypes.page.addChildLabel', { name: type.name })}
            data-testid={`add-child-item-${type.name}`}
          >
            <ActionIcon icon={ListTree} />
            {t('entityTypes.page.addChildType')}
          </button>
          {/* The grip's plain alternative on a wide screen, where Up and Down are not set out on the row. */}
          {(['up', 'down'] as const).map((direction) =>
            (direction === 'up' ? isFirst : isLast) ? null : (
              <button
                key={direction}
                className="actionmenu__item types__moveitem"
                type="button"
                onClick={() => void move(type, direction)}
                disabled={moving !== null}
                data-testid={`move-${direction}-item-${type.name}`}
              >
                <ActionIcon icon={direction === 'up' ? ArrowUp : ArrowDown} />
                {direction === 'up' ? t('entityTypes.page.moveUp') : t('entityTypes.page.moveDown')}
              </button>
            ),
          )}
          <button
            className="actionmenu__item actionmenu__item--danger"
            type="button"
            onClick={() => void removeType(type)}
            data-testid={`delete-type-${type.name}`}
          >
            {t('entityTypes.page.deleteType')}
          </button>
        </ActionMenu>
      ) : null}
    </span>
  )
}

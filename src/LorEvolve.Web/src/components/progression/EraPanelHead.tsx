import { Pencil, Trash } from 'lucide-react'
import { ActionIcon } from '../ActionIcon'
import { ActionMenu } from '../ActionMenu'
import { MoveItems } from '../MoveItems'
import { useI18n } from '../../i18n'
import type { EntityDetail } from '../../lore/types'
import type { Era } from '../../progression/types'
import { useUniverseAccess } from '../../universes/access'
import type { RefObject } from 'react'
import { Button } from '../Button'
import { QuietNote } from '../QuietNote'

/** The era's eyebrow, title and span, with Edit and the menu holding Earlier, Later and Remove. */
export function EraPanelHead({
  era,
  entry,
  title,
  span,
  access,
  busy,
  isFirst,
  isLast,
  onEdit,
  onMove,
  onRemove,
}: {
  era: Era
  entry: EntityDetail
  title: RefObject<HTMLHeadingElement | null>
  span: string | null
  access: ReturnType<typeof useUniverseAccess>
  busy: boolean
  isFirst: boolean
  isLast: boolean
  onEdit: () => void
  onMove: (by: number) => void
  onRemove: () => void
}) {
  const { t } = useI18n()
  return (
    <header className="erapanel__head">
      <div>
        <QuietNote className="erapanel__eyebrow">
          {t('progression.era.eyebrow', { name: entry.name })}
        </QuietNote>
        <h3
          className="erapanel__title"
          id="era-title"
          ref={title}
          tabIndex={-1}
          data-testid="era-title"
        >
          {era.name}
        </h3>
        {span ? (
          <p className="erapanel__span" data-testid="era-span">
            {span}
          </p>
        ) : null}
      </div>
      {access.editContent ? (
        <div className="erapanel__tools">
          <Button tone="secondary" size="sm" icon={Pencil} onClick={onEdit} data-testid="edit-era">
            {t('progression.era.edit')}
          </Button>
          <ActionMenu
            label={t('progression.era.moreActions', { name: era.name })}
            triggerTestId="era-actions"
          >
            <MoveItems
              first={isFirst}
              last={isLast}
              busy={busy}
              wording="earlier-later"
              edge="disable"
              testIds={{ up: 'era-earlier', down: 'era-later' }}
              onMove={onMove}
            />
            <hr className="actionmenu__divider" />
            <button
              className="actionmenu__item actionmenu__item--danger"
              type="button"
              disabled={busy}
              onClick={onRemove}
              data-testid="remove-era"
            >
              <ActionIcon icon={Trash} />
              {t('progression.era.remove')}
            </button>
          </ActionMenu>
        </div>
      ) : null}
    </header>
  )
}

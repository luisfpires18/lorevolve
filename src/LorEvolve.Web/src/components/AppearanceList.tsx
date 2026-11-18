import { ImagePlus } from 'lucide-react'
import { ActionIcon } from './ActionIcon'
import type { Appearance } from '../progression/types'
import { useUniverseAccess } from '../universes/access'
import { t, useI18n } from '../i18n'
import { AppearanceItem } from './lore/AppearanceItem'

/**
 * An entry's appearances on the main profile (Issue #43): each look's label, notes, gallery and what it belongs to. Pictures are
 * added, ordered and removed here, one request each, and are not part of era history - a removed picture is deleted.
 */
export function AppearanceList({
  universeId,
  entityId,
  appearances,
  busy,
  onAdd,
  onEdit,
  onMove,
  onRemove,
  onPicturesChanged,
}: {
  universeId: string
  entityId: string
  appearances: Appearance[]
  busy: boolean
  onAdd: () => void
  onEdit: (appearance: Appearance) => void
  onMove: (appearance: Appearance, by: number) => void
  onRemove: (appearance: Appearance) => void
  /** A picture was added, moved or removed: the progression is read again. */
  onPicturesChanged: () => void
}) {
  useI18n()
  const access = useUniverseAccess()

  if (appearances.length === 0 && !access.editContent) return null

  return (
    <section
      className="progitems"
      aria-labelledby="appearance-list-heading"
      data-testid="appearance-list"
    >
      <div className="progression__head">
        <h3 className="rail__heading" id="appearance-list-heading">
          {t('progression.appearanceList.heading')}
        </h3>
        {access.editContent ? (
          <button
            className="button button--secondary button--sm"
            type="button"
            onClick={onAdd}
            disabled={busy}
            data-testid="add-appearance"
          >
            <ActionIcon icon={ImagePlus} />
            {t('progression.appearanceList.add')}
          </button>
        ) : null}
      </div>
      {appearances.length === 0 ? (
        <p className="muted">{t('progression.appearanceList.empty')}</p>
      ) : (
        <ul className="progitems__list">
          {appearances.map((appearance, index) => (
            <AppearanceItem
              key={appearance.id}
              canMoveEarlier={index > 0}
              canMoveLater={index < appearances.length - 1}
              onMove={(by) => onMove(appearance, by)}
              universeId={universeId}
              entityId={entityId}
              appearance={appearance}
              busy={busy}
              onEdit={() => onEdit(appearance)}
              onRemove={() => onRemove(appearance)}
              onPicturesChanged={onPicturesChanged}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

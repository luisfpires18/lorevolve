import { useId, useState } from 'react'
import { ImagePlus } from 'lucide-react'
import { appearanceImageUrl } from '../progression/api'
import type { Appearance, AppearanceImage } from '../progression/types'
import { useUniverseAccess } from '../universes/access'
import { t, useI18n } from '../i18n'
import { useAppearanceImages } from '../lore/useAppearanceImages'
import { AppearanceGallery } from './lore/AppearanceGallery'
import { FormMessage } from './FormMessage'
import { ImageViewer } from './ImageViewer'
import { ItemRow } from './progression/ItemRow'
import { NewButton } from './NewButton'
import { QuietNote } from './QuietNote'
import { PanelHead } from './PanelHead'

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
      className="stack stack--3"
      aria-labelledby="appearance-list-heading"
      data-testid="appearance-list"
    >
      <PanelHead
        look="label"
        level={3}
        align="start"
        titleId="appearance-list-heading"
        title={t('progression.appearanceList.heading')}
        action={
          access.editContent ? (
            <NewButton
              tone="secondary"
              size="sm"
              icon={ImagePlus}
              onClick={onAdd}
              disabled={busy}
              data-testid="add-appearance"
            >
              {t('progression.appearanceList.add')}
            </NewButton>
          ) : null
        }
      />
      {appearances.length === 0 ? (
        <QuietNote>{t('progression.appearanceList.empty')}</QuietNote>
      ) : (
        <ul className="plainlist stack">
          {appearances.map((appearance, index) => (
            <AppearanceRow
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

/** One appearance on the shared row, with its own picture uploads and viewer. */
function AppearanceRow({
  canMoveEarlier,
  canMoveLater,
  onMove,
  universeId,
  entityId,
  appearance,
  busy,
  onEdit,
  onRemove,
  onPicturesChanged,
}: {
  canMoveEarlier: boolean
  canMoveLater: boolean
  onMove: (by: number) => void
  universeId: string
  entityId: string
  appearance: Appearance
  busy: boolean
  onEdit: () => void
  onRemove: () => void
  onPicturesChanged: () => void
}) {
  const access = useUniverseAccess()
  const inputId = useId()
  const { working, message, locked, add, move, remove } = useAppearanceImages({
    universeId,
    entityId,
    appearance,
    busy,
    onPicturesChanged,
  })
  const [viewing, setViewing] = useState<AppearanceImage | null>(null)

  const facts = [
    {
      name: t('progression.appearanceList.stages'),
      value: appearance.eras.map((era) => era.name).join(', '),
      testId: 'appearance-eras',
    },
    {
      name: t('progression.appearanceList.aLookOf'),
      value: appearance.forms.map((form) => form.name).join(', '),
      testId: 'appearance-forms',
    },
  ].filter((fact) => fact.value !== '')

  return (
    <ItemRow
      kind="appearance"
      name={appearance.label}
      description={appearance.notes}
      universeId={universeId}
      first={!canMoveEarlier}
      last={!canMoveLater}
      busy={locked}
      canEdit={access.editContent}
      words={{
        actions: t('progression.appearanceList.actions', { name: appearance.label }),
        edit: t('progression.appearanceList.edit'),
        remove: t('progression.appearanceList.remove'),
        scenes: t('progression.appearanceList.seenIn'),
        sceneInTrash: (title) => t('progression.appearanceList.sceneInTrash', { title }),
      }}
      facts={facts}
      scenes={appearance.scenes}
      onEdit={onEdit}
      onMove={onMove}
      onRemove={onRemove}
    >
      {message ? <FormMessage testId="appearance-message">{message}</FormMessage> : null}
      <AppearanceGallery
        universeId={universeId}
        entityId={entityId}
        appearance={appearance}
        access={access}
        inputId={inputId}
        working={working}
        locked={locked}
        add={add}
        move={move}
        remove={remove}
        setViewing={setViewing}
      />
      {viewing ? (
        <ImageViewer
          src={appearanceImageUrl(universeId, entityId, appearance.id, viewing.id, 'original')}
          name={appearance.label}
          width={viewing.width}
          height={viewing.height}
          onClose={() => setViewing(null)}
        />
      ) : null}
    </ItemRow>
  )
}

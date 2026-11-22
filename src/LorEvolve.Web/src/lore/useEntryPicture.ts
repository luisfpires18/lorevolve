import { useEffect, useRef } from 'react'
import { entityDisplayUrl, entityImageUrl } from './images'
import { useStagePictures } from '../progression/stagePictures'
import type { EntryView } from '../components/lore/EntryViewPanel'
import type { useEntryState } from './useEntryState'

/** The picture the entry shows: the main one or a stage's, and the focus back to its button once the viewer closes. */
export function useEntryPicture({
  universe,
  entityId,
  view,
  isNew,
  detail,
  isEditing,
  chosenPicture,
  isViewing,
}: ReturnType<typeof useEntryState> & {
  universe: { id: string }
  entityId: string | undefined
  view: EntryView
  isNew: boolean
  isEditing: boolean
}) {
  // Which picture the article shows: the main one, or a stage's (Progression), chosen above it.
  const stagePictures = useStagePictures(
    universe.id,
    entityId ?? '',
    view === 'article' && !isNew && !!detail?.hasProgression,
  )
  const stagePicture =
    (chosenPicture?.entityId === entityId &&
      stagePictures.find((one) => one.id === chosenPicture?.id)) ||
    null
  const mainPicture =
    detail?.image && entityId
      ? {
          src: entityDisplayUrl(universe.id, entityId, detail.image),
          // The viewer shows every pixel the author uploaded; the page draws the fitted copy.
          fullSrc: entityImageUrl(universe.id, entityId, detail.image, 'original'),
          width: detail.image.width,
          height: detail.image.height,
        }
      : null
  const picture = stagePicture ?? mainPicture ?? (isEditing ? null : (stagePictures[0] ?? null))
  const expandButton = useRef<HTMLButtonElement>(null)

  // Back to the button that opened it, once the viewer has gone - after the dialog's own close, which
  // would otherwise have the last word on where the focus lands.
  const wasViewing = useRef(false)
  useEffect(() => {
    if (wasViewing.current && !isViewing) expandButton.current?.focus()
    wasViewing.current = isViewing
  }, [isViewing])
  return { stagePictures, mainPicture, picture, expandButton }
}

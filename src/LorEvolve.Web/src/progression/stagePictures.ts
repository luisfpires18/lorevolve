import { useEffect, useState } from 'react'
import { appearanceImageUrl, getProgression } from './api'

/** One stage's picture for the article: the first picture of the first appearance that belongs to the stage. */
export interface StagePicture {
  id: string
  name: string
  src: string
  width: number
  height: number
}

/**
 * The pictures an entry's article can switch between, one per stage that has an appearance with a picture, in the stages'
 * order. Read only when the entry has a progression, and again each time the article is opened, so a picture added on
 * the Progression tab is there on return. Empty while reading and when the read fails: the article shows its main picture.
 */
export function useStagePictures(universeId: string, entityId: string, enabled: boolean) {
  const [pictures, setPictures] = useState<{ entityId: string; list: StagePicture[] }>({
    entityId,
    list: [],
  })
  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    getProgression(universeId, entityId, controller.signal)
      .then((progression) => {
        const list: StagePicture[] = []
        for (const stage of progression.eras) {
          const look = progression.appearances.find(
            (appearance) =>
              appearance.images.length > 0 && appearance.eras.some((one) => one.id === stage.id),
          )
          if (!look) continue
          const image = look.images[0]
          list.push({
            id: stage.id,
            name: stage.name,
            src: appearanceImageUrl(universeId, entityId, look.id, image.id, 'original'),
            width: image.width,
            height: image.height,
          })
        }
        setPictures({ entityId, list })
      })
      .catch(() => {})
    return () => controller.abort()
  }, [universeId, entityId, enabled])

  return enabled && pictures.entityId === entityId ? pictures.list : []
}

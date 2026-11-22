import { useState } from 'react'
import { ApiError } from '../lib/api'
import { confirmAction } from '../lib/confirm'
import { IMAGE_MAX_BYTES } from '../lib/imageCrop'
import {
  addAppearanceImage,
  orderAppearanceImages,
  removeAppearanceImage,
} from '../progression/api'
import type { Appearance, AppearanceImage } from '../progression/types'
import { t } from '../i18n'

/** An appearance's pictures: adding, ordering and deleting them, one request each, and the one in progress. */
export function useAppearanceImages({
  universeId,
  entityId,
  appearance,
  busy,
  onPicturesChanged,
}: {
  universeId: string
  entityId: string
  appearance: Appearance
  busy: boolean
  onPicturesChanged: () => void
}) {
  const [working, setWorking] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const locked = busy || working !== null

  async function run(status: string, action: () => Promise<unknown>) {
    setMessage(null)
    setWorking(status)
    try {
      await action()
    } catch (error: unknown) {
      setMessage(
        error instanceof ApiError ? error.message : t('progression.appearanceList.saveFailed'),
      )
    } finally {
      setWorking(null)
      onPicturesChanged()
    }
  }

  async function add(files: FileList | null) {
    const chosen = [...(files ?? [])]
    if (chosen.length === 0 || locked) return
    const tooBig = chosen.find((file) => file.size > IMAGE_MAX_BYTES)
    if (tooBig) {
      setMessage(t('progression.appearanceList.tooBig', { mb: IMAGE_MAX_BYTES / (1024 * 1024) }))
      return
    }
    await run(
      chosen.length === 1
        ? t('progression.appearanceList.addingOne')
        : t('progression.appearanceList.addingMany', { n: chosen.length }),
      async () => {
        for (const file of chosen)
          await addAppearanceImage(universeId, entityId, appearance.id, file)
      },
    )
  }

  async function move(image: AppearanceImage, by: number) {
    const ids = appearance.images.map((one) => one.id)
    const from = ids.indexOf(image.id)
    const to = from + by
    if (to < 0 || to >= ids.length) return
    ;[ids[from], ids[to]] = [ids[to], ids[from]]
    await run(t('progression.appearanceList.moving'), () =>
      orderAppearanceImages(universeId, entityId, appearance.id, ids),
    )
  }

  async function remove(image: AppearanceImage, index: number) {
    if (
      !(await confirmAction({
        title: t('progression.appearanceList.deleteTitle', {
          index: index + 1,
          name: appearance.label,
        }),
        message: t('progression.appearanceList.deleteMessage'),
        confirmLabel: t('progression.appearanceList.deletePicture'),
        variant: 'destructive',
      }))
    ) {
      return
    }
    await run(t('progression.appearanceList.deleting'), () =>
      removeAppearanceImage(universeId, entityId, appearance.id, image.id),
    )
  }

  return { working, message, locked, add, move, remove }
}

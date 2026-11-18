import { ApiError } from '../lib/api'
import type { ImageCrop } from '../lib/imageCrop'
import { useI18n } from '../i18n'
import type { Dispatch, SetStateAction } from 'react'
import type { SaveStage } from './ImageCropDialog'

/** What a caller that reports nothing is taken to be doing: server work, with no percentage. */
const UNREPORTED: SaveStage = { kind: 'working' }

export function cropDialogActions({
  crop,
  saving,
  setStage,
  setError,
  onConfirm,
  onCancel,
  t,
}: {
  crop: ImageCrop | null
  saving: boolean
  setStage: Dispatch<SetStateAction<SaveStage | null>>
  setError: Dispatch<SetStateAction<string | null>>
  onConfirm: (crop: ImageCrop, report: (stage: SaveStage) => void) => Promise<void>
  onCancel: () => void
  t: ReturnType<typeof useI18n>['t']
}) {
  async function confirm() {
    // The guard is the one that matters: a second press, an Enter on a still-focused button or a
    // double tap cannot start a second upload, whatever the button's disabled state is doing.
    if (!crop || saving) return

    // Held from here, so the square that is submitted is the square that was on screen when the
    // button was pressed. The stage below also makes the cropper inert, so it cannot move under
    // an upload that has already been given its four numbers.
    const submitted = crop

    setStage(UNREPORTED)
    setError(null)
    try {
      await onConfirm(submitted, setStage)
    } catch (failure: unknown) {
      setError(
        failure instanceof ApiError
          ? (failure.fieldErrors.file ?? failure.fieldErrors.crop ?? failure.message)
          : t('account.crop.saveFailed'),
      )
      setStage(null)
    }
  }

  function cancel() {
    if (!saving) onCancel()
  }
  return { confirm, cancel }
}

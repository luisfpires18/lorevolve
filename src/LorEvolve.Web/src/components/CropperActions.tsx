import { Check, X } from 'lucide-react'
import type { ImageCrop } from '../lib/imageCrop'
import { ActionIcon } from './ActionIcon'
import { useI18n } from '../i18n'

export function CropperActions({
  crop,
  saving,
  confirm,
  cancel,
  savingLabel,
  confirmLabel,
}: {
  crop: ImageCrop | null
  saving: boolean
  confirm: () => Promise<void>
  cancel: () => void
  savingLabel: string | null
  confirmLabel: string
}) {
  const { t } = useI18n()

  return (
    <footer className="cropper__actions">
      <button
        className="button"
        type="button"
        disabled={!crop || saving}
        onClick={() => void confirm()}
        data-testid="image-crop-confirm"
      >
        <ActionIcon icon={Check} />
        {savingLabel ?? confirmLabel}
      </button>
      <button
        className="button button--secondary"
        type="button"
        disabled={saving}
        onClick={cancel}
        data-testid="image-crop-cancel"
      >
        <ActionIcon icon={X} />
        {t('account.crop.cancel')}
      </button>
    </footer>
  )
}

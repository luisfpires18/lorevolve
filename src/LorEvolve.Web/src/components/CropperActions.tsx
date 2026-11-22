import { Check, X } from 'lucide-react'
import type { ImageCrop } from '../lib/imageCrop'
import { useI18n } from '../i18n'
import { Button } from './Button'

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
    <footer className="actions cropper__actions">
      <Button
        icon={Check}
        disabled={!crop || saving}
        onClick={() => void confirm()}
        data-testid="image-crop-confirm"
      >
        {savingLabel ?? confirmLabel}
      </Button>
      <Button
        tone="secondary"
        icon={X}
        disabled={saving}
        onClick={cancel}
        data-testid="image-crop-cancel"
      >
        {t('shell.actions.cancel')}
      </Button>
    </footer>
  )
}

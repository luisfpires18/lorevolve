import { useI18n } from '../i18n'
import type { SaveStage } from './ImageCropDialog'
import { FormMessage } from './FormMessage'
import { ProgressBar } from './ProgressBar'

export function CropperProgress({
  stage,
  percent,
  shownWorking,
  error,
}: {
  stage: SaveStage | null
  percent: number | null
  shownWorking: string
  error: string | null
}) {
  const { t } = useI18n()

  return (
    <>
      {stage === null ? null : (
        <div className="cropper__progress" data-testid="image-crop-progress">
          {/* Determinate while the browser can count the bytes, and indeterminate after -
                  with aria-valuenow left off rather than frozen at 100, which would claim the
                  save had finished. */}
          <ProgressBar
            label={percent === null ? shownWorking : t('account.crop.uploadingPhoto')}
            value={percent === null ? undefined : { now: percent, max: 100, text: `${percent}%` }}
            state={percent === null ? 'working' : 'sending'}
            fill={percent ?? undefined}
            testId="image-crop-progressbar"
          />

          {/* The words are the status, not the animation: a bar that only moves says nothing
                  to a screen reader, and nothing at all with reduced motion. */}
          <p className="cropper__stagetext" role="status" data-testid="image-crop-stagetext">
            {percent === null
              ? t('account.crop.workingText', { label: shownWorking })
              : t('account.crop.uploadingText', { percent })}
          </p>
        </div>
      )}

      {error ? <FormMessage testId="image-crop-error">{error}</FormMessage> : null}
    </>
  )
}

import type { FormEvent } from 'react'
import { useI18n } from '../../i18n'
import { Field } from '../Field'
import type { useRestoreBackupState } from '../../backups/useRestoreBackupState'
import { Button } from '../Button'

/** The first stage: the file field, the upload and check progress, Check and Cancel. */
export function RestoreChooseForm({
  stage,
  fileId,
  chooseError,
  setChooseError,
  setFile,
  fileInput,
  upload,
  busy,
  check,
  onCancel,
}: Pick<
  ReturnType<typeof useRestoreBackupState>,
  'stage' | 'fileId' | 'chooseError' | 'setChooseError' | 'setFile' | 'fileInput' | 'upload'
> & {
  busy: boolean
  check: (event: FormEvent<HTMLFormElement>) => Promise<void>
  onCancel: () => void
}) {
  const { t } = useI18n()

  return (
    <form className="form" onSubmit={check} noValidate>
      <Field
        label={t('admin.restore.file.label')}
        hint={t('admin.restore.file.hint')}
        id={fileId}
        error={chooseError ? <span role="alert">{chooseError}</span> : undefined}
      >
        {(control) => (
          <input
            ref={fileInput}
            id={control.id}
            className="restore__file"
            type="file"
            accept=".zip,.json,application/zip,application/json"
            aria-describedby={control['aria-describedby']}
            aria-invalid={control['aria-invalid']}
            disabled={busy}
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null)
              setChooseError(null)
            }}
            data-testid="restore-file"
          />
        )}
      </Field>

      {stage.kind === 'checking' ? (
        <div className="restore__progress" data-testid="restore-checking">
          <div
            className="progressbar"
            role="progressbar"
            aria-label={
              stage.percent === null
                ? t('admin.restore.progress.checkingLabel')
                : t('admin.restore.progress.uploadingLabel')
            }
            aria-valuemin={stage.percent === null ? undefined : 0}
            aria-valuemax={stage.percent === null ? undefined : 100}
            aria-valuenow={stage.percent ?? undefined}
            aria-valuetext={stage.percent === null ? undefined : `${stage.percent}%`}
            data-state={stage.percent === null ? 'working' : 'sending'}
          >
            <span
              className="progressbar__fill"
              style={stage.percent === null ? undefined : { width: `${stage.percent}%` }}
            />
          </div>
          <p className="restore__stage" role="status">
            {stage.percent === null
              ? t('admin.restore.progress.checking')
              : t('admin.restore.progress.uploading', { percent: stage.percent })}
          </p>
        </div>
      ) : null}

      <div className="form__actions">
        <Button type="submit" disabled={busy} data-testid="restore-check">
          {stage.kind === 'checking' ? t('admin.restore.checkBusy') : t('admin.restore.check')}
        </Button>
        <Button
          tone="secondary"
          onClick={() => (stage.kind === 'checking' ? upload.current?.abort() : onCancel())}
        >
          {t('admin.restore.cancel')}
        </Button>
      </div>
    </form>
  )
}

import type { FormEvent } from 'react'
import { useI18n } from '../../i18n'
import { Field } from '../Field'
import type { useRestoreBackupState } from '../../backups/useRestoreBackupState'
import { FormActions } from '../FormActions'
import { ProgressBar } from '../ProgressBar'

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
        error={chooseError ?? undefined}
        announce
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
          <ProgressBar
            label={
              stage.percent === null
                ? t('admin.restore.progress.checkingLabel')
                : t('admin.restore.progress.uploadingLabel')
            }
            value={
              stage.percent === null
                ? undefined
                : { now: stage.percent, max: 100, text: `${stage.percent}%` }
            }
            state={stage.percent === null ? 'working' : 'sending'}
            fill={stage.percent ?? undefined}
          />
          <p className="restore__stage" role="status">
            {stage.percent === null
              ? t('admin.restore.progress.checking')
              : t('admin.restore.progress.uploading', { percent: stage.percent })}
          </p>
        </div>
      ) : null}

      <FormActions
        submitLabel={t('admin.restore.check')}
        busy={stage.kind === 'checking'}
        busyLabel={t('admin.restore.checkBusy')}
        disabled={busy}
        submitTestId="restore-check"
        onCancel={() => (stage.kind === 'checking' ? upload.current?.abort() : onCancel())}
        inline
      />
    </form>
  )
}

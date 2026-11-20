import type { FormEvent } from 'react'
import { formatDateTime } from '../../lib/dates'
import { useI18n } from '../../i18n'
import { Field } from '../Field'
import { summaryRows } from '../../backups/summaryRows'
import type { Stage, useRestoreBackupState } from '../../backups/useRestoreBackupState'
import { Restoring } from './Restoring'
import { FormActions } from '../FormActions'

/** The checked file: what it holds, the name to restore it under, a failure, and Restore or Choose another. */
export function RestoreReadyForm({
  stage,
  name,
  setName,
  nameError,
  setNameError,
  failure,
  readyHeading,
  restore,
  chooseAnother,
}: Pick<
  ReturnType<typeof useRestoreBackupState>,
  'name' | 'setName' | 'nameError' | 'setNameError' | 'failure' | 'readyHeading'
> & {
  stage: Extract<Stage, { kind: 'ready' | 'restoring' }>
  restore: (event: FormEvent<HTMLFormElement>) => Promise<void>
  chooseAnother: () => void
}) {
  const i18n = useI18n()
  const { t } = i18n

  return (
    <form
      className="form"
      onSubmit={restore}
      noValidate
      aria-busy={stage.kind === 'restoring' || undefined}
      data-testid="restore-preview"
    >
      <div className="restore__summary">
        <h3 className="restore__heading" ref={readyHeading} tabIndex={-1}>
          {t('admin.restore.ready.heading')}
        </h3>
        <dl className="restore__facts">
          <div className="restore__fact">
            <dt>{t('admin.restore.ready.universe')}</dt>
            <dd data-testid="restore-universe-name">
              <bdi>{stage.validation.preview.universeName}</bdi>
            </dd>
          </div>
          <div className="restore__fact">
            <dt>{t('admin.restore.ready.backedUp')}</dt>
            <dd>{formatDateTime(stage.validation.preview.generatedAt)}</dd>
          </div>
          <div className="restore__fact">
            <dt>{t('admin.restore.ready.format')}</dt>
            <dd>
              {t('admin.restore.ready.version', {
                version: stage.validation.preview.formatVersion,
              })}
            </dd>
          </div>
          {summaryRows(stage.validation.preview.counts, i18n).map(([label, value]) => (
            <div className="restore__fact" key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        {stage.validation.preview.isArchived ? (
          <p className="restore__note">{t('admin.restore.ready.archived')}</p>
        ) : null}
      </div>

      <Field
        label={t('admin.restore.ready.nameLabel')}
        name="restore-name"
        requiredMark
        required
        maxLength={120}
        dir="auto"
        value={name}
        error={nameError}
        disabled={stage.kind === 'restoring'}
        onChange={(event) => {
          setName(event.target.value)
          setNameError(undefined)
        }}
      />

      {failure ? (
        <p className="form__message" role="alert" data-testid="restore-failure">
          {failure}
        </p>
      ) : null}

      {stage.kind === 'restoring' ? <Restoring /> : null}

      <FormActions
        submitLabel={t('admin.restore.ready.submit')}
        busy={stage.kind === 'restoring'}
        busyLabel={t('admin.restore.ready.submitBusy')}
        submitTestId="restore-submit"
        onCancel={chooseAnother}
        cancelLabel={t('admin.restore.ready.chooseAnother')}
        lockCancel
        inline
      />
    </form>
  )
}

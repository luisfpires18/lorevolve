import type { FormEvent } from 'react'
import { useI18n } from '../../i18n'
import { Field } from '../Field'
import { summaryRows } from '../../backups/summaryRows'
import type { Stage, useRestoreBackupState } from '../../backups/useRestoreBackupState'
import { Restoring } from './Restoring'
import { FormActions } from '../FormActions'
import { DateText } from '../DateText'
import { FormMessage } from '../FormMessage'
import { Fact } from '../Fact'
import { FactList } from '../FactList'

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
        <FactList look="grid">
          <Fact name={t('admin.restore.ready.universe')} valueTestId="restore-universe-name">
            <bdi>{stage.validation.preview.universeName}</bdi>
          </Fact>
          <Fact name={t('admin.restore.ready.backedUp')}>
            <DateText value={stage.validation.preview.generatedAt} withTime />
          </Fact>
          <Fact name={t('admin.restore.ready.format')}>
            {t('admin.restore.ready.version', {
              version: stage.validation.preview.formatVersion,
            })}
          </Fact>
          {summaryRows(stage.validation.preview.counts, i18n).map(([label, value]) => (
            <Fact name={label} key={label}>
              {value}
            </Fact>
          ))}
        </FactList>
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

      {failure ? <FormMessage testId="restore-failure">{failure}</FormMessage> : null}

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

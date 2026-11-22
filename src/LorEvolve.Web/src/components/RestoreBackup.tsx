import { useI18n } from '../i18n'
import type { UniverseDetail } from '../universes/types'
import { restoreBackupActions } from '../backups/restoreBackupActions'
import { useRestoreBackupState } from '../backups/useRestoreBackupState'
import { RestoreChooseForm } from './backups/RestoreChooseForm'
import { RestoreReadyForm } from './backups/RestoreReadyForm'
import { Button } from './Button'
import { FormActions } from './FormActions'
import { QuietNote } from './QuietNote'
import { FormMessage } from './FormMessage'

interface RestoreBackupProps {
  onCancel: () => void
  onRestored: (universe: UniverseDetail) => void
}

/**
 * Restore a backup as a new universe: choose the file, have it checked, see what it holds, name the
 * universe, restore. One panel, in place of a wizard. See ADR 0032.
 *
 * Nothing here can touch a universe that exists - there is no universe to choose, no overwrite and
 * no merge. The file goes up once; what comes back is the server's own count of what it found and a
 * token, and the restore sends only the token and the name.
 *
 * Focus follows the stage: to the preview's heading once the file is checked, to the refusal's
 * heading when it is not, to the name when the name is what is wrong. Every stage change is also
 * spoken - the progress and the busy state as status, a refusal or a failure as an alert - and no
 * state is told by colour alone.
 */
export function RestoreBackup({ onCancel, onRestored }: RestoreBackupProps) {
  const i18n = useI18n()
  const { t, tn } = i18n
  const state = useRestoreBackupState()
  const { stage, refusedHeading } = state
  const { check, chooseAnother, restore } = restoreBackupActions({ ...state, t, onRestored })

  const busy = stage.kind === 'checking' || stage.kind === 'restoring'

  return (
    <section
      className="composer restore"
      aria-label={t('admin.restore.label')}
      data-testid="restore-panel"
    >
      <h2 className="composer__title">{t('admin.restore.title')}</h2>
      <QuietNote className="restore__lead">{t('admin.restore.lead')}</QuietNote>

      {stage.kind === 'choose' || stage.kind === 'checking' ? (
        <RestoreChooseForm {...state} busy={busy} check={check} onCancel={onCancel} />
      ) : null}

      {stage.kind === 'refused' ? (
        <div className="restore__refused" role="alert" data-testid="restore-refused">
          <h3 className="restore__heading" ref={refusedHeading} tabIndex={-1}>
            {t('admin.restore.refused.heading')}
          </h3>
          <FormMessage role={null}>{stage.refusal.detail}</FormMessage>
          {stage.refusal.issues.length > 1 ? (
            <ul className="restore__issues" data-testid="restore-issues">
              {stage.refusal.issues.map((issue, index) => (
                <li key={`${issue.code}-${index}`} dir="auto">
                  {issue.message}
                </li>
              ))}
            </ul>
          ) : null}
          {stage.refusal.moreIssues > 0 ? (
            <QuietNote size="ui" className="restore__more">
              {tn('admin.restore.refused.more', stage.refusal.moreIssues, {
                n: stage.refusal.moreIssues,
              })}
            </QuietNote>
          ) : null}
          <p className="restore__note">{t('admin.restore.refused.note')}</p>
          <FormActions onCancel={onCancel} dismiss="close" inline>
            <Button tone="secondary" onClick={chooseAnother} data-testid="restore-choose-another">
              {t('admin.restore.refused.chooseAnother')}
            </Button>
          </FormActions>
        </div>
      ) : null}

      {stage.kind === 'ready' || stage.kind === 'restoring' ? (
        <RestoreReadyForm
          {...state}
          stage={stage}
          restore={restore}
          chooseAnother={chooseAnother}
        />
      ) : null}
    </section>
  )
}

import { t } from '../../i18n'
import { ConflictBar } from '../ConflictBar'

export function ScriptPartNotices({
  changed,
  failure,
  load,
}: {
  changed: boolean
  failure: string | null
  load: () => Promise<void>
}) {
  return (
    <>
      {changed ? (
        <ConflictBar
          text={t('projects.structure.changed')}
          onLoadSaved={() => void load()}
          loadLabel={t('projects.script.reload')}
          testId="project-script"
        />
      ) : null}
      {failure ? (
        <p className="form__message" role="alert" data-testid="project-script-save-failed">
          {failure}
        </p>
      ) : null}
    </>
  )
}

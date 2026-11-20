import { t } from '../../i18n'
import { ConflictBar } from '../ConflictBar'
import { FormMessage } from '../FormMessage'

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
      {failure ? <FormMessage testId="project-script-save-failed">{failure}</FormMessage> : null}
    </>
  )
}

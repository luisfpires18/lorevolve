import { t } from '../../i18n'

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
        <p className="form__message" role="alert" data-testid="project-script-changed">
          {t('projects.structure.changed')}{' '}
          <button
            className="button button--text"
            type="button"
            onClick={() => void load()}
            data-testid="project-script-reload"
          >
            {t('projects.script.reload')}
          </button>
        </p>
      ) : null}
      {failure ? (
        <p className="form__message" role="alert" data-testid="project-script-save-failed">
          {failure}
        </p>
      ) : null}
    </>
  )
}

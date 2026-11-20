import { useEffect, useState } from 'react'
import { Field } from '../Field'
import { getEpisode, saveEpisode, type ProjectEpisodeSummary } from '../../projectEntities/seasons'
import { t, useI18n } from '../../i18n'
import { FormActions } from '../FormActions'
import { errorText } from '../../lib/errorText'

/**
 * One episode's script. Read on open rather than carried by the list, and saved over the version it was read at, so a
 * save made over someone else's is refused instead of overwriting it.
 */
export function ScriptEditor({
  projectId,
  seasonId,
  episode,
  onSaved,
}: {
  projectId: string
  seasonId: string
  episode: ProjectEpisodeSummary
  onSaved: () => void
}) {
  useI18n()
  const [script, setScript] = useState<string | null>(null)
  const [title, setTitle] = useState(episode.title)
  const [synopsis, setSynopsis] = useState(episode.synopsis ?? '')
  const [version, setVersion] = useState(episode.version)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    getEpisode(projectId, seasonId, episode.id, controller.signal)
      .then((read) => {
        setScript(read.script ?? '')
        setTitle(read.title)
        setSynopsis(read.synopsis ?? '')
        setVersion(read.version)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setFailed(errorText(error, t('projects.seasons.failed')))
      })
    return () => controller.abort()
  }, [projectId, seasonId, episode.id])

  return (
    <form
      className="form"
      data-testid={`project-script-${episode.id}`}
      onSubmit={(event) => {
        event.preventDefault()
        if (saving || script === null) return
        setSaving(true)
        setFailed(null)
        saveEpisode(projectId, seasonId, episode.id, {
          title,
          synopsis: synopsis.length > 0 ? synopsis : null,
          script: script.length > 0 ? script : null,
          expectedVersion: version,
        })
          .then(onSaved)
          .catch((error: unknown) => {
            setSaving(false)
            // `ApiError`'s message is already the refusal in the reader's language (#108); the stale case gets its own
            // sentence, because what matters is that nothing was overwritten.
            const code = (error as { code?: string }).code
            setFailed(
              code === 'project_episode_changed'
                ? t('projects.seasons.scriptStale')
                : errorText(error, t('projects.seasons.failed')),
            )
          })
      }}
    >
      {failed ? (
        <p
          className="form__message"
          role="alert"
          data-testid={`project-script-failed-${episode.id}`}
        >
          {failed}
        </p>
      ) : null}

      <Field label={t('projects.seasons.episodeTitle')} requiredMark>
        {(control) => (
          <input
            {...control}
            className="field__input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            data-testid={`project-script-title-${episode.id}`}
            required
          />
        )}
      </Field>

      <Field label={t('projects.seasons.synopsis')}>
        {(control) => (
          <input
            {...control}
            className="field__input"
            value={synopsis}
            onChange={(event) => setSynopsis(event.target.value)}
            data-testid={`project-script-synopsis-${episode.id}`}
          />
        )}
      </Field>

      {/*
       * Drawn only once the stored script has arrived. Showing an empty field first and filling it in on arrival would
       * take back what the author typed in between, which the E2E spec caught doing exactly that.
       */}
      {script === null ? (
        <p className="projectcard__meta">{t('projects.common.loading')}</p>
      ) : (
        <Field
          as="textarea"
          label={t('projects.seasons.script')}
          rows={12}
          value={script}
          onChange={(event) => setScript(event.target.value)}
          data-testid={`project-script-text-${episode.id}`}
        />
      )}

      <FormActions
        submitLabel={t('projects.seasons.saveScript')}
        busy={saving}
        busyLabel={t('projects.seasons.savingScript')}
        disabled={script === null}
        submitTestId={`project-script-save-${episode.id}`}
        inline
      />
    </form>
  )
}

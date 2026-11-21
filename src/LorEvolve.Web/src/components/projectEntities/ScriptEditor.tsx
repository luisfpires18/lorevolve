import { useCallback, useEffect, useState } from 'react'
import { Field } from '../Field'
import { getEpisode, saveEpisode, type ProjectEpisodeSummary } from '../../projectEntities/seasons'
import { t, useI18n } from '../../i18n'
import { FormActions } from '../FormActions'
import { errorText } from '../../lib/errorText'
import { useAsyncRead } from '../../lib/useAsyncRead'
import { useFormSave } from '../../lib/useFormSave'
import { FormMessage } from '../FormMessage'
import { QuietNote } from '../QuietNote'

/**
 * One episode's script. Read on open rather than carried by the list, and saved over the version it was read at, so a
 * save made over someone else's is refused instead of overwriting it.
 */
export function ScriptEditor({
  projectId,
  seasonId,
  episode,
  onSaved,
  onDirtyChange,
}: {
  projectId: string
  seasonId: string
  episode: ProjectEpisodeSummary
  onSaved: () => void
  /** Told whenever the title, synopsis or script starts or stops differing from the read. */
  onDirtyChange: (dirty: boolean) => void
}) {
  useI18n()
  const [script, setScript] = useState<string | null>(null)
  const [title, setTitle] = useState(episode.title)
  const [synopsis, setSynopsis] = useState(episode.synopsis ?? '')
  // The read fills the fields: typing waits for it, so nothing typed is taken back.
  const read = useCallback(
    (signal: AbortSignal) =>
      getEpisode(projectId, seasonId, episode.id, signal).then((stored) => {
        if (!signal.aborted) {
          setScript(stored.script ?? '')
          setTitle(stored.title)
          setSynopsis(stored.synopsis ?? '')
        }
        return stored
      }),
    [projectId, seasonId, episode.id],
  )
  const { load } = useAsyncRead(read, { failed: t('projects.seasons.failed') })
  const opened =
    load.kind === 'ready'
      ? {
          title: load.value.title,
          synopsis: load.value.synopsis ?? '',
          script: load.value.script ?? '',
        }
      : null
  // `ApiError`'s message is already the refusal in the reader's language (#108); the stale case gets its own
  // sentence, because what matters is that nothing was overwritten.
  const form = useFormSave({
    needChange: null,
    failed: t('projects.seasons.failed'),
    refusal: (error) =>
      (error as { code?: string }).code === 'project_episode_changed'
        ? t('projects.seasons.scriptStale')
        : errorText(error, t('projects.seasons.failed')),
  })
  const saving = form.isSaving
  const failed = form.message ?? (load.kind === 'error' ? load.message : null)
  // Still dirty while a save runs: a save that fails keeps the draft, so closing before it ends must still ask.
  const isDirty =
    opened !== null &&
    (title !== opened.title || synopsis !== opened.synopsis || script !== opened.script)
  useEffect(() => {
    onDirtyChange(isDirty)
  }, [isDirty, onDirtyChange])

  return (
    <form
      className="form"
      data-testid={`project-script-${episode.id}`}
      onSubmit={(event) => {
        event.preventDefault()
        if (script === null || load.kind !== 'ready') return
        void form.save(() =>
          saveEpisode(projectId, seasonId, episode.id, {
            title,
            synopsis: synopsis.length > 0 ? synopsis : null,
            script: script.length > 0 ? script : null,
            expectedVersion: load.value.version,
          }).then(onSaved),
        )
      }}
    >
      {failed ? (
        <FormMessage testId={`project-script-failed-${episode.id}`}>{failed}</FormMessage>
      ) : null}

      <Field
        label={t('projects.seasons.episodeTitle')}
        requiredMark
        name={null}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        data-testid={`project-script-title-${episode.id}`}
        // Typing waits for the read, which would otherwise overwrite what was typed.
        disabled={script === null}
        required
      />

      <Field
        label={t('projects.seasons.synopsis')}
        name={null}
        value={synopsis}
        onChange={(event) => setSynopsis(event.target.value)}
        data-testid={`project-script-synopsis-${episode.id}`}
        disabled={script === null}
      />

      {/*
       * Drawn only once the stored script has arrived. Showing an empty field first and filling it in on arrival would
       * take back what the author typed in between, which the E2E spec caught doing exactly that.
       */}
      {script === null ? (
        <QuietNote spacing="flush">{t('projects.common.loading')}</QuietNote>
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

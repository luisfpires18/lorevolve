import { useState } from 'react'
import { Field } from '../Field'
import { t, useI18n } from '../../i18n'
import { FormActions } from '../FormActions'

export function EpisodeForm({
  busy,
  addLabel,
  onSubmit,
  onCancel,
}: {
  busy: boolean
  /** "Add an episode" or "Add a scene", from the project's own vocabulary. */
  addLabel: string
  onSubmit: (title: string, synopsis: string | null) => void
  onCancel: () => void
}) {
  useI18n()
  const [title, setTitle] = useState('')
  const [synopsis, setSynopsis] = useState('')

  return (
    <form
      className="form"
      data-testid="project-episode-new"
      onSubmit={(event) => {
        event.preventDefault()
        if (busy) return
        onSubmit(title, synopsis.length > 0 ? synopsis : null)
      }}
    >
      <Field label={t('projects.seasons.episodeTitle')} requiredMark>
        {(control) => (
          <input
            {...control}
            className="field__input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            data-testid="project-episode-new-title"
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
            data-testid="project-episode-new-synopsis"
          />
        )}
      </Field>
      <FormActions
        submitLabel={addLabel}
        disabled={busy}
        submitTestId="project-episode-new-save"
        onCancel={onCancel}
        cancelTestId="project-episode-new-cancel"
        inline
      />
    </form>
  )
}

import { useState, type ReactNode } from 'react'
import { Drawer } from '../Drawer'
import { Field } from '../Field'
import { t, useI18n } from '../../i18n'
import { FormActions } from '../FormActions'
import { FormMessage } from '../FormMessage'
import { errorText } from '../../lib/errorText'

/** The drawer that adds an episode, or a film's scene or a comic's chapter, to a season. */
export function EpisodeForm({
  busy,
  eyebrow,
  addLabel,
  leaveMessage,
  onSave,
  onCancel,
}: {
  /** The list is busy elsewhere, as with a move in flight. */
  busy: boolean
  /** The season the episode joins. */
  eyebrow: ReactNode
  /** "Add an episode" or "Add a scene", from the project's own vocabulary. */
  addLabel: string
  /** The leave question once a title or synopsis is typed. */
  leaveMessage: string
  /** A rejection keeps the drawer open with its message. */
  onSave: (title: string, synopsis: string | null) => Promise<unknown>
  onCancel: () => void
}) {
  useI18n()
  const [title, setTitle] = useState('')
  const [synopsis, setSynopsis] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function save() {
    if (busy || saving) return
    setSaving(true)
    setError(null)
    onSave(title, synopsis.length > 0 ? synopsis : null).catch((failure: unknown) => {
      setSaving(false)
      setError(errorText(failure, t('projects.seasons.failed')))
    })
  }

  return (
    <Drawer
      testId="project-episode-new"
      titleId="project-episode-new-heading"
      eyebrow={eyebrow}
      title={addLabel}
      isDirty={title !== '' || synopsis !== ''}
      leaveMessage={leaveMessage}
      onClose={onCancel}
      onSubmit={save}
      busy={saving}
      actions={(close) => (
        <FormActions
          submitLabel={addLabel}
          disabled={busy || saving}
          submitTestId="project-episode-new-save"
          onCancel={close}
          cancelTestId="project-episode-new-cancel"
        />
      )}
    >
      <Field
        label={t('projects.seasons.episodeTitle')}
        requiredMark
        name={null}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        data-testid="project-episode-new-title"
        required
      />
      <Field
        label={t('projects.seasons.synopsis')}
        name={null}
        value={synopsis}
        onChange={(event) => setSynopsis(event.target.value)}
        data-testid="project-episode-new-synopsis"
      />
      {error ? <FormMessage>{error}</FormMessage> : null}
    </Drawer>
  )
}

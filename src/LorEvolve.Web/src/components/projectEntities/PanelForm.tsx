import { useState, type ReactNode } from 'react'
import { Drawer } from '../Drawer'
import { Field } from '../Field'
import { EntityPicker } from '../EntityPicker'
import { t, useI18n } from '../../i18n'
import { FormActions } from '../FormActions'
import { FormMessage } from '../FormMessage'
import { errorText } from '../../lib/errorText'

/** The drawer that adds a panel to a comic page: what happens, what is said, and the lore entry it shows. */
export function PanelForm({
  busy,
  universeId,
  eyebrow,
  onSave,
  onCancel,
}: {
  /** The list is busy elsewhere, as with a move in flight. */
  busy: boolean
  universeId: string
  /** The page the panel joins. */
  eyebrow: ReactNode
  /** A rejection keeps the drawer open with its message. */
  onSave: (
    description: string | null,
    dialogue: string | null,
    canonEntityId: string | null,
  ) => Promise<unknown>
  onCancel: () => void
}) {
  useI18n()
  const [description, setDescription] = useState('')
  const [dialogue, setDialogue] = useState('')
  const [shows, setShows] = useState<{ id: string; name: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function save() {
    if (busy || saving) return
    setSaving(true)
    setError(null)
    onSave(
      description.length > 0 ? description : null,
      dialogue.length > 0 ? dialogue : null,
      shows?.id ?? null,
    ).catch((failure: unknown) => {
      setSaving(false)
      setError(errorText(failure, t('projects.pages.failed')))
    })
  }

  return (
    <Drawer
      testId="project-panel-new"
      titleId="project-panel-new-heading"
      eyebrow={eyebrow}
      title={t('projects.pages.addPanel')}
      isDirty={description !== '' || dialogue !== '' || shows !== null}
      leaveMessage={t('projects.pages.leavePanel')}
      onClose={onCancel}
      onSubmit={save}
      busy={saving}
      actions={(close) => (
        <FormActions
          submitLabel={t('projects.pages.addPanel')}
          disabled={busy || saving}
          submitTestId="project-panel-new-save"
          onCancel={close}
          cancelTestId="project-panel-new-cancel"
        />
      )}
    >
      <Field
        label={t('projects.pages.description')}
        name={null}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        data-testid="project-panel-new-description"
      />
      <Field
        as="textarea"
        label={t('projects.pages.dialogue')}
        value={dialogue}
        onChange={(event) => setDialogue(event.target.value)}
        data-testid="project-panel-new-dialogue"
      />
      {/* The lore entry this panel shows, chosen with the picker the rest of LorEvolve uses. Optional: a panel of
          scenery names nothing. */}
      <div data-testid="project-panel-new-shows">
        <EntityPicker
          label={t('projects.pages.shows')}
          universeId={universeId}
          value={shows}
          onChange={(choice) => setShows(choice ? { id: choice.id, name: choice.name } : null)}
        />
      </div>
      {error ? <FormMessage>{error}</FormMessage> : null}
    </Drawer>
  )
}

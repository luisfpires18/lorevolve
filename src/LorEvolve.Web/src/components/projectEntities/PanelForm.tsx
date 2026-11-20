import { useState } from 'react'
import { Field } from '../Field'
import { EntityPicker } from '../EntityPicker'
import { t, useI18n } from '../../i18n'
import { FormActions } from '../FormActions'
import { useDiscardGuard } from '../../lib/useDiscardGuard'

export function PanelForm({
  busy,
  universeId,
  onSubmit,
  onCancel,
}: {
  busy: boolean
  universeId: string
  onSubmit: (
    description: string | null,
    dialogue: string | null,
    canonEntityId: string | null,
  ) => void
  onCancel: () => void
}) {
  useI18n()
  const [description, setDescription] = useState('')
  const [dialogue, setDialogue] = useState('')
  const [shows, setShows] = useState<{ id: string; name: string } | null>(null)
  const { confirmLeave } = useDiscardGuard(
    (description !== '' || dialogue !== '' || shows !== null) && !busy,
    t('projects.pages.leavePanel'),
  )

  return (
    <form
      className="form"
      data-testid="project-panel-new"
      onSubmit={(event) => {
        event.preventDefault()
        if (busy) return
        onSubmit(
          description.length > 0 ? description : null,
          dialogue.length > 0 ? dialogue : null,
          shows?.id ?? null,
        )
      }}
    >
      <Field label={t('projects.pages.description')}>
        {(control) => (
          <input
            {...control}
            className="field__input"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            data-testid="project-panel-new-description"
          />
        )}
      </Field>
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

      <FormActions
        submitLabel={t('projects.pages.addPanel')}
        disabled={busy}
        submitTestId="project-panel-new-save"
        onCancel={() => void confirmLeave().then((ok) => ok && onCancel())}
        cancelTestId="project-panel-new-cancel"
        inline
      />
    </form>
  )
}

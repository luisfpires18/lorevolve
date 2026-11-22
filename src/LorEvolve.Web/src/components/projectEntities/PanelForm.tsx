import { useState, type ReactNode } from 'react'
import { Field } from '../Field'
import { EntityPicker } from '../EntityPicker'
import { SimpleFormDrawer } from '../SimpleFormDrawer'
import { t, useI18n } from '../../i18n'

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

  return (
    <SimpleFormDrawer
      testId="project-panel-new"
      titleId="project-panel-new-heading"
      eyebrow={eyebrow}
      title={t('projects.pages.addPanel')}
      isDirty={description !== '' || dialogue !== '' || shows !== null}
      leaveMessage={t('projects.pages.leavePanel')}
      submitLabel={t('projects.pages.addPanel')}
      showBusy={false}
      disabled={busy}
      submitTestId="project-panel-new-save"
      cancelTestId="project-panel-new-cancel"
      canSave={!busy}
      failed={t('projects.pages.failed')}
      onSave={() =>
        onSave(
          description.length > 0 ? description : null,
          dialogue.length > 0 ? dialogue : null,
          shows?.id ?? null,
        )
      }
      onClose={onCancel}
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
    </SimpleFormDrawer>
  )
}

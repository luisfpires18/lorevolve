import { useState } from 'react'
import { EntityPicker } from '../EntityPicker'
import { t, useI18n } from '../../i18n'
import { Button } from '../Button'
import { FormActions } from '../FormActions'

/**
 * Changes which lore entry a panel shows, with the same picker the rest of LorEvolve uses, so the search, the
 * keyboard handling and the same-universe scoping are the ones an author already knows. The API checks the entry is a
 * live lore entry of this universe as well; this is the way in, not the guarantee.
 */
export function PanelLore({
  universeId,
  panelId,
  chosen,
  busy,
  onChange,
}: {
  universeId: string
  panelId: string
  chosen: { id: string; name: string } | null
  busy: boolean
  onChange: (choice: { id: string; name: string } | null) => void
}) {
  useI18n()
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <Button
        tone="text"
        size="sm"
        disabled={busy}
        data-testid={`project-panel-shows-change-${panelId}`}
        onClick={() => setOpen(true)}
      >
        {chosen ? t('projects.pages.changeShows') : t('projects.pages.chooseShows')}
      </Button>
    )
  }

  return (
    <div data-testid={`project-panel-shows-picker-${panelId}`}>
      <EntityPicker
        label={t('projects.pages.shows')}
        universeId={universeId}
        value={chosen}
        onChange={(choice) => {
          setOpen(false)
          onChange(choice ? { id: choice.id, name: choice.name } : null)
        }}
      />
      <FormActions
        onCancel={() => setOpen(false)}
        cancelTestId={`project-panel-shows-cancel-${panelId}`}
        size="sm"
      />
    </div>
  )
}

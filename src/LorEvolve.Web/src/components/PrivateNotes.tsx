import { useState } from 'react'
import { NotebookPen } from 'lucide-react'
import { ActionIcon } from './ActionIcon'
import { useI18n } from '../i18n'
import { PrivateNoteDrawer } from './lore/PrivateNoteDrawer'

export interface PrivateNotesProps {
  universeId: string
  entityId: string
  /** The entry's name, for the drawer's heading. */
  entryName: string
}

/**
 * The owner's private note on an entry (issue 23): a Private note tool beside Family tree, opening a drawer with one plain
 * text box and an explicit Save. Drawn for the owner alone - the API refuses everyone else - and nothing is read until the
 * drawer opens, so an entry page asks for no note by default.
 *
 * Deliberately less than the article or the manuscript (owner decision): no saved versions, and no recovery copy on this
 * device - a note is confidential, and a copy in the browser's storage would be a second place it lives. What it keeps is
 * the one protection every protected save has (ADR 0043): a save names the version it was written over, a save over a
 * newer note is refused, and the owner reviews the latest before keeping or taking it.
 */
export function PrivateNotes({ universeId, entityId, entryName }: PrivateNotesProps) {
  const { t } = useI18n()
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <button
        className="button button--text"
        type="button"
        aria-haspopup="dialog"
        title={t('entity.privateNote.triggerTitle')}
        onClick={() => setIsOpen(true)}
        data-testid="private-note-trigger"
      >
        <ActionIcon icon={NotebookPen} />
        <span className="entry__toollabel">{t('entity.privateNote.triggerLabel')}</span>
      </button>

      {isOpen ? (
        <PrivateNoteDrawer
          key={entityId}
          universeId={universeId}
          entityId={entityId}
          entryName={entryName}
          onClose={() => setIsOpen(false)}
        />
      ) : null}
    </>
  )
}

import { QuickCreateDialog } from '../QuickCreateDialog'
import { useI18n } from '../../i18n'
import type { EntityChoice, QuickCreateOptions } from '../EntityPicker'
import { QuietNote } from '../QuietNote'

/** What Quick Create adds under a picker: the note on the entry it just made, and its form while it is open. */
export function EntityPickerCreate({
  universeId,
  quickCreate,
  noteId,
  note,
  creating,
  entityTypeId,
  entityTypeGroupId,
  finishCreate,
}: {
  universeId: string
  quickCreate: QuickCreateOptions | null
  noteId: string
  note: EntityChoice | null
  creating: string | null
  entityTypeId: string | null
  entityTypeGroupId: string | null
  finishCreate: (choice: EntityChoice | null, wasCreated: boolean) => void
}) {
  const { t, tx } = useI18n()
  return (
    <>
      {quickCreate ? (
        // Announced as it appears: the entry exists now, the choice does not until the form it sits in is saved.
        <QuietNote
          className="picker__created"
          size="ui"
          wrap
          testId="picker-created"
          id={noteId}
          role="status"
        >
          {note ? (
            <>
              {tx('entity.picker.created', {
                name: <bdi>{note.name}</bdi>,
                hint: quickCreate.keepHint,
                link: (
                  <a
                    href={`/app/universes/${universeId}/lore/${note.id}`}
                    target="_blank"
                    rel="noopener"
                    data-testid="picker-created-open"
                  >
                    {t('entity.picker.openFull')}
                  </a>
                ),
              })}
            </>
          ) : null}
        </QuietNote>
      ) : null}

      {creating !== null && quickCreate ? (
        <QuickCreateDialog
          universeId={universeId}
          initialName={creating}
          entityTypeId={entityTypeId}
          entityTypeGroupId={entityTypeGroupId}
          chronology={quickCreate.chronology}
          onCreated={(choice) => finishCreate(choice, true)}
          onChooseExisting={(choice) => finishCreate(choice, false)}
          onCancel={() => finishCreate(null, false)}
        />
      ) : null}
    </>
  )
}

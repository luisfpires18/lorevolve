import { addProjectField, deleteProjectField } from '../../projectEntities/api'
import { confirmAction } from '../../lib/confirm'
import type { ProjectEntityType } from '../../projectEntities/types'
import { ActionMenu } from '../ActionMenu'
import { t, useI18n } from '../../i18n'
import type { Dispatch, SetStateAction } from 'react'
import { FieldForm } from '../FieldForm'
import { FIELD_KIND_LABELS } from '../../lore/fieldKinds'
import { NewButton } from '../NewButton'
import { Trash } from 'lucide-react'
import { ActionIcon } from '../ActionIcon'

/** A type's open field list: the fields it hands down, its own, and the form to add one. */
export function SchemaTypeFields({
  projectId,
  busy,
  setBusy,
  openTypeId,
  addingFieldTo,
  setAddingFieldTo,
  refresh,
  failing,
  type,
  id,
}: {
  projectId: string
  busy: boolean
  setBusy: Dispatch<SetStateAction<boolean>>
  openTypeId: string | null
  addingFieldTo: string | null
  setAddingFieldTo: Dispatch<SetStateAction<string | null>>
  refresh: () => void
  failing: (error: unknown) => void
  type: ProjectEntityType
  /** The open panel's id, which the row's Fields button names in `aria-controls`. */
  id?: string
}) {
  useI18n()

  return (
    <>
      {openTypeId === type.id ? (
        <div id={id} className="types__fields" data-testid={`project-type-fields-panel-${type.id}`}>
          {type.fields.length === 0 && type.inheritedFields.length === 0 ? (
            <p className="projectcard__meta">{t('projects.schema.noFields')}</p>
          ) : (
            /* The same rows the lore types screen draws for a type's fields, because they are the same thing:
                       what the type above hands down first, quieter, then this type's own. */
            <>
              {type.inheritedFields.length > 0 ? (
                <div className="fieldlist__inherited">
                  {/* Inherited fields are shown and not editable here: they are defined once, on the type above. */}
                  <ul className="fieldlist">
                    {type.inheritedFields.map((field) => (
                      <li
                        key={field.id}
                        className="fieldlist__row"
                        data-testid={`project-field-inherited-${field.id}`}
                      >
                        <span className="fieldlist__text">
                          <span className="fieldlist__name">{field.name}</span>
                          <span className="fieldlist__meta">{FIELD_KIND_LABELS[field.kind]}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <ul className="fieldlist" data-testid={`project-type-fields-${type.id}`}>
                {type.fields.map((field) => (
                  <li key={field.id} className="fieldlist__row">
                    <span className="fieldlist__text">
                      <span className="fieldlist__name">{field.name}</span>
                      <span className="fieldlist__meta">{FIELD_KIND_LABELS[field.kind]}</span>
                    </span>
                    <div className="fieldlist__actions">
                      <ActionMenu
                        label={t('projects.common.more', { name: field.name })}
                        triggerTestId={`project-field-actions-${field.id}`}
                      >
                        <button
                          className="actionmenu__item actionmenu__item--danger"
                          type="button"
                          disabled={busy}
                          data-testid={`project-field-delete-${field.id}`}
                          onClick={async () => {
                            const confirmed = await confirmAction({
                              title: t('entityTypes.fields.deleteTitle', { name: field.name }),
                              message: t('entityTypes.fields.deleteMessage'),
                              confirmLabel: t('entityTypes.fields.deleteConfirm'),
                              variant: 'destructive',
                            })
                            if (!confirmed) return
                            setBusy(true)
                            deleteProjectField(projectId, type.id, field.id)
                              .then(refresh)
                              .catch(failing)
                          }}
                        >
                          <ActionIcon icon={Trash} />
                          {t('projects.schema.deleteField')}
                        </button>
                      </ActionMenu>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}

          {addingFieldTo === type.id ? (
            <FieldForm
              busy={busy}
              onCancel={() => setAddingFieldTo(null)}
              onSubmit={(input) => {
                setBusy(true)
                addProjectField(projectId, type.id, input)
                  .then(() => {
                    setAddingFieldTo(null)
                    refresh()
                  })
                  .catch(failing)
              }}
            />
          ) : (
            <NewButton
              tone="secondary"
              size="sm"
              data-testid={`project-field-add-${type.id}`}
              onClick={() => setAddingFieldTo(type.id)}
            >
              {t('projects.schema.addField')}
            </NewButton>
          )}
        </div>
      ) : null}
    </>
  )
}

import { addProjectField, deleteProjectField } from '../../projectEntities/api'
import type { ProjectEntityType } from '../../projectEntities/types'
import { ActionMenu } from '../ActionMenu'
import { t, useI18n } from '../../i18n'
import type { Dispatch, SetStateAction } from 'react'
import { FieldForm, kindLabel } from '../FieldForm'

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
}) {
  useI18n()

  return (
    <>
      {openTypeId === type.id ? (
        <div className="types__fields" data-testid={`project-type-fields-panel-${type.id}`}>
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
                          <span className="fieldlist__meta">{kindLabel(field.kind)}</span>
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
                      <span className="fieldlist__meta">{kindLabel(field.kind)}</span>
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
                          onClick={() => {
                            setBusy(true)
                            deleteProjectField(projectId, type.id, field.id)
                              .then(refresh)
                              .catch(failing)
                          }}
                        >
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
            <button
              className="button button--text button--sm"
              type="button"
              data-testid={`project-field-add-${type.id}`}
              onClick={() => setAddingFieldTo(type.id)}
            >
              {t('projects.schema.addField')}
            </button>
          )}
        </div>
      ) : null}
    </>
  )
}

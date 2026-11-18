import { useEffect } from 'react'
import { t, useI18n } from '../i18n'
import { useUniverseAccess } from '../universes/access'
import { listRelationshipTypes } from '../relationships/api'
import { BLANK, ORDER_KEY } from '../relationships/typeDraft'
import { typeManagerActions } from '../relationships/typeManagerActions'
import { useTypeManagerState } from '../relationships/useTypeManagerState'
import { KindForm } from './relationships/KindForm'
import { KindRow } from './relationships/KindRow'

export function RelationshipTypeManager({ universeId }: { universeId: string }) {
  useI18n() // Re-render when the language changes; the module's `t` reads the new one.
  const access = useUniverseAccess()
  const state = useTypeManagerState()
  const {
    types,
    setTypes,
    editingId,
    setEditingId,
    isAdding,
    setIsAdding,
    draft,
    setDraft,
    fieldErrors,
    setFieldErrors,
    message,
    setMessage,
    isSaving,
  } = state

  useEffect(() => {
    const controller = new AbortController()
    listRelationshipTypes(universeId, controller.signal)
      .then(setTypes)
      .catch(() => {
        if (controller.signal.aborted) return
        setTypes([])
        setMessage(t('relationships.types.loadFailed'))
      })
    return () => {
      controller.abort()
    }
  }, [universeId])

  const { close, save, remove, edit } = typeManagerActions({ ...state, universeId })

  const orderError = fieldErrors[ORDER_KEY]

  const form = (
    <KindForm
      draft={draft}
      edit={edit}
      fieldErrors={fieldErrors}
      orderError={orderError}
      isSaving={isSaving}
      editingId={editingId}
      save={save}
      close={close}
    />
  )

  if (!types) {
    return (
      <p className="notice" role="status">
        {t('relationships.types.reading')}
      </p>
    )
  }

  return (
    <section className="reltypes" aria-labelledby="reltypes-heading">
      <div className="relations__head">
        <h2 className="settings__heading" id="reltypes-heading">
          {t('relationships.types.heading')}
        </h2>
        {access.editContent && !isAdding && !editingId ? (
          <button
            className="button button--secondary"
            type="button"
            onClick={() => {
              setMessage(null)
              setFieldErrors({})
              setEditingId(null)
              setDraft(BLANK)
              setIsAdding(true)
            }}
            data-testid="add-relationship-type"
          >
            {t('relationships.types.addKind')}
          </button>
        ) : null}
      </div>

      <p className="settings__note">{t('relationships.types.intro')}</p>

      {message ? (
        <p className="form__message" role="alert" data-testid="reltype-error">
          {message}
        </p>
      ) : null}

      {isAdding ? form : null}

      {types.length === 0 && !isAdding ? (
        <p className="relations__quiet" data-testid="reltypes-empty">
          {t('relationships.types.empty')}
        </p>
      ) : (
        <ul className="types__list" data-testid="relationship-type-list">
          {types.map((type) => {
            if (editingId === type.id) {
              return (
                <li className="types__row" key={type.id}>
                  {form}
                </li>
              )
            }

            return (
              <KindRow
                key={type.id}
                type={type}
                access={access}
                remove={remove}
                setMessage={setMessage}
                setFieldErrors={setFieldErrors}
                setIsAdding={setIsAdding}
                setEditingId={setEditingId}
                setDraft={setDraft}
              />
            )
          })}
        </ul>
      )}
    </section>
  )
}

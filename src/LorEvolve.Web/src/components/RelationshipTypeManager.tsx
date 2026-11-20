import { useEffect } from 'react'
import { t, useI18n } from '../i18n'
import { useUniverseAccess } from '../universes/access'
import { listRelationshipTypes } from '../relationships/api'
import { BLANK, ORDER_KEY } from '../relationships/typeDraft'
import { typeManagerActions } from '../relationships/typeManagerActions'
import { useTypeManagerState } from '../relationships/useTypeManagerState'
import { KindForm } from './relationships/KindForm'
import { KindRow } from './relationships/KindRow'
import { TypeRow } from './TypeRow'
import { NewButton } from './NewButton'
import { LoadingNote } from './LoadingNote'
import { SectionTitle } from './Section'
import { FormMessage } from './FormMessage'

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
    return <LoadingNote>{t('relationships.types.reading')}</LoadingNote>
  }

  return (
    <section className="reltypes" aria-labelledby="reltypes-heading">
      <div className="relations__head">
        <SectionTitle id="reltypes-heading">{t('relationships.types.heading')}</SectionTitle>
        {access.editContent && !isAdding && !editingId ? (
          <NewButton
            tone="secondary"
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
          </NewButton>
        ) : null}
      </div>

      <p className="settings__note">{t('relationships.types.intro')}</p>

      {message ? <FormMessage testId="reltype-error">{message}</FormMessage> : null}

      {isAdding ? form : null}

      {types.length === 0 && !isAdding ? (
        <p className="relations__quiet" data-testid="reltypes-empty">
          {t('relationships.types.empty')}
        </p>
      ) : (
        <ul className="types__list" data-testid="relationship-type-list">
          {types.map((type) => {
            if (editingId === type.id) {
              return <TypeRow key={type.id} name={type.name} head={form} />
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

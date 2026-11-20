import { useI18n } from '../i18n'
import { useUniverseAccess } from '../universes/access'
import { useDiscardGuard } from '../lib/useDiscardGuard'
import type { EraChoice } from './RelationshipPeriodsField'
import { hasCalendar, namesEras } from '../chronology/format'
import type { Chronology } from '../chronology/types'
import { chronologyOf } from '../stories/sceneDraft'
import { labelChoices } from '../relationships/types'
import { choiceKey, draftKey } from '../relationships/relationDraft'
import { relationActions } from '../relationships/relationActions'
import { useRelationsRead } from '../relationships/useRelationsRead'
import { useRelationsState } from '../relationships/useRelationsState'
import { RelationForm } from './relationships/RelationForm'
import { NewButton } from './NewButton'
import { PanelHead } from './PanelHead'
import { RelationsList } from './relationships/RelationsList'
import { RelationsWhen } from './relationships/RelationsWhen'
import { LoadError } from './LoadError'

interface RelationshipSectionProps {
  universeId: string
  entityId: string
  entityName: string
  /** How the universe keeps time, for a relation's periods (Issue #18), and Quick Create's required fields (Issue #25). */
  chronology: Chronology
}

export function RelationshipSection({
  universeId,
  entityId,
  entityName,
  chronology,
}: RelationshipSectionProps) {
  const { t, tx } = useI18n()
  const access = useUniverseAccess()
  const state = useRelationsState()
  const {
    views,
    types,
    editingId,
    isAdding,
    draft,
    fieldErrors,
    message,
    isSaving,
    opened,
    erasOf,
    readError,
    whenStatus,
    whenOpen,
    when,
    setWhen,
    shownAt,
    setShownAt,
  } = state
  const reckonsInEras = namesEras(chronology)
  const custom = hasCalendar(chronology)

  const isDirty = draft !== null && draftKey(draft) !== opened
  const { confirmLeave } = useDiscardGuard(isDirty, t('relationships.section.leave'))

  const at = shownAt ? chronologyOf(shownAt, reckonsInEras, custom) : null
  const whenReady =
    when !== null && when.year.trim() !== '' && (!reckonsInEras || when.eraId !== '')

  const { load, relatedId } = useRelationsRead({ ...state, universeId, entityId, at, t })
  const { close, mayDiscard, openAdd, openEdit, save, remove, edit } = relationActions({
    ...state,
    universeId,
    entityId,
    confirmLeave,
    reckonsInEras,
    custom,
    load,
    t,
    tx,
  })

  const choices = labelChoices(types)

  // A symmetric kind offers one reading only, so a link stored with this entry as the
  // target still points at that single option rather than falling back to the first kind
  // in the list.
  const readingValue = draft
    ? choiceKey(
        draft.typeId,
        draft.useInverse && !types.find((type) => type.id === draft.typeId)?.isSymmetric,
      )
    : ''

  // Each end's eras, named now - this entry's and the one the relation connects to.
  const ends = [entityId, ...(relatedId ? [relatedId] : [])]
  const eraChoices: EraChoice[] = ends.flatMap((id) =>
    (erasOf[id]?.eras ?? []).map((era) => ({
      id: era.id,
      label: `${era.name} (${id === entityId ? entityName || t('relationships.section.thisEntry') : (draft?.related?.name ?? '')})`,
    })),
  )

  const form = draft ? (
    <RelationForm
      draft={draft}
      types={types}
      entityName={entityName}
      entityId={entityId}
      universeId={universeId}
      chronology={chronology}
      access={access}
      fieldErrors={fieldErrors}
      choices={choices}
      readingValue={readingValue}
      eraChoices={eraChoices}
      ends={ends}
      erasOf={erasOf}
      isSaving={isSaving}
      editingId={editingId}
      save={save}
      mayDiscard={mayDiscard}
      close={close}
      edit={edit}
    />
  ) : null

  return (
    <section className="relations" aria-labelledby="relations-heading">
      <PanelHead
        look="display"
        titleId="relations-heading"
        title={t('relationships.section.heading')}
        action={
          access.editContent && types.length > 0 && !isAdding && !editingId ? (
            <NewButton tone="secondary" onClick={openAdd} data-testid="add-relationship">
              {t('relationships.section.add')}
            </NewButton>
          ) : null
        }
      />

      {(message ?? readError) ? (
        <LoadError
          message={message ?? readError}
          onRetry={readError && !message ? () => void load() : undefined}
          retryLabel={t('relationships.section.retry')}
          testId="relationship-error"
        />
      ) : null}

      <RelationsWhen
        chronology={chronology}
        reckonsInEras={reckonsInEras}
        when={when}
        setWhen={setWhen}
        shownAt={shownAt}
        setShownAt={setShownAt}
        whenOpen={whenOpen}
        whenStatus={whenStatus}
        whenReady={whenReady}
        at={at}
      />

      {isAdding ? form : null}

      <RelationsList
        views={views}
        types={types}
        isAdding={isAdding}
        editingId={editingId}
        shownAt={shownAt}
        readError={readError}
        universeId={universeId}
        chronology={chronology}
        access={access}
        form={form}
        openEdit={openEdit}
        remove={remove}
      />
    </section>
  )
}

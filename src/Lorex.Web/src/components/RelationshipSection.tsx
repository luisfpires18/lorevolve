import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useUniverseAccess } from '../universes/access'
import { EntityPicker } from './EntityPicker'
import { ApiError } from '../lib/api'
import { payloadKey } from '../lib/drawerGuard'
import { useLeaveGuard } from '../lib/leaveGuard'
import { formatSpan } from '../lib/dates'
import { ChronologyPointFields, type ChronologyPointDraft } from './ChronologyPointFields'
import { RelationshipPeriodsField, type EraChoice } from './RelationshipPeriodsField'
import { formatChronologyPoint, hasCalendar, namesEras } from '../chronology/format'
import type { Chronology } from '../chronology/types'
import { getProgression } from '../progression/api'
import { periodDrafts, periodInputs, periodText, type PeriodDraft } from '../relationships/periods'
import { chronologyOf, EMPTY_POINT } from '../stories/sceneDraft'
import {
  createRelationship,
  deleteRelationship,
  listEntityRelationships,
  listRelationshipTypes,
  updateRelationship,
} from '../relationships/api'
import {
  Perspective,
  Validity,
  labelChoices,
  type RelationshipType,
  type RelationshipView,
} from '../relationships/types'
import { CANON_LABELS, CANON_ORDER, CanonStatus, type CanonStatusValue } from '../lore/types'
import { StatusBadge } from './StatusBadge'
import { ActionIcon } from './ActionIcon'
import { ActionMenu } from './ActionMenu'
import { EntityTile } from './EntityTile'
import { Pencil, Plus, Trash } from 'lucide-react'
import { confirmAction, confirmDiscard } from '../lib/confirm'

interface RelationDraft {
  typeId: string
  /** True when the entry being edited is on the receiving side of the wording. */
  useInverse: boolean
  related: { id: string; name: string } | null
  canonStatus: CanonStatusValue
  /** The older real-world dates (Issue #18): sent back exactly as read, or cleared - never typed any more. */
  legacyStart: string | null
  legacyEnd: string | null
  notes: string
  periods: PeriodDraft[]
}

interface RelationshipSectionProps {
  universeId: string
  entityId: string
  entityName: string
  /** How the universe keeps time, for a relation's periods (Issue #18). */
  chronology: Chronology
}

/** A draft as it would be saved, for telling whether anything changed since the form opened. */
function draftKey(draft: RelationDraft) {
  return payloadKey({
    ...draft,
    related: draft.related?.id ?? null,
    notes: draft.notes.trim(),
    periods: draft.periods.map(({ key: _key, ...period }) => period),
  })
}

function choiceKey(typeId: string, useInverse: boolean) {
  return `${typeId}:${useInverse ? 'inverse' : 'forward'}`
}

/** How a link reads from the side of the entry being edited. */
function labelFor(types: RelationshipType[], typeId: string, useInverse: boolean) {
  const type = types.find((candidate) => candidate.id === typeId)
  if (!type) return ''
  return useInverse && !type.isSymmetric ? (type.inverseName ?? type.name) : type.name
}

/**
 * The links in the order they came, gathered under how each reads from this entry - "Child of",
 * "Member of" - so a reading is said once above its entries rather than beside every one. Grouped by
 * the words shown, never by what a kind is called.
 */
function byReading(views: RelationshipView[]) {
  const groups = new Map<string, RelationshipView[]>()
  for (const view of views) {
    const group = groups.get(view.label)
    if (group) group.push(view)
    else groups.set(view.label, [view])
  }
  return [...groups.entries()]
}

function draftFromView(view: RelationshipView): RelationDraft {
  return {
    typeId: view.relationshipTypeId,
    useInverse: view.perspective === Perspective.Inverse,
    related: { id: view.relatedEntityId, name: view.relatedEntityName },
    canonStatus: view.canonStatus,
    legacyStart: view.startDate,
    legacyEnd: view.endDate,
    notes: view.notes ?? '',
    periods: periodDrafts(view.periods ?? []),
  }
}

export function RelationshipSection({
  universeId,
  entityId,
  entityName,
  chronology,
}: RelationshipSectionProps) {
  const access = useUniverseAccess()
  const [views, setViews] = useState<RelationshipView[] | null>(null)
  const [types, setTypes] = useState<RelationshipType[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [draft, setDraft] = useState<RelationDraft | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [opened, setOpened] = useState<string | null>(null)
  // The eras each end of a relation being edited has, read when the form needs them (Issue #18).
  const [erasOf, setErasOf] = useState<
    Record<
      string,
      { status: 'loading' | 'loaded' | 'failed'; eras: { id: string; name: string }[] }
    >
  >({})
  const [readError, setReadError] = useState<string | null>(null)
  const whenStatus = useRef<HTMLParagraphElement>(null)
  const whenOpen = useRef<HTMLButtonElement>(null)
  // A time the list is read at, when the author asked: only the relations that hold then.
  const [when, setWhen] = useState<ChronologyPointDraft | null>(null)
  const [shownAt, setShownAt] = useState<ChronologyPointDraft | null>(null)
  const reckonsInEras = namesEras(chronology)
  const custom = hasCalendar(chronology)

  const isDirty = draft !== null && draftKey(draft) !== opened
  useLeaveGuard(isDirty ? 'This relation has unsaved changes. Leave without saving it?' : null)

  const at = shownAt ? chronologyOf(shownAt, reckonsInEras, custom) : null
  const whenReady =
    when !== null && when.year.trim() !== '' && (!reckonsInEras || when.eraId !== '')

  const load = useCallback(
    (signal?: AbortSignal) =>
      Promise.all([
        listEntityRelationships(universeId, entityId, signal, at ? { at } : undefined),
        listRelationshipTypes(universeId, signal),
      ])
        .then(([loadedViews, loadedTypes]) => {
          setViews(loadedViews)
          setTypes(loadedTypes)
          setReadError(null)
        })
        .catch(() => {
          if (signal?.aborted) return
          // A failed read at a time keeps what was shown; a failed first read has nothing to keep.
          setViews((current) => current ?? [])
          setReadError(
            at
              ? 'The relations at that time could not be read. Check the date and try again.'
              : 'The relations could not be read.',
          )
        }),
    // `at` is rebuilt every render from what was shown; its text is what decides.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [universeId, entityId, JSON.stringify(at)],
  )

  // The eras of this entry and of the entry the relation connects to, read once each.
  const relatedId = draft?.related?.id ?? null
  useEffect(() => {
    if (!draft) return
    const controller = new AbortController()
    for (const id of [entityId, relatedId]) {
      if (!id || erasOf[id]?.status === 'loaded' || erasOf[id]?.status === 'loading') continue
      setErasOf((current) => ({ ...current, [id]: { status: 'loading', eras: [] } }))
      getProgression(universeId, id, controller.signal)
        .then((progression) =>
          setErasOf((current) => ({
            ...current,
            [id]: {
              status: 'loaded',
              eras: progression.eras.map((era) => ({ id: era.id, name: era.name })),
            },
          })),
        )
        .catch(() => {
          if (!controller.signal.aborted)
            setErasOf((current) => ({ ...current, [id]: { status: 'failed', eras: [] } }))
        })
    }
    return () => controller.abort()
    // Read again only for an entry not read yet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [universeId, entityId, relatedId, draft !== null])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => {
      controller.abort()
    }
  }, [load])

  function close() {
    setIsAdding(false)
    setEditingId(null)
    setDraft(null)
    setFieldErrors({})
  }

  /** Cancel, or opening another relation over this one: asks once, only when there is something to lose. */
  async function mayDiscard() {
    return !isDirty || (await confirmDiscard())
  }

  function begin(next: RelationDraft) {
    setDraft(next)
    setOpened(draftKey(next))
  }

  async function openAdd() {
    if (types.length === 0 || !(await mayDiscard())) return
    setMessage(null)
    setFieldErrors({})
    setEditingId(null)
    setIsAdding(true)
    begin({
      typeId: types[0].id,
      useInverse: false,
      related: null,
      canonStatus: CanonStatus.Idea,
      legacyStart: null,
      legacyEnd: null,
      notes: '',
      periods: [],
    })
  }

  async function openEdit(view: RelationshipView) {
    if (!(await mayDiscard())) return
    setMessage(null)
    setFieldErrors({})
    setIsAdding(false)
    setEditingId(view.id)
    begin(draftFromView(view))
  }

  async function save() {
    if (!draft) return

    if (!draft.related) {
      setFieldErrors({ targetentityid: 'Choose the entry this connects to.' })
      return
    }

    setMessage(null)
    setFieldErrors({})
    setIsSaving(true)

    // The stored row always runs source to target. Which end this entry sits on comes
    // from the wording the author picked, so no source/target vocabulary reaches them.
    const input = {
      relationshipTypeId: draft.typeId,
      sourceEntityId: draft.useInverse ? draft.related.id : entityId,
      targetEntityId: draft.useInverse ? entityId : draft.related.id,
      canonStatus: draft.canonStatus,
      startDate: draft.legacyStart,
      endDate: draft.legacyEnd,
      notes: draft.notes.trim() ? draft.notes.trim() : null,
      periods: periodInputs(draft.periods, reckonsInEras, custom),
    }

    try {
      if (editingId) {
        await updateRelationship(universeId, editingId, input)
      } else {
        await createRelationship(universeId, input)
      }
      close()
      await load()
    } catch (error: unknown) {
      if (error instanceof ApiError) {
        setFieldErrors(error.fieldErrors)
        setMessage(
          Object.keys(error.fieldErrors).length === 0
            ? error.message
            : 'Some details need a change before this can be saved.',
        )
      } else {
        setMessage('That relation could not be saved.')
      }
    } finally {
      setIsSaving(false)
    }
  }

  async function remove(view: RelationshipView) {
    setMessage(null)
    const removed = await confirmAction({
      title: (
        <>
          Move “<bdi>{view.label}</bdi> <bdi>{view.relatedEntityName}</bdi>” to the Trash?
        </>
      ),
      message: 'You can restore it from the Trash.',
      confirmLabel: 'Move to Trash',
      busyLabel: 'Moving…',
      variant: 'warning',
      failure: 'That relation could not be removed.',
      action: () => deleteRelationship(universeId, view.id),
    })
    if (!removed) return
    if (editingId === view.id) close()
    await load()
  }

  const choices = labelChoices(types)

  /** Every edit merges into the latest draft, so two changes in one tick cannot drop one. */
  function edit(change: Partial<RelationDraft>) {
    setDraft((current) => (current ? { ...current, ...change } : current))
  }

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
      label: `${era.name} (${id === entityId ? entityName || 'this entry' : (draft?.related?.name ?? '')})`,
    })),
  )

  const form = draft ? (
    <div className="relform" data-testid="relationship-form">
      <p className="relform__reads" data-testid="relationship-preview">
        <span className="relform__subject">{entityName || 'This entry'}</span>{' '}
        <span className="relform__verb">{labelFor(types, draft.typeId, draft.useInverse)}</span>{' '}
        <span className="relform__object">{draft.related?.name ?? '…'}</span>
      </p>

      <div className="relform__grid">
        <div className="field">
          <label className="field__label" htmlFor="relation-reading">
            Reading
          </label>
          <select
            id="relation-reading"
            className="field__input field__input--select"
            value={readingValue}
            onChange={(event) => {
              const chosen = choices.find((choice) => choice.key === event.target.value)
              if (chosen) {
                edit({ typeId: chosen.typeId, useInverse: chosen.useInverse })
              }
            }}
            data-testid="relationship-reading"
          >
            {choices.map((choice) => (
              <option key={choice.key} value={choice.key}>
                {choice.label}
              </option>
            ))}
          </select>
          {fieldErrors.relationshiptypeid ? (
            <p className="field__error">{fieldErrors.relationshiptypeid}</p>
          ) : null}
        </div>

        <EntityPicker
          label="Connected to"
          universeId={universeId}
          value={draft.related}
          onChange={(related) => edit({ related })}
          excludeId={entityId}
          error={fieldErrors.targetentityid ?? fieldErrors.sourceentityid}
        />

        <div className="field">
          <span className="field__label">Status</span>
          <div className="canon" role="group" aria-label="Relation status">
            {CANON_ORDER.map((option) => (
              <button
                key={option}
                type="button"
                className="canon__step"
                aria-pressed={draft.canonStatus === option}
                onClick={() => edit({ canonStatus: option })}
                data-testid={`relation-canon-${CANON_LABELS[option].toLowerCase()}`}
              >
                {CANON_LABELS[option]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <RelationshipPeriodsField
        chronology={chronology}
        eras={eraChoices}
        erasReading={ends.some((id) => erasOf[id]?.status === 'loading')}
        erasFailed={ends.some((id) => erasOf[id]?.status === 'failed')}
        value={draft.periods}
        onChange={(periods) => edit({ periods })}
        errors={fieldErrors}
      />

      {/* The real-world dates a relation could carry before it could be placed in the universe's own time: kept, shown and
          clearable, never typed any more (Issue #18). */}
      {draft.legacyStart || draft.legacyEnd ? (
        <div className="field relform__legacy" data-testid="relation-legacy-dates">
          <span className="field__label">Real-world dates</span>
          <p className="field__hint">
            {formatSpan(draft.legacyStart, draft.legacyEnd)}. Recorded before relations could be
            placed in this universe&rsquo;s own time.
          </p>
          <button
            type="button"
            className="button button--secondary button--sm"
            onClick={() => edit({ legacyStart: null, legacyEnd: null })}
            data-testid="relation-legacy-clear"
          >
            Clear real-world dates
          </button>
          {fieldErrors.enddate ? <p className="field__error">{fieldErrors.enddate}</p> : null}
        </div>
      ) : null}

      <div className="field">
        <label className="field__label" htmlFor="relation-notes">
          Notes
        </label>
        <textarea
          id="relation-notes"
          className="entry__summaryinput"
          rows={2}
          placeholder="What is worth remembering about this connection."
          value={draft.notes}
          onChange={(event) => edit({ notes: event.target.value })}
          data-testid="relation-notes"
        />
        {fieldErrors.notes ? <p className="field__error">{fieldErrors.notes}</p> : null}
      </div>

      <div className="relform__actions">
        <button
          className="button"
          type="button"
          onClick={save}
          disabled={isSaving}
          data-testid="save-relationship"
        >
          {isSaving ? 'Saving' : editingId ? 'Save relation' : 'Add relation'}
        </button>
        <button
          className="button button--secondary"
          type="button"
          onClick={() => {
            void mayDiscard().then((discarding) => discarding && close())
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  ) : null

  return (
    <section className="relations" aria-labelledby="relations-heading">
      <div className="relations__head">
        <h2 className="relations__title" id="relations-heading">
          Relations
        </h2>
        {access.editContent && types.length > 0 && !isAdding && !editingId ? (
          <button
            className="button button--secondary"
            type="button"
            onClick={openAdd}
            data-testid="add-relationship"
          >
            <ActionIcon icon={Plus} />
            Add relation
          </button>
        ) : null}
      </div>

      {(message ?? readError) ? (
        <p className="form__message" role="alert" data-testid="relationship-error">
          {message ?? readError}
        </p>
      ) : null}

      {/* Which relations hold at one time (Issue #18): the universe's own date, as precise as wanted. */}
      <div className="relwhen" data-testid="relations-when">
        {when === null ? (
          <button
            ref={whenOpen}
            type="button"
            className="linkbutton"
            onClick={() => setWhen(shownAt ?? EMPTY_POINT)}
            data-testid="relations-when-open"
          >
            {shownAt ? 'Change the time' : 'Show the relations at a time'}
          </button>
        ) : (
          <form
            className="relwhen__form"
            onSubmit={(event) => {
              event.preventDefault()
              if (!whenReady) return
              setShownAt(when)
              setWhen(null)
              requestAnimationFrame(() => whenStatus.current?.focus())
            }}
          >
            <ChronologyPointFields
              chronology={chronology}
              ids={{
                eraId: 'relations-at-eraId',
                year: 'relations-at-year',
                month: 'relations-at-month',
                day: 'relations-at-day',
              }}
              value={when}
              onChange={(part, next) => setWhen({ ...when, [part]: next })}
              errors={{}}
            />
            {!whenReady ? (
              <p className="field__hint" data-testid="relations-when-hint">
                {reckonsInEras
                  ? 'Give a date period and a year, then Show.'
                  : 'Give a year, then Show.'}
              </p>
            ) : null}
            <div className="relwhen__actions">
              <button
                className="button button--sm"
                type="submit"
                disabled={!whenReady}
                data-testid="relations-when-show"
              >
                Show
              </button>
              <button
                className="button button--secondary button--sm"
                type="button"
                onClick={() => {
                  setWhen(null)
                  requestAnimationFrame(() => whenOpen.current?.focus())
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
        {shownAt && at ? (
          <p
            className="relwhen__status"
            role="status"
            tabIndex={-1}
            ref={whenStatus}
            data-testid="relations-when-status"
          >
            Showing what holds at{' '}
            {formatChronologyPoint(chronology, {
              year: at.year ?? 0,
              month: at.month,
              day: at.day,
              eraId: at.eraId,
              monthId: at.monthId,
            })}
            .{' '}
            <button
              type="button"
              className="linkbutton"
              onClick={() => {
                setShownAt(null)
                requestAnimationFrame(() => whenOpen.current?.focus())
              }}
              data-testid="relations-when-clear"
            >
              Show all
            </button>
          </p>
        ) : null}
      </div>

      {isAdding ? form : null}

      {views === null ? (
        <p className="relations__quiet" role="status">
          Reading the relations…
        </p>
      ) : views.length === 0 && !isAdding ? (
        <p className="relations__quiet" data-testid="relations-empty">
          {shownAt ? (
            'No relation holds then.'
          ) : readError ? (
            'Nothing could be shown.'
          ) : types.length === 0 ? (
            <>
              Relations need a kind first, like who rules what or who is married to whom. Name one
              under <Link to={`/app/universes/${universeId}/types`}>Types</Link>.
            </>
          ) : (
            'Nothing connects to this yet. Add the first relation.'
          )}
        </p>
      ) : (
        <ul className="relations__list" data-testid="relationship-list">
          {byReading(views).map(([label, group]) => (
            <li className="relations__group" key={label}>
              <h3 className="relations__reading">
                <bdi>{label}</bdi>
              </h3>
              <ul className="relations__rows">
                {group.map((view) =>
                  editingId === view.id ? (
                    <li className="relations__editing" key={view.id}>
                      {form}
                    </li>
                  ) : (
                    <li className="relation" key={view.id} data-relation-label={view.label}>
                      <EntityTile
                        className="relation__tile"
                        universeId={universeId}
                        entityId={view.relatedEntityId}
                        image={null}
                        typeIcon={view.relatedEntityTypeIcon}
                        typeAccent={view.relatedEntityTypeAccentColor}
                      />

                      <div className="relation__body">
                        <Link
                          className="relation__name"
                          to={`/app/universes/${universeId}/lore/${view.relatedEntityId}`}
                        >
                          <bdi>{view.relatedEntityName}</bdi>
                        </Link>
                        <p className="relation__meta">
                          <span className="relation__kind">
                            <bdi>{view.relatedEntityTypeName}</bdi>
                          </span>
                          <StatusBadge
                            step={view.canonStatus}
                            label={CANON_LABELS[view.canonStatus]}
                          />
                          {(view.periods ?? []).length > 0 ? (
                            <span className="relation__span" data-testid="relation-periods-text">
                              {(view.periods ?? [])
                                .map((period) => periodText(period, chronology))
                                .join('; ')}
                            </span>
                          ) : null}
                          {formatSpan(view.startDate, view.endDate) ? (
                            <span className="relation__span">
                              Real-world: {formatSpan(view.startDate, view.endDate)}
                            </span>
                          ) : null}
                          {view.validity === Validity.Timeless ? (
                            <span className="relation__validity">Always</span>
                          ) : view.validity === Validity.Unplaced ? (
                            <span className="relation__validity" data-testid="relation-unplaced">
                              Can&rsquo;t be placed then
                            </span>
                          ) : null}
                        </p>
                        {view.notes ? <p className="relation__notes prose">{view.notes}</p> : null}
                      </div>

                      {access.editContent ? (
                        <ActionMenu
                          className="relation__menu"
                          label={`More actions for ${view.label} ${view.relatedEntityName}`}
                          triggerTestId={`relationship-actions-${view.relatedEntityName}`}
                        >
                          <button
                            className="actionmenu__item"
                            type="button"
                            onClick={() => openEdit(view)}
                            data-testid={`edit-relationship-${view.relatedEntityName}`}
                          >
                            <ActionIcon icon={Pencil} />
                            Edit relation
                          </button>
                          <hr className="actionmenu__divider" />
                          <button
                            className="actionmenu__item actionmenu__item--danger"
                            type="button"
                            onClick={() => void remove(view)}
                            data-testid={`delete-relationship-${view.relatedEntityName}`}
                          >
                            <ActionIcon icon={Trash} />
                            Remove relation
                          </button>
                        </ActionMenu>
                      ) : null}
                    </li>
                  ),
                )}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

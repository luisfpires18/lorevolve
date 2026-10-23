import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useUniverseAccess } from '../universes/access'
import { EntityPicker } from './EntityPicker'
import { ApiError } from '../lib/api'
import { payloadKey } from '../lib/drawerGuard'
import { useLeaveGuard } from '../lib/leaveGuard'
import { formatSpan, fromDateInput, toDateInput } from '../lib/dates'
import {
  createRelationship,
  deleteRelationship,
  listEntityRelationships,
  listRelationshipTypes,
  updateRelationship,
} from '../relationships/api'
import {
  Perspective,
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
  start: string
  end: string
  notes: string
}

interface RelationshipSectionProps {
  universeId: string
  entityId: string
  entityName: string
}

/** A draft as it would be saved, for telling whether anything changed since the form opened. */
function draftKey(draft: RelationDraft) {
  return payloadKey({ ...draft, related: draft.related?.id ?? null, notes: draft.notes.trim() })
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
    start: toDateInput(view.startDate),
    end: toDateInput(view.endDate),
    notes: view.notes ?? '',
  }
}

export function RelationshipSection({
  universeId,
  entityId,
  entityName,
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

  const isDirty = draft !== null && draftKey(draft) !== opened
  useLeaveGuard(isDirty ? 'This relation has unsaved changes. Leave without saving it?' : null)

  const load = useCallback(
    (signal?: AbortSignal) =>
      Promise.all([
        listEntityRelationships(universeId, entityId, signal),
        listRelationshipTypes(universeId, signal),
      ])
        .then(([loadedViews, loadedTypes]) => {
          setViews(loadedViews)
          setTypes(loadedTypes)
        })
        .catch(() => {
          if (signal?.aborted) return
          setViews([])
          setMessage('The relations could not be read.')
        }),
    [universeId, entityId],
  )

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
      start: '',
      end: '',
      notes: '',
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
      startDate: fromDateInput(draft.start),
      endDate: fromDateInput(draft.end),
      notes: draft.notes.trim() ? draft.notes.trim() : null,
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

        <div className="field">
          <label className="field__label" htmlFor="relation-start">
            Began
          </label>
          <input
            id="relation-start"
            className="field__input"
            type="date"
            value={draft.start}
            onChange={(event) => edit({ start: event.target.value })}
            data-testid="relation-start"
          />
        </div>

        <div className="field">
          <label className="field__label" htmlFor="relation-end">
            Ended
          </label>
          <input
            id="relation-end"
            className="field__input"
            type="date"
            value={draft.end}
            onChange={(event) => edit({ end: event.target.value })}
            aria-invalid={fieldErrors.enddate ? true : undefined}
            data-testid="relation-end"
          />
          {fieldErrors.enddate ? <p className="field__error">{fieldErrors.enddate}</p> : null}
        </div>
      </div>

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

      {message ? (
        <p className="form__message" role="alert" data-testid="relationship-error">
          {message}
        </p>
      ) : null}

      {isAdding ? form : null}

      {views === null ? (
        <p className="relations__quiet" role="status">
          Reading the relations…
        </p>
      ) : views.length === 0 && !isAdding ? (
        <p className="relations__quiet" data-testid="relations-empty">
          {types.length === 0 ? (
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
                          {formatSpan(view.startDate, view.endDate) ? (
                            <span className="relation__span">
                              {formatSpan(view.startDate, view.endDate)}
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

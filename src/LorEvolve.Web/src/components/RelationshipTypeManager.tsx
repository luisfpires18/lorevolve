import { useEffect, useState } from 'react'
import { useUniverseAccess } from '../universes/access'
import { Field } from './Field'
import { ApiError } from '../lib/api'
import {
  createRelationshipType,
  deleteRelationshipType,
  listRelationshipTypes,
  updateRelationshipType,
} from '../relationships/api'
import {
  AgeOrder,
  FAMILY_SEMANTIC_LABELS,
  FAMILY_SEMANTIC_ORDER,
  FAMILY_SEMANTIC_WORDS,
  FamilySemantic,
  isParentSemantic,
  type AgeOrderValue,
  type FamilySemanticValue,
  type RelationshipCanonConstraints,
  type RelationshipType,
} from '../relationships/types'

interface TypeDraft {
  name: string
  inverseName: string
  isSymmetric: boolean
  description: string
  ageOrder: AgeOrderValue
  /** As typed, so a half-written number is never silently read as "no gap". */
  minGap: string
  maxGap: string
  familySemantic: FamilySemanticValue
}

const BLANK: TypeDraft = {
  name: '',
  inverseName: '',
  isSymmetric: false,
  description: '',
  ageOrder: AgeOrder.None,
  minGap: '',
  maxGap: '',
  familySemantic: FamilySemantic.None,
}

/** The server's field keys, lowercased the way `ApiError` hands them over. */
const ORDER_KEY = 'canonconstraints.ageorder'
const MIN_KEY = 'canonconstraints.minagedifferenceyears'
const MAX_KEY = 'canonconstraints.maxagedifferenceyears'
const FAMILY_KEY = 'familysemantic'

const GAP_MESSAGE = 'An age gap is a whole number of years, 0 or more.'

function draftFrom(type: RelationshipType): TypeDraft {
  const constraints = type.canonConstraints
  return {
    name: type.name,
    inverseName: type.inverseName ?? '',
    isSymmetric: type.isSymmetric,
    description: type.description ?? '',
    ageOrder: constraints.ageOrder,
    minGap: constraints.minAgeDifferenceYears?.toString() ?? '',
    maxGap: constraints.maxAgeDifferenceYears?.toString() ?? '',
    familySemantic: type.familySemantic,
  }
}

/** What a kind means to the Family Tree, in words, or null when it means nothing to it. */
function familySummary(familySemantic: FamilySemanticValue) {
  if (familySemantic === FamilySemantic.None) return null
  return isParentSemantic(familySemantic)
    ? `Family: ${FAMILY_SEMANTIC_WORDS[familySemantic]} parent → child`
    : 'Family: listed on the Family Tree, defines no ancestry'
}

/** How a type reads from each side, in the author's own words. */
function reading(type: RelationshipType) {
  return type.isSymmetric ? (
    <>
      <bdi>{type.name}</bdi>, both ways
    </>
  ) : (
    <>
      <bdi>{type.name}</bdi> one way, <bdi>{type.inverseName ?? type.name}</bdi> the other
    </>
  )
}

/** Blank is no gap; anything else must be a whole number of years, 0 or more. */
function readGap(text: string): number | null | 'invalid' {
  const trimmed = text.trim()
  if (trimmed === '') return null
  return /^\d+$/.test(trimmed) ? Number(trimmed) : 'invalid'
}

function years(count: number) {
  return count === 1 ? '1 year' : `${count} years`
}

/** What a kind's Canon constraints say, in words, or null when it has none. */
function constraintSummary(constraints: RelationshipCanonConstraints) {
  const parts: string[] = []

  if (constraints.ageOrder === AgeOrder.SourceOlder) parts.push('source older than target')
  if (constraints.ageOrder === AgeOrder.SourceYounger) parts.push('source younger than target')

  const min = constraints.minAgeDifferenceYears
  const max = constraints.maxAgeDifferenceYears

  if (min !== null && max !== null) {
    parts.push(
      min === max ? `born exactly ${years(min)} apart` : `born ${min} to ${max} years apart`,
    )
  } else if (min !== null) {
    parts.push(`born at least ${years(min)} apart`)
  } else if (max !== null) {
    parts.push(`born at most ${years(max)} apart`)
  }

  return parts.length > 0 ? `Canon: ${parts.join(', ')}` : null
}

export function RelationshipTypeManager({ universeId }: { universeId: string }) {
  const access = useUniverseAccess()
  const [types, setTypes] = useState<RelationshipType[] | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [draft, setDraft] = useState<TypeDraft>(BLANK)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    listRelationshipTypes(universeId, controller.signal)
      .then(setTypes)
      .catch(() => {
        if (controller.signal.aborted) return
        setTypes([])
        setMessage('The relation kinds could not be loaded.')
      })
    return () => {
      controller.abort()
    }
  }, [universeId])

  function close() {
    setIsAdding(false)
    setEditingId(null)
    setDraft(BLANK)
    setFieldErrors({})
  }

  async function refresh() {
    setTypes(await listRelationshipTypes(universeId))
  }

  async function save() {
    setMessage(null)
    setFieldErrors({})

    // The same checks the API makes, so a mistake is named beside its field before a request.
    // A minimum above the maximum is never swapped: which number was mistyped is the author's call.
    const min = readGap(draft.minGap)
    const max = readGap(draft.maxGap)
    const errors: Record<string, string> = {}
    if (min === 'invalid') errors[MIN_KEY] = GAP_MESSAGE
    if (max === 'invalid') errors[MAX_KEY] = GAP_MESSAGE
    if (typeof min === 'number' && typeof max === 'number' && min > max) {
      errors[MAX_KEY] = `The largest gap cannot be smaller than the smallest gap, ${years(min)}.`
    }
    if (Object.keys(errors).length > 0 || min === 'invalid' || max === 'invalid') {
      setFieldErrors(errors)
      return
    }

    setIsSaving(true)

    const input = {
      name: draft.name.trim(),
      // A symmetric kind reads the same both ways, so no second wording is sent.
      inverseName: draft.isSymmetric ? null : draft.inverseName.trim() || null,
      isSymmetric: draft.isSymmetric,
      description: draft.description.trim() ? draft.description.trim() : null,
      displayOrder: null,
      canonConstraints: {
        // Nor does it have an older end, which is why the control is not offered for one.
        ageOrder: draft.isSymmetric ? AgeOrder.None : draft.ageOrder,
        minAgeDifferenceYears: min,
        maxAgeDifferenceYears: max,
      },
      // A symmetric kind has no parent side either, for the same reason; family that defines no ancestry it may carry.
      familySemantic:
        draft.isSymmetric && isParentSemantic(draft.familySemantic)
          ? FamilySemantic.None
          : draft.familySemantic,
    }

    try {
      if (editingId) {
        await updateRelationshipType(universeId, editingId, input)
      } else {
        await createRelationshipType(universeId, input)
      }
      close()
      await refresh()
    } catch (error: unknown) {
      if (error instanceof ApiError) {
        setFieldErrors(error.fieldErrors)
        if (Object.keys(error.fieldErrors).length === 0) setMessage(error.message)
      } else {
        setMessage('That relation kind could not be saved.')
      }
    } finally {
      setIsSaving(false)
    }
  }

  async function remove(type: RelationshipType) {
    setMessage(null)
    try {
      await deleteRelationshipType(universeId, type.id)
      if (editingId === type.id) close()
      await refresh()
    } catch (error: unknown) {
      // 409 carries the count of relations still using the kind, which is the useful part.
      setMessage(
        error instanceof ApiError ? error.message : 'That relation kind could not be deleted.',
      )
    }
  }

  /** Merges into the latest draft, so two changes in one tick cannot drop one. */
  function edit(change: Partial<TypeDraft>) {
    setDraft((current) => ({ ...current, ...change }))
  }

  const orderError = fieldErrors[ORDER_KEY]

  const form = (
    <div className="reltype__form" data-testid="relationship-type-form">
      <Field
        label="Reads as"
        name="reltype-name"
        placeholder="rules, parent of, married to"
        dir="auto"
        value={draft.name}
        onChange={(event) => edit({ name: event.target.value })}
        error={fieldErrors.name}
      />

      {draft.isSymmetric ? (
        <p className="settings__note">
          Both entries read “{draft.name.trim() || 'this'}”. Nothing is worded in reverse.
        </p>
      ) : (
        <Field
          label="Reads as, from the other side"
          name="reltype-inverse"
          placeholder="ruled by, child of"
          dir="auto"
          value={draft.inverseName}
          onChange={(event) => edit({ inverseName: event.target.value })}
          error={fieldErrors.inversename}
        />
      )}

      <label className="check">
        <input
          type="checkbox"
          checked={draft.isSymmetric}
          onChange={(event) => edit({ isSymmetric: event.target.checked })}
          data-testid="reltype-symmetric"
        />
        <span>Reads the same from both sides</span>
      </label>

      <Field
        label="Description"
        name="reltype-description"
        placeholder="Optional"
        value={draft.description}
        onChange={(event) => edit({ description: event.target.value })}
        error={fieldErrors.description}
      />

      <fieldset className="reltype__canon" data-testid="reltype-canon">
        <legend className="reltype__legend">Canon constraints</legend>
        <p className="field__hint">
          Optional rules used by Canon Integrity. LorEvolve never infers these from the relationship
          name.
        </p>

        <p className="reltype__direction" data-testid="reltype-direction">
          <span className="reltype__end">Source</span>
          <span aria-hidden="true">→</span>
          <span>{draft.name.trim() || 'reads as'}</span>
          <span aria-hidden="true">→</span>
          <span className="reltype__end">Target</span>
        </p>

        {draft.isSymmetric ? (
          <p className="field__hint" data-testid="reltype-no-order">
            Reads the same from both sides, so neither end is the older one. An age gap still
            applies.
          </p>
        ) : (
          <div className="field">
            <label className="field__label" htmlFor="reltype-age-order">
              Age ordering
            </label>
            <select
              id="reltype-age-order"
              className="field__input field__input--select"
              value={draft.ageOrder}
              onChange={(event) => edit({ ageOrder: Number(event.target.value) as AgeOrderValue })}
              aria-invalid={orderError ? true : undefined}
              aria-describedby={orderError ? 'reltype-age-order-error' : undefined}
              data-testid="reltype-age-order"
            >
              <option value={AgeOrder.None}>No age rule</option>
              <option value={AgeOrder.SourceOlder}>Source must be older</option>
              <option value={AgeOrder.SourceYounger}>Source must be younger</option>
            </select>
            {orderError ? (
              <p className="field__error" id="reltype-age-order-error">
                {orderError}
              </p>
            ) : null}
          </div>
        )}

        <div className="reltype__gaps">
          <Field
            label="Minimum age gap (years)"
            name="reltype-min-gap"
            inputMode="numeric"
            placeholder="None"
            value={draft.minGap}
            onChange={(event) => edit({ minGap: event.target.value })}
            error={fieldErrors[MIN_KEY]}
            data-testid="reltype-min-gap"
          />
          <Field
            label="Maximum age gap (years)"
            name="reltype-max-gap"
            inputMode="numeric"
            placeholder="None"
            value={draft.maxGap}
            onChange={(event) => edit({ maxGap: event.target.value })}
            error={fieldErrors[MAX_KEY]}
            data-testid="reltype-max-gap"
          />
        </div>
      </fieldset>

      <fieldset className="reltype__canon" data-testid="reltype-family">
        <legend className="reltype__legend">Family meaning</legend>
        <p className="field__hint">
          Optional. Only a kind given a family meaning here appears in the Family Tree, and
          LorEvolve never infers one from the relationship name.
        </p>

        {draft.isSymmetric ? (
          <p className="field__hint" data-testid="reltype-no-family">
            Reads the same from both sides, so neither end is a parent. It can still be a family
            relationship that defines no ancestry, like “married to”.
          </p>
        ) : null}

        <div className="field">
          <label className="field__label" htmlFor="reltype-family-meaning">
            Family meaning
          </label>
          <select
            id="reltype-family-meaning"
            className="field__input field__input--select"
            value={
              draft.isSymmetric && isParentSemantic(draft.familySemantic)
                ? FamilySemantic.None
                : draft.familySemantic
            }
            onChange={(event) =>
              edit({ familySemantic: Number(event.target.value) as FamilySemanticValue })
            }
            aria-invalid={fieldErrors[FAMILY_KEY] ? true : undefined}
            aria-describedby={fieldErrors[FAMILY_KEY] ? 'reltype-family-error' : undefined}
            data-testid="reltype-family-meaning"
          >
            {FAMILY_SEMANTIC_ORDER.filter(
              (option) => !draft.isSymmetric || !isParentSemantic(option),
            ).map((option) => (
              <option key={option} value={option}>
                {FAMILY_SEMANTIC_LABELS[option]}
              </option>
            ))}
          </select>
          {fieldErrors[FAMILY_KEY] ? (
            <p className="field__error" id="reltype-family-error">
              {fieldErrors[FAMILY_KEY]}
            </p>
          ) : null}
        </div>

        {!draft.isSymmetric && isParentSemantic(draft.familySemantic) ? (
          <p className="reltype__direction" data-testid="reltype-family-direction">
            <span className="reltype__end">Source</span>
            <span>is the {FAMILY_SEMANTIC_WORDS[draft.familySemantic]} parent</span>
            <span aria-hidden="true">·</span>
            <span className="reltype__end">Target</span>
            <span>is the child</span>
          </p>
        ) : null}
        {draft.familySemantic === FamilySemantic.NonStructuralFamily ? (
          <p className="field__hint" data-testid="reltype-family-listed">
            Listed on the Family Tree in this kind&rsquo;s own words. It places nobody in the
            ancestry and implies no other relative.
          </p>
        ) : null}
      </fieldset>

      <div className="relform__actions">
        <button
          className="button"
          type="button"
          onClick={save}
          disabled={isSaving}
          data-testid="save-relationship-type"
        >
          {isSaving ? 'Saving' : editingId ? 'Save kind' : 'Add kind'}
        </button>
        <button className="button button--secondary" type="button" onClick={close}>
          Cancel
        </button>
      </div>
    </div>
  )

  if (!types) {
    return (
      <p className="notice" role="status">
        Reading the relation kinds…
      </p>
    )
  }

  return (
    <section className="reltypes" aria-labelledby="reltypes-heading">
      <div className="relations__head">
        <h2 className="settings__heading" id="reltypes-heading">
          Relation kinds
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
            Add kind
          </button>
        ) : null}
      </div>

      <p className="settings__note">
        How entries connect. Each kind carries both readings, so one link says “rules” on one entry
        and “ruled by” on the other.
      </p>

      {message ? (
        <p className="form__message" role="alert" data-testid="reltype-error">
          {message}
        </p>
      ) : null}

      {isAdding ? form : null}

      {types.length === 0 && !isAdding ? (
        <p className="relations__quiet" data-testid="reltypes-empty">
          No kinds yet. Name the first one and entries can start connecting.
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

            const summary = constraintSummary(type.canonConstraints)
            const family = familySummary(type.familySemantic)

            return (
              <li className="types__row" key={type.id} data-reltype-name={type.name}>
                <div className="types__head">
                  <span className="types__name">
                    <bdi>{type.name}</bdi>
                  </span>
                  <span className="types__count">
                    {type.relationshipCount === 1
                      ? '1 relation'
                      : `${type.relationshipCount} relations`}
                  </span>
                  {access.editContent ? (
                    <button
                      className="button button--secondary button--sm"
                      type="button"
                      onClick={() => {
                        setMessage(null)
                        setFieldErrors({})
                        setIsAdding(false)
                        setEditingId(type.id)
                        setDraft(draftFrom(type))
                      }}
                      data-testid={`edit-reltype-${type.name}`}
                    >
                      Edit
                    </button>
                  ) : null}
                  {access.editContent && type.relationshipCount === 0 ? (
                    <button
                      className="button button--secondary button--sm"
                      type="button"
                      onClick={() => remove(type)}
                      data-testid={`delete-reltype-${type.name}`}
                    >
                      Delete
                    </button>
                  ) : null}
                </div>

                <p className="types__description">{reading(type)}</p>
                {summary ? (
                  <p
                    className="types__description reltype__rule"
                    data-testid={`reltype-constraints-${type.name}`}
                  >
                    {summary}
                  </p>
                ) : null}
                {family ? (
                  <p
                    className="types__description reltype__rule"
                    data-testid={`reltype-family-${type.name}`}
                  >
                    {family}
                  </p>
                ) : null}
                {type.description ? (
                  <p className="types__description prose">{type.description}</p>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

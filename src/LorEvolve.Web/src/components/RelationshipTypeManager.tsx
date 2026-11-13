import { useEffect, useState } from 'react'
import { t, tn, tx, useI18n } from '../i18n'
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
    ? t('relationships.types.familyParent', { word: FAMILY_SEMANTIC_WORDS[familySemantic] })
    : t('relationships.types.familyListed')
}

/** How a type reads from each side, in the author's own words. */
function reading(type: RelationshipType) {
  return type.isSymmetric
    ? tx('relationships.types.bothWays', { name: <bdi>{type.name}</bdi> })
    : tx('relationships.types.oneWay', {
        name: <bdi>{type.name}</bdi>,
        inverse: <bdi>{type.inverseName ?? type.name}</bdi>,
      })
}

/** Blank is no gap; anything else must be a whole number of years, 0 or more. */
function readGap(text: string): number | null | 'invalid' {
  const trimmed = text.trim()
  if (trimmed === '') return null
  return /^\d+$/.test(trimmed) ? Number(trimmed) : 'invalid'
}

function years(count: number) {
  return tn('relationships.types.years', count, { n: count })
}

/** What a kind's Canon constraints say, in words, or null when it has none. */
function constraintSummary(constraints: RelationshipCanonConstraints) {
  const parts: string[] = []

  if (constraints.ageOrder === AgeOrder.SourceOlder)
    parts.push(t('relationships.types.sourceOlder'))
  if (constraints.ageOrder === AgeOrder.SourceYounger)
    parts.push(t('relationships.types.sourceYounger'))

  const min = constraints.minAgeDifferenceYears
  const max = constraints.maxAgeDifferenceYears

  if (min !== null && max !== null) {
    parts.push(
      min === max
        ? t('relationships.types.bornExactly', { years: years(min) })
        : t('relationships.types.bornRange', { min, max }),
    )
  } else if (min !== null) {
    parts.push(t('relationships.types.bornAtLeast', { years: years(min) }))
  } else if (max !== null) {
    parts.push(t('relationships.types.bornAtMost', { years: years(max) }))
  }

  return parts.length > 0
    ? t('relationships.types.canonSummary', { parts: parts.join(', ') })
    : null
}

export function RelationshipTypeManager({ universeId }: { universeId: string }) {
  useI18n() // Re-render when the language changes; the module's `t` reads the new one.
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
        setMessage(t('relationships.types.loadFailed'))
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
    if (min === 'invalid') errors[MIN_KEY] = t('relationships.types.gapInvalid')
    if (max === 'invalid') errors[MAX_KEY] = t('relationships.types.gapInvalid')
    if (typeof min === 'number' && typeof max === 'number' && min > max) {
      errors[MAX_KEY] = t('relationships.types.gapOrder', { years: years(min) })
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
        setMessage(t('relationships.types.saveFailed'))
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
      setMessage(error instanceof ApiError ? error.message : t('relationships.types.deleteFailed'))
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
        label={t('relationships.types.readsAs')}
        name="reltype-name"
        placeholder={t('relationships.types.readsAsPlaceholder')}
        dir="auto"
        value={draft.name}
        onChange={(event) => edit({ name: event.target.value })}
        error={fieldErrors.name}
      />

      {draft.isSymmetric ? (
        <p className="settings__note">
          {t('relationships.types.bothRead', {
            name: draft.name.trim() || t('relationships.types.thisFallback'),
          })}
        </p>
      ) : (
        <Field
          label={t('relationships.types.readsAsOther')}
          name="reltype-inverse"
          placeholder={t('relationships.types.readsAsOtherPlaceholder')}
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
        <span>{t('relationships.types.symmetric')}</span>
      </label>

      <Field
        label={t('relationships.types.description')}
        name="reltype-description"
        placeholder={t('relationships.types.optional')}
        value={draft.description}
        onChange={(event) => edit({ description: event.target.value })}
        error={fieldErrors.description}
      />

      <fieldset className="reltype__canon" data-testid="reltype-canon">
        <legend className="reltype__legend">{t('relationships.types.canonLegend')}</legend>
        <p className="field__hint">{t('relationships.types.canonHint')}</p>

        <p className="reltype__direction" data-testid="reltype-direction">
          <span className="reltype__end">{t('relationships.types.source')}</span>
          <span aria-hidden="true">→</span>
          <span>{draft.name.trim() || t('relationships.types.readsAsFallback')}</span>
          <span aria-hidden="true">→</span>
          <span className="reltype__end">{t('relationships.types.target')}</span>
        </p>

        {draft.isSymmetric ? (
          <p className="field__hint" data-testid="reltype-no-order">
            {t('relationships.types.noOrder')}
          </p>
        ) : (
          <div className="field">
            <label className="field__label" htmlFor="reltype-age-order">
              {t('relationships.types.ageOrdering')}
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
              <option value={AgeOrder.None}>{t('relationships.types.noAgeRule')}</option>
              <option value={AgeOrder.SourceOlder}>
                {t('relationships.types.sourceMustBeOlder')}
              </option>
              <option value={AgeOrder.SourceYounger}>
                {t('relationships.types.sourceMustBeYounger')}
              </option>
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
            label={t('relationships.types.minGap')}
            name="reltype-min-gap"
            inputMode="numeric"
            placeholder={t('relationships.types.gapNone')}
            value={draft.minGap}
            onChange={(event) => edit({ minGap: event.target.value })}
            error={fieldErrors[MIN_KEY]}
            data-testid="reltype-min-gap"
          />
          <Field
            label={t('relationships.types.maxGap')}
            name="reltype-max-gap"
            inputMode="numeric"
            placeholder={t('relationships.types.gapNone')}
            value={draft.maxGap}
            onChange={(event) => edit({ maxGap: event.target.value })}
            error={fieldErrors[MAX_KEY]}
            data-testid="reltype-max-gap"
          />
        </div>
      </fieldset>

      <fieldset className="reltype__canon" data-testid="reltype-family">
        <legend className="reltype__legend">{t('relationships.types.familyLegend')}</legend>
        <p className="field__hint">{t('relationships.types.familyHint')}</p>

        {draft.isSymmetric ? (
          <p className="field__hint" data-testid="reltype-no-family">
            {t('relationships.types.noFamily')}
          </p>
        ) : null}

        <div className="field">
          <label className="field__label" htmlFor="reltype-family-meaning">
            {t('relationships.types.familyMeaning')}
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
            <span className="reltype__end">{t('relationships.types.source')}</span>
            <span>
              {t('relationships.types.isParent', {
                word: FAMILY_SEMANTIC_WORDS[draft.familySemantic],
              })}
            </span>
            <span aria-hidden="true">·</span>
            <span className="reltype__end">{t('relationships.types.target')}</span>
            <span>{t('relationships.types.isChild')}</span>
          </p>
        ) : null}
        {draft.familySemantic === FamilySemantic.NonStructuralFamily ? (
          <p className="field__hint" data-testid="reltype-family-listed">
            {t('relationships.types.familyListedHint')}
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
          {isSaving
            ? t('relationships.types.saving')
            : editingId
              ? t('relationships.types.saveKind')
              : t('relationships.types.addKindSubmit')}
        </button>
        <button className="button button--secondary" type="button" onClick={close}>
          {t('relationships.types.cancel')}
        </button>
      </div>
    </div>
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

            const summary = constraintSummary(type.canonConstraints)
            const family = familySummary(type.familySemantic)

            return (
              <li className="types__row" key={type.id} data-reltype-name={type.name}>
                <div className="types__head">
                  <span className="types__name">
                    <bdi>{type.name}</bdi>
                  </span>
                  <span className="types__count">
                    {tn('relationships.types.relationCount', type.relationshipCount, {
                      n: type.relationshipCount,
                    })}
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
                      {t('relationships.types.edit')}
                    </button>
                  ) : null}
                  {access.editContent && type.relationshipCount === 0 ? (
                    <button
                      className="button button--secondary button--sm"
                      type="button"
                      onClick={() => remove(type)}
                      data-testid={`delete-reltype-${type.name}`}
                    >
                      {t('relationships.types.delete')}
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

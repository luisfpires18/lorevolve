import { useState } from 'react'
import { Plus } from 'lucide-react'
import { ActionIcon } from './ActionIcon'
import { EntityPicker, type EntityChoice } from './EntityPicker'
import { FamilyKindDialog } from './FamilyKindDialog'
import { ApiError } from '../lib/api'
import { payloadKey } from '../lib/drawerGuard'
import { useLeaveGuard } from '../lib/leaveGuard'
import { createRelationship } from '../relationships/api'
import {
  FAMILY_SEMANTIC_WORDS,
  isParentSemantic,
  type RelationshipType,
} from '../relationships/types'
import {
  CANON_LABELS,
  CANON_ORDER,
  CanonStatus,
  type CanonStatusValue,
  CANON_KEYS,
} from '../lore/types'
import { confirmDiscard } from '../lib/confirm'
import { useI18n } from '../i18n'

interface Props {
  universeId: string
  focal: { id: string; name: string }
  /** Only kinds whose author gave them a family meaning: nothing else can make a family connection. */
  kinds: RelationshipType[]
  /** A kind made from this form: the page adds it to its list, and the form chooses it. */
  onKindCreated: (kind: RelationshipType) => void
  onSaved: () => void
  onCancel: () => void
}

/**
 * Adds a family connection without leaving the tree. It writes an ordinary relationship of a kind that
 * carries a family meaning - the same row, the same route and the same validation as the relation editor on
 * an entry's page. There is no second kind of family link anywhere.
 *
 * The form follows the kind. A parent kind asks which side is the parent, because that is what the stored
 * direction means for it. Any other family kind - "uncle of", "married to" - is read the way every relation is,
 * in the kind's own words from the focal entry's side, and says nothing about parents at all (ADR 0040).
 */
export function FamilyLinkForm({
  universeId,
  focal,
  kinds,
  onKindCreated,
  onSaved,
  onCancel,
}: Props) {
  const { t } = useI18n()
  const [kindId, setKindId] = useState(kinds[0]?.id ?? '')
  // The stored row runs source to target; for a parent kind the source is the parent.
  const [focalIsSource, setFocalIsSource] = useState(true)
  const [related, setRelated] = useState<EntityChoice | null>(null)
  const [canonStatus, setCanonStatus] = useState<CanonStatusValue>(CanonStatus.Idea)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isCreatingKind, setIsCreatingKind] = useState(false)

  const kind = kinds.find((candidate) => candidate.id === kindId) ?? kinds[0]
  const isParentKind = !!kind && isParentSemantic(kind.familySemantic)
  // A symmetric kind reads the same both ways, and one with no inverse wording has only its own: either way the focal
  // entry is the source.
  const hasTwoReadings = !!kind && !kind.isSymmetric && (isParentKind || !!kind.inverseName)
  const asSource = focalIsSource || !hasTwoReadings

  // Unsaved is the connection as it would be written against the one the form opened on - so a choice put back is none.
  const [initial] = useState(() =>
    payloadKey({ kindId, focalIsSource, relatedId: null, canonStatus }),
  )
  const isDirty =
    payloadKey({ kindId, focalIsSource, relatedId: related?.id ?? null, canonStatus }) !== initial
  useLeaveGuard(isDirty ? t('places.linkForm.leave') : null)

  /** How a kind is named in the Connection choice: a parent kind says which, any other family kind says nothing more. */
  function kindOption(candidate: RelationshipType) {
    return isParentSemantic(candidate.familySemantic)
      ? t('places.linkForm.parentKind', {
          name: candidate.name,
          word: FAMILY_SEMANTIC_WORDS[candidate.familySemantic],
        })
      : candidate.name
  }

  async function cancel() {
    if (isDirty && !(await confirmDiscard())) return
    onCancel()
  }

  const otherName = related?.name ?? '…'
  const preview = !kind
    ? null
    : isParentKind
      ? {
          subject: asSource ? focal.name : otherName,
          verb: kind.name,
          object: asSource ? otherName : focal.name,
        }
      : {
          subject: focal.name,
          verb: asSource || kind.isSymmetric ? kind.name : (kind.inverseName ?? kind.name),
          object: otherName,
        }

  async function save() {
    if (!kind) return

    if (!related) {
      setFieldErrors({ targetentityid: t('places.linkForm.chooseEntry') })
      return
    }

    setMessage(null)
    setFieldErrors({})
    setIsSaving(true)

    try {
      await createRelationship(universeId, {
        relationshipTypeId: kind.id,
        sourceEntityId: asSource ? focal.id : related.id,
        targetEntityId: asSource ? related.id : focal.id,
        canonStatus,
        startDate: null,
        endDate: null,
        notes: null,
      })
      onSaved()
    } catch (error: unknown) {
      if (error instanceof ApiError) {
        setFieldErrors(error.fieldErrors)
        setMessage(
          Object.keys(error.fieldErrors).length === 0
            ? error.message
            : t('places.linkForm.fieldErrors'),
        )
      } else {
        setMessage(t('places.linkForm.failed'))
      }
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="relform familylink" data-testid="family-link-form">
      {preview ? (
        <p className="relform__reads" data-testid="family-link-preview">
          <span className="relform__subject">
            <bdi>{preview.subject}</bdi>
          </span>{' '}
          <span className="relform__verb">
            <bdi>{preview.verb}</bdi>
          </span>{' '}
          <span className="relform__object">
            <bdi>{preview.object}</bdi>
          </span>
        </p>
      ) : null}
      {kind ? (
        <p className="field__hint">
          {isParentKind
            ? t('places.linkForm.hintParent', { word: FAMILY_SEMANTIC_WORDS[kind.familySemantic] })
            : t('places.linkForm.hintOther')}
        </p>
      ) : null}

      <div className="relform__grid">
        <div className="field">
          <label className="field__label" htmlFor="family-link-kind">
            {t('places.linkForm.connection')}
          </label>
          <select
            id="family-link-kind"
            className="field__input field__input--select"
            value={kind?.id ?? ''}
            onChange={(event) => {
              setKindId(event.target.value)
              setFocalIsSource(true)
            }}
            data-testid="family-link-kind"
          >
            {kinds.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {kindOption(candidate)}
              </option>
            ))}
          </select>
          {fieldErrors.relationshiptypeid ? (
            <p className="field__error">{fieldErrors.relationshiptypeid}</p>
          ) : null}
          <button
            className="button button--text button--sm familylink__newkind"
            type="button"
            onClick={() => setIsCreatingKind(true)}
            data-testid="new-family-kind"
          >
            <ActionIcon icon={Plus} />
            {t('places.linkForm.newKind')}
          </button>
        </div>

        {isParentKind ? (
          <div className="field">
            <label className="field__label" htmlFor="family-link-side">
              {t('places.linkForm.side')}
            </label>
            <select
              id="family-link-side"
              className="field__input field__input--select"
              value={focalIsSource ? 'parent' : 'child'}
              onChange={(event) => setFocalIsSource(event.target.value === 'parent')}
              data-testid="family-link-side"
            >
              <option value="parent">
                {t('places.linkForm.focalParent', { name: focal.name })}
              </option>
              <option value="child">{t('places.linkForm.focalChild', { name: focal.name })}</option>
            </select>
          </div>
        ) : hasTwoReadings && kind ? (
          <div className="field">
            <label className="field__label" htmlFor="family-link-reading">
              {t('places.linkForm.focalIs', { name: focal.name })}
            </label>
            <select
              id="family-link-reading"
              className="field__input field__input--select"
              value={focalIsSource ? 'forward' : 'inverse'}
              onChange={(event) => setFocalIsSource(event.target.value === 'forward')}
              data-testid="family-link-reading"
            >
              <option value="forward">{kind.name}</option>
              <option value="inverse">{kind.inverseName}</option>
            </select>
          </div>
        ) : null}

        <EntityPicker
          label={
            isParentKind
              ? focalIsSource
                ? t('places.linkForm.theChild')
                : t('places.linkForm.theParent')
              : t('places.linkForm.connectedTo')
          }
          universeId={universeId}
          value={related}
          onChange={setRelated}
          excludeId={focal.id}
          familyTreeOnly
          error={fieldErrors.targetentityid ?? fieldErrors.sourceentityid}
        />

        <div className="field">
          <span className="field__label">{t('places.linkForm.status')}</span>
          <div className="canon" role="group" aria-label={t('places.linkForm.statusGroup')}>
            {CANON_ORDER.map((option) => (
              <button
                key={option}
                type="button"
                className="canon__step"
                aria-pressed={canonStatus === option}
                onClick={() => setCanonStatus(option)}
                data-testid={`family-link-canon-${CANON_KEYS[option]}`}
              >
                {CANON_LABELS[option]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {message ? (
        <p className="form__message" role="alert" data-testid="family-link-error">
          {message}
        </p>
      ) : null}

      <div className="relform__actions">
        <button
          className="button"
          type="button"
          onClick={save}
          disabled={isSaving || !kind}
          data-testid="save-family-link"
        >
          {isSaving ? t('places.linkForm.saving') : t('places.linkForm.add')}
        </button>
        <button className="button button--secondary" type="button" onClick={cancel}>
          {t('places.linkForm.cancel')}
        </button>
      </div>

      {isCreatingKind ? (
        <FamilyKindDialog
          universeId={universeId}
          onClose={() => setIsCreatingKind(false)}
          onCreated={(created) => {
            onKindCreated(created)
            setKindId(created.id)
            setFocalIsSource(true)
            setIsCreatingKind(false)
          }}
        />
      ) : null}
    </div>
  )
}

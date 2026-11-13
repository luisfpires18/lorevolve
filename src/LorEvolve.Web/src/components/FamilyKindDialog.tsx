import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n'
import { Field } from './Field'
import { ApiError } from '../lib/api'
import { payloadKey, useDrawerGuard } from '../lib/drawerGuard'
import { useReturnFocus } from '../lib/returnFocus'
import { createRelationshipType } from '../relationships/api'
import {
  FamilySemantic,
  isParentSemantic,
  type FamilySemanticValue,
  type RelationshipType,
} from '../relationships/types'

interface Props {
  universeId: string
  onClose: () => void
  onCreated: (kind: RelationshipType) => void
}

/** The family meanings offered here, in the Family Tree's words rather than the Types screen's source and target. */
const MEANINGS = [
  { value: FamilySemantic.NonStructuralFamily, label: 'places.kindDialog.meaningFamily' },
  { value: FamilySemantic.BiologicalParent, label: 'places.kindDialog.meaningBiological' },
  { value: FamilySemantic.AdoptiveParent, label: 'places.kindDialog.meaningAdoptive' },
] as const

/**
 * A new family relation kind, made without leaving the Family Tree: an ordinary relation kind, posted to the same route
 * and validated the same way as one made under Types → Relation kinds, with only the fields a family connection needs.
 * Its Canon constraints, if it wants any, are set there later. Opens on a family meaning that defines no ancestry, since
 * that is what an author reaching for "uncle of" mid-tree needs.
 */
export function FamilyKindDialog({ universeId, onClose, onCreated }: Props) {
  const { t, tx } = useI18n()
  const dialog = useRef<HTMLDialogElement>(null)
  const [name, setName] = useState('')
  const [inverseName, setInverseName] = useState('')
  const [isSymmetric, setIsSymmetric] = useState(false)
  const [semantic, setSemantic] = useState<FamilySemanticValue>(FamilySemantic.NonStructuralFamily)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const isDirty =
    payloadKey({ name, inverseName, isSymmetric, semantic }) !==
    payloadKey({
      name: '',
      inverseName: '',
      isSymmetric: false,
      semantic: FamilySemantic.NonStructuralFamily,
    })
  const { close, dialogProps } = useDrawerGuard(isDirty, t('places.kindDialog.leave'), onClose)

  useReturnFocus()

  useEffect(() => {
    dialog.current?.showModal()
    document.getElementById('family-kind-name')?.focus()
  }, [])

  // A kind that reads the same both ways names no parent side, so only the meaning that defines no ancestry is left.
  const meanings = isSymmetric ? MEANINGS.filter((each) => !isParentSemantic(each.value)) : MEANINGS
  const chosen =
    isSymmetric && isParentSemantic(semantic) ? FamilySemantic.NonStructuralFamily : semantic

  async function save() {
    setMessage(null)
    setFieldErrors({})
    setIsSaving(true)

    try {
      const kind = await createRelationshipType(universeId, {
        name: name.trim(),
        inverseName: isSymmetric ? null : inverseName.trim() || null,
        isSymmetric,
        description: null,
        displayOrder: null,
        canonConstraints: null,
        familySemantic: chosen,
      })
      onCreated(kind)
    } catch (error: unknown) {
      if (error instanceof ApiError) {
        setFieldErrors(error.fieldErrors)
        setMessage(
          Object.keys(error.fieldErrors).length === 0
            ? error.message
            : t('places.kindDialog.fieldErrors'),
        )
      } else {
        setMessage(t('places.kindDialog.failed'))
      }
    } finally {
      setIsSaving(false)
    }
  }

  const reads = name.trim() || t('places.kindDialog.readsAs')

  return (
    <dialog
      className="drawer"
      ref={dialog}
      aria-labelledby="family-kind-heading"
      {...dialogProps}
      data-testid="family-kind-dialog"
    >
      <form
        className="drawer__panel"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <header className="drawer__head">
          <p className="drawer__eyebrow">{t('places.kindDialog.eyebrow')}</p>
          <h2 className="drawer__title" id="family-kind-heading">
            {t('places.kindDialog.title')}
          </h2>
        </header>

        <div className="drawer__body">
          {message ? (
            <p className="form__message" role="alert" data-testid="family-kind-error">
              {message}
            </p>
          ) : null}

          <Field
            label={t('places.kindDialog.name')}
            name="family-kind-name"
            placeholder={t('places.kindDialog.namePlaceholder')}
            dir="auto"
            value={name}
            onChange={(event) => setName(event.target.value)}
            error={fieldErrors.name}
            data-testid="family-kind-name"
          />

          {isSymmetric ? (
            <p className="field__hint" data-testid="family-kind-both-ways">
              {tx('places.kindDialog.bothWays', { reads: <bdi>{reads}</bdi> })}
            </p>
          ) : (
            <Field
              label={t('places.kindDialog.inverse')}
              name="family-kind-inverse"
              placeholder={t('places.kindDialog.inversePlaceholder')}
              dir="auto"
              value={inverseName}
              onChange={(event) => setInverseName(event.target.value)}
              error={fieldErrors.inversename}
              data-testid="family-kind-inverse"
            />
          )}

          <label className="check">
            <input
              type="checkbox"
              checked={isSymmetric}
              onChange={(event) => setIsSymmetric(event.target.checked)}
              data-testid="family-kind-symmetric"
            />
            <span>{t('places.kindDialog.symmetric')}</span>
          </label>

          <div className="field">
            <label className="field__label" htmlFor="family-kind-meaning">
              {t('places.kindDialog.meaning')}
            </label>
            <select
              id="family-kind-meaning"
              className="field__input field__input--select"
              value={chosen}
              onChange={(event) => setSemantic(Number(event.target.value) as FamilySemanticValue)}
              aria-invalid={fieldErrors.familysemantic ? true : undefined}
              aria-describedby="family-kind-meaning-hint"
              data-testid="family-kind-meaning"
            >
              {meanings.map((each) => (
                <option key={each.value} value={each.value}>
                  {t(each.label)}
                </option>
              ))}
            </select>
            <p className="field__hint" id="family-kind-meaning-hint">
              {isParentSemantic(chosen)
                ? t('places.kindDialog.hintParent')
                : t('places.kindDialog.hintOther')}
            </p>
            {fieldErrors.familysemantic ? (
              <p className="field__error">{fieldErrors.familysemantic}</p>
            ) : null}
          </div>
        </div>

        <footer className="drawer__actions">
          <button
            className="button"
            type="submit"
            disabled={isSaving}
            data-testid="create-family-kind"
          >
            {isSaving ? t('places.kindDialog.creating') : t('places.kindDialog.create')}
          </button>
          <button
            className="button button--secondary"
            type="button"
            onClick={close}
            data-testid="cancel-family-kind"
          >
            {t('places.kindDialog.cancel')}
          </button>
        </footer>
      </form>
    </dialog>
  )
}

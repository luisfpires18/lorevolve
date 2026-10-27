import { useEffect, useRef, useState } from 'react'
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
const MEANINGS: { value: FamilySemanticValue; label: string }[] = [
  {
    value: FamilySemantic.NonStructuralFamily,
    label: 'Family relationship, does not define ancestry',
  },
  { value: FamilySemantic.BiologicalParent, label: 'Biological parent' },
  { value: FamilySemantic.AdoptiveParent, label: 'Adoptive parent' },
]

/**
 * A new family relation kind, made without leaving the Family Tree: an ordinary relation kind, posted to the same route
 * and validated the same way as one made under Types → Relation kinds, with only the fields a family connection needs.
 * Its Canon constraints, if it wants any, are set there later. Opens on a family meaning that defines no ancestry, since
 * that is what an author reaching for "uncle of" mid-tree needs.
 */
export function FamilyKindDialog({ universeId, onClose, onCreated }: Props) {
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
  const { close, dialogProps } = useDrawerGuard(
    isDirty,
    'This relation kind has not been created. Leave without saving it?',
    onClose,
  )

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
            : 'Some details need a change before this can be created.',
        )
      } else {
        setMessage('That relation kind could not be created.')
      }
    } finally {
      setIsSaving(false)
    }
  }

  const reads = name.trim() || 'reads as'

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
          <p className="drawer__eyebrow">Family Tree</p>
          <h2 className="drawer__title" id="family-kind-heading">
            New family relation kind
          </h2>
        </header>

        <div className="drawer__body">
          {message ? (
            <p className="form__message" role="alert" data-testid="family-kind-error">
              {message}
            </p>
          ) : null}

          <Field
            label="Name"
            name="family-kind-name"
            placeholder="uncle of, married to, guardian of"
            dir="auto"
            value={name}
            onChange={(event) => setName(event.target.value)}
            error={fieldErrors.name}
            data-testid="family-kind-name"
          />

          {isSymmetric ? (
            <p className="field__hint" data-testid="family-kind-both-ways">
              Both entries read “<bdi>{reads}</bdi>”. Nothing is worded in reverse.
            </p>
          ) : (
            <Field
              label="Inverse name"
              name="family-kind-inverse"
              placeholder="nephew or niece of"
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
            <span>Reads the same from both sides</span>
          </label>

          <div className="field">
            <label className="field__label" htmlFor="family-kind-meaning">
              Family meaning
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
                  {each.label}
                </option>
              ))}
            </select>
            <p className="field__hint" id="family-kind-meaning-hint">
              {isParentSemantic(chosen)
                ? 'The entry it is read from is the parent. The tree places both and works out relatives from it.'
                : 'Listed with the family as you wrote it. It places nobody in the tree and implies no other relative.'}
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
            {isSaving ? 'Creating' : 'Create'}
          </button>
          <button
            className="button button--secondary"
            type="button"
            onClick={close}
            data-testid="cancel-family-kind"
          >
            Cancel
          </button>
        </footer>
      </form>
    </dialog>
  )
}

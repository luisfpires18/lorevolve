import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'
import { Drawer } from './Drawer'
import { CheckField } from './CheckField'
import { Field } from './Field'
import { payloadKey } from '../lib/drawerGuard'
import { useReturnFocus } from '../lib/returnFocus'
import { useFormSave } from '../lib/useFormSave'
import { createRelationshipType } from '../relationships/api'
import {
  FamilySemantic,
  isParentSemantic,
  type FamilySemanticValue,
  type RelationshipType,
} from '../relationships/types'
import { FormActions } from './FormActions'

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
  const [name, setName] = useState('')
  const [inverseName, setInverseName] = useState('')
  const [isSymmetric, setIsSymmetric] = useState(false)
  const [semantic, setSemantic] = useState<FamilySemanticValue>(FamilySemantic.NonStructuralFamily)
  const form = useFormSave({
    needChange: t('places.kindDialog.fieldErrors'),
    failed: t('places.kindDialog.failed'),
  })
  const { fieldErrors, message, isSaving } = form

  const isDirty =
    payloadKey({ name, inverseName, isSymmetric, semantic }) !==
    payloadKey({
      name: '',
      inverseName: '',
      isSymmetric: false,
      semantic: FamilySemantic.NonStructuralFamily,
    })

  useReturnFocus()

  useEffect(() => {
    document.getElementById('family-kind-name')?.focus()
  }, [])

  // A kind that reads the same both ways names no parent side, so only the meaning that defines no ancestry is left.
  const meanings = isSymmetric ? MEANINGS.filter((each) => !isParentSemantic(each.value)) : MEANINGS
  const chosen =
    isSymmetric && isParentSemantic(semantic) ? FamilySemantic.NonStructuralFamily : semantic

  async function save() {
    await form.save(async () => {
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
    })
  }

  const reads = name.trim() || t('places.kindDialog.readsAs')

  return (
    <Drawer
      testId="family-kind-dialog"
      titleId="family-kind-heading"
      eyebrow={t('places.kindDialog.eyebrow')}
      title={t('places.kindDialog.title')}
      isDirty={isDirty}
      leaveMessage={t('places.kindDialog.leave')}
      onClose={onClose}
      onSubmit={() => void save()}
      actions={(close) => (
        <FormActions
          submitLabel={t('places.kindDialog.create')}
          busy={isSaving}
          busyLabel={t('places.kindDialog.creating')}
          submitTestId="create-family-kind"
          onCancel={close}
          cancelTestId="cancel-family-kind"
        />
      )}
    >
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

      <CheckField
        className="field--flow"
        label={t('places.kindDialog.symmetric')}
        checked={isSymmetric}
        onChange={setIsSymmetric}
        testId="family-kind-symmetric"
      />

      <Field
        label={t('places.kindDialog.meaning')}
        id="family-kind-meaning"
        hint={
          isParentSemantic(chosen)
            ? t('places.kindDialog.hintParent')
            : t('places.kindDialog.hintOther')
        }
        error={fieldErrors.familysemantic}
      >
        {(control) => (
          <select
            {...control}
            className="field__input field__input--select"
            value={chosen}
            onChange={(event) => setSemantic(Number(event.target.value) as FamilySemanticValue)}
            data-testid="family-kind-meaning"
          >
            {meanings.map((each) => (
              <option key={each.value} value={each.value}>
                {t(each.label)}
              </option>
            ))}
          </select>
        )}
      </Field>
    </Drawer>
  )
}

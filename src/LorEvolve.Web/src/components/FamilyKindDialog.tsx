import { useState } from 'react'
import { useI18n } from '../i18n'
import { Drawer } from './Drawer'
import { FamilySemanticSelect } from './FamilySemanticSelect'
import { KindFields, type KindNames } from './KindFields'
import { payloadKey } from '../lib/drawerGuard'
import { useFormSave } from '../lib/useFormSave'
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

const EMPTY: KindNames = { name: '', inverseName: '', isSymmetric: false }

/**
 * A new family relation kind, made without leaving the Family Tree: an ordinary relation kind, posted to the same route
 * and validated the same way as one made under Types → Relation kinds, with only the fields a family connection needs.
 * Its Canon constraints, if it wants any, are set there later. Opens on a family meaning that defines no ancestry, since
 * that is what an author reaching for "uncle of" mid-tree needs.
 */
export function FamilyKindDialog({ universeId, onClose, onCreated }: Props) {
  const { t, tx } = useI18n()
  const [names, setNames] = useState<KindNames>(EMPTY)
  const [semantic, setSemantic] = useState<FamilySemanticValue>(FamilySemantic.NonStructuralFamily)
  const { name, inverseName, isSymmetric } = names
  const form = useFormSave({
    needChange: t('places.kindDialog.fieldErrors'),
    failed: t('places.kindDialog.failed'),
  })
  const { fieldErrors, message, isSaving } = form

  const isDirty =
    payloadKey({ ...names, semantic }) !==
    payloadKey({ ...EMPTY, semantic: FamilySemantic.NonStructuralFamily })

  // A kind that reads the same both ways names no parent side, so only the meaning that defines no ancestry is left.
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
      initialFocus="#family-kind-name"
      testId="family-kind-dialog"
      titleId="family-kind-heading"
      eyebrow={t('places.kindDialog.eyebrow')}
      title={t('places.kindDialog.title')}
      isDirty={isDirty}
      leaveMessage={t('places.kindDialog.leave')}
      busy={isSaving}
      onClose={onClose}
      onSubmit={() => void save()}
      message={message}
      messageTestId="family-kind-error"
      actions={{
        submitLabel: t('places.kindDialog.create'),
        busyLabel: t('places.kindDialog.creating'),
        submitTestId: 'create-family-kind',
        cancelTestId: 'cancel-family-kind',
      }}
    >
      <KindFields
        draft={names}
        edit={(change) => setNames((current) => ({ ...current, ...change }))}
        fieldErrors={fieldErrors}
        idPrefix="family-kind"
        fieldTestIds
        words={{
          name: t('places.kindDialog.name'),
          inverse: t('places.kindDialog.inverse'),
          symmetric: t('places.kindDialog.symmetric'),
        }}
        bothWays={tx('places.kindDialog.bothWays', { reads: <bdi>{reads}</bdi> })}
        bothWaysSpacing="hint"
      />

      <FamilySemanticSelect
        label={t('places.kindDialog.meaning')}
        id="family-kind-meaning"
        testId="family-kind-meaning"
        hint={
          isParentSemantic(chosen)
            ? t('places.kindDialog.hintParent')
            : t('places.kindDialog.hintOther')
        }
        error={fieldErrors.familysemantic}
        options={MEANINGS.map((each) => ({ value: each.value, label: t(each.label) }))}
        value={semantic}
        isSymmetric={isSymmetric}
        fallback={FamilySemantic.NonStructuralFamily}
        onChange={setSemantic}
      />
    </Drawer>
  )
}

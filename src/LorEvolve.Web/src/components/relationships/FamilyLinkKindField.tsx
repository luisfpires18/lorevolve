import { Field } from '../Field'
import { Plus } from 'lucide-react'
import {
  FAMILY_SEMANTIC_WORDS,
  isParentSemantic,
  type RelationshipType,
} from '../../relationships/types'
import { useI18n } from '../../i18n'
import { Button } from '../Button'

export function FamilyLinkKindField({
  kinds,
  kind,
  fieldErrors,
  setKindId,
  setFocalIsSource,
  setIsCreatingKind,
}: {
  kinds: RelationshipType[]
  kind: RelationshipType | undefined
  fieldErrors: Record<string, string>
  setKindId: (kindId: string) => void
  setFocalIsSource: (focalIsSource: boolean) => void
  setIsCreatingKind: (isCreatingKind: boolean) => void
}) {
  const { t } = useI18n()

  /** How a kind is named in the Connection choice: a parent kind says which, any other family kind says nothing more. */
  function kindOption(candidate: RelationshipType) {
    return isParentSemantic(candidate.familySemantic)
      ? t('places.linkForm.parentKind', {
          name: candidate.name,
          word: FAMILY_SEMANTIC_WORDS[candidate.familySemantic],
        })
      : candidate.name
  }

  return (
    <Field label={t('places.linkForm.connection')} id="family-link-kind">
      {(control) => (
        <>
          <select
            {...control}
            aria-invalid={fieldErrors.relationshiptypeid ? true : undefined}
            aria-describedby={fieldErrors.relationshiptypeid ? 'family-link-kind-error' : undefined}
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
            <p className="field__error" id="family-link-kind-error">
              {fieldErrors.relationshiptypeid}
            </p>
          ) : null}
          <Button
            tone="text"
            size="sm"
            icon={Plus}
            className="familylink__newkind"
            onClick={() => setIsCreatingKind(true)}
            data-testid="new-family-kind"
          >
            {t('places.linkForm.newKind')}
          </Button>
        </>
      )}
    </Field>
  )
}

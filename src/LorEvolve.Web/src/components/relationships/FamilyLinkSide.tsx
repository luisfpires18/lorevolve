import { Field } from '../Field'
import type { RelationshipType } from '../../relationships/types'
import { useI18n } from '../../i18n'

export function FamilyLinkSide({
  isParentKind,
  hasTwoReadings,
  kind,
  focal,
  focalIsSource,
  setFocalIsSource,
}: {
  isParentKind: boolean
  hasTwoReadings: boolean
  kind: RelationshipType | undefined
  focal: { id: string; name: string }
  focalIsSource: boolean
  setFocalIsSource: (focalIsSource: boolean) => void
}) {
  const { t } = useI18n()

  return (
    <>
      {isParentKind ? (
        <Field
          as="select"
          label={t('places.linkForm.side')}
          id="family-link-side"
          value={focalIsSource ? 'parent' : 'child'}
          onChange={(event) => setFocalIsSource(event.target.value === 'parent')}
          data-testid="family-link-side"
        >
          <option value="parent">{t('places.linkForm.focalParent', { name: focal.name })}</option>
          <option value="child">{t('places.linkForm.focalChild', { name: focal.name })}</option>
        </Field>
      ) : hasTwoReadings && kind ? (
        <Field
          as="select"
          label={t('places.linkForm.focalIs', { name: focal.name })}
          id="family-link-reading"
          value={focalIsSource ? 'forward' : 'inverse'}
          onChange={(event) => setFocalIsSource(event.target.value === 'forward')}
          data-testid="family-link-reading"
        >
          <option value="forward">{kind.name}</option>
          <option value="inverse">{kind.inverseName}</option>
        </Field>
      ) : null}
    </>
  )
}

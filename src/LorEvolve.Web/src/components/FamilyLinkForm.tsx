import { useState } from 'react'
import { EntityPicker } from './EntityPicker'
import { FamilyKindDialog } from './FamilyKindDialog'
import { payloadKey } from '../lib/drawerGuard'
import { useDiscardGuard } from '../lib/useDiscardGuard'
import {
  FAMILY_SEMANTIC_WORDS,
  isParentSemantic,
  type RelationshipType,
} from '../relationships/types'
import { useI18n } from '../i18n'
import { familyLinkActions } from '../relationships/familyLinkActions'
import { useFamilyLinkState } from '../relationships/useFamilyLinkState'
import { FamilyLinkKindField } from './relationships/FamilyLinkKindField'
import { FamilyLinkPreview } from './relationships/FamilyLinkPreview'
import { FamilyLinkSide } from './relationships/FamilyLinkSide'
import { FamilyLinkStatus } from './relationships/FamilyLinkStatus'
import { FormActions } from './FormActions'
import { FormMessage } from './FormMessage'

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
  const state = useFamilyLinkState({ kinds })
  const {
    kindId,
    focalIsSource,
    setFocalIsSource,
    related,
    setRelated,
    canonStatus,
    setCanonStatus,
    fieldErrors,
    message,
    isSaving,
    isCreatingKind,
    setKindId,
    setIsCreatingKind,
  } = state

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
  const { confirmLeave } = useDiscardGuard(isDirty, t('places.linkForm.leave'))

  const { cancel, save } = familyLinkActions({
    ...state,
    universeId,
    focal,
    kind,
    asSource,
    confirmLeave,
    onSaved,
    onCancel,
    t,
  })

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

  return (
    <div className="relform familylink" data-testid="family-link-form">
      {preview ? <FamilyLinkPreview preview={preview} /> : null}
      {kind ? (
        <p className="field__hint">
          {isParentKind
            ? t('places.linkForm.hintParent', { word: FAMILY_SEMANTIC_WORDS[kind.familySemantic] })
            : t('places.linkForm.hintOther')}
        </p>
      ) : null}

      <div className="relform__grid">
        <FamilyLinkKindField
          kinds={kinds}
          kind={kind}
          fieldErrors={fieldErrors}
          setKindId={setKindId}
          setFocalIsSource={setFocalIsSource}
          setIsCreatingKind={setIsCreatingKind}
        />

        <FamilyLinkSide
          isParentKind={isParentKind}
          hasTwoReadings={hasTwoReadings}
          kind={kind}
          focal={focal}
          focalIsSource={focalIsSource}
          setFocalIsSource={setFocalIsSource}
        />

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

        <FamilyLinkStatus canonStatus={canonStatus} setCanonStatus={setCanonStatus} />
      </div>

      {message ? <FormMessage testId="family-link-error">{message}</FormMessage> : null}

      <FormActions
        submitLabel={t('places.linkForm.add')}
        busy={isSaving}
        busyLabel={t('places.linkForm.saving')}
        disabled={!kind}
        onSubmit={save}
        submitTestId="save-family-link"
        onCancel={cancel}
        inline
      />

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

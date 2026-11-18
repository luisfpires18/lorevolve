import type { Dispatch, RefObject, SetStateAction } from 'react'
import { Link } from 'react-router-dom'
import { X } from 'lucide-react'
import { referenceContext, referencePath } from '../../ideas/api'
import { referenceKey, type Fields } from '../../ideas/ideaDraft'
import {
  IDEA_REFERENCE_KIND_KEYS,
  IDEA_REFERENCE_KIND_LABELS,
  type IdeaReference,
} from '../../ideas/types'
import { useI18n } from '../../i18n'
import { Button } from '../Button'
import { NewButton } from '../NewButton'

/** An idea editor's references: the list, each with Remove, and the way to add one. */
export function IdeaReferences({
  referencesId,
  draft,
  isHeld,
  removeReference,
  addButton,
  setIsPicking,
  fieldErrors,
}: {
  referencesId: string
  draft: Fields
  isHeld: boolean
  removeReference: (reference: IdeaReference) => void
  addButton: RefObject<HTMLButtonElement | null>
  setIsPicking: Dispatch<SetStateAction<boolean>>
  fieldErrors: Record<string, string>
}) {
  const { t } = useI18n()
  return (
    <section
      className="idea__references"
      aria-labelledby={referencesId}
      data-testid="idea-references"
    >
      <h2 className="idea__subheading" id={referencesId}>
        {t('ideas.editor.references.heading')}
      </h2>
      <p className="field__hint">{t('ideas.editor.references.hint')}</p>

      {draft.universeId === null ? (
        <p className="idea__noreferences" data-testid="idea-references-need-universe">
          {t('ideas.editor.references.needUniverse')}
        </p>
      ) : draft.references.length === 0 ? (
        <p className="idea__noreferences">{t('ideas.editor.references.none')}</p>
      ) : (
        <ul className="idearefs" data-testid="idea-reference-list">
          {draft.references.map((reference) => {
            const kind = IDEA_REFERENCE_KIND_LABELS[reference.kind]
            const kindKey = IDEA_REFERENCE_KIND_KEYS[reference.kind]
            const context = referenceContext(reference)
            return (
              <li
                className="idearef"
                key={referenceKey(reference)}
                data-testid="idea-reference"
                data-kind={kindKey.charAt(0).toUpperCase() + kindKey.slice(1)}
                data-name={reference.name}
                data-trashed={reference.isInTrash ? 'true' : 'false'}
              >
                <span className="idearef__kind">{kind}</span>
                <span className="idearef__what">
                  {reference.isInTrash || draft.universeId === null ? (
                    <span className="idearef__name">
                      <bdi>{reference.name}</bdi>
                    </span>
                  ) : (
                    <Link
                      className="idearef__name"
                      to={referencePath(draft.universeId, reference)}
                      data-testid="idea-reference-open"
                    >
                      <bdi>{reference.name}</bdi>
                    </Link>
                  )}
                  {context ? <span className="idearef__context">{context}</span> : null}
                  {reference.isInTrash ? (
                    <span className="idearef__trashed" data-testid="idea-reference-trashed">
                      {t('ideas.editor.references.trashed')}
                    </span>
                  ) : null}
                </span>
                <Button
                  tone="secondary"
                  size="sm"
                  icon={X}
                  className="idearef__remove"
                  disabled={isHeld}
                  onClick={() => removeReference(reference)}
                  aria-label={t('ideas.editor.references.removeAria', {
                    kind: kind.toLowerCase(),
                    name: reference.name,
                  })}
                  data-testid="idea-reference-remove"
                >
                  <span className="idearef__removelabel">
                    {t('ideas.editor.references.remove')}
                  </span>
                </Button>
              </li>
            )
          })}
        </ul>
      )}

      <NewButton
        tone="secondary"
        ref={addButton}
        disabled={draft.universeId === null || isHeld}
        onClick={() => setIsPicking(true)}
        data-testid="idea-add-reference"
      >
        {t('ideas.editor.references.add')}
      </NewButton>
      {fieldErrors.references ? (
        <p className="field__error" data-testid="idea-references-error">
          {fieldErrors.references}
        </p>
      ) : null}
    </section>
  )
}

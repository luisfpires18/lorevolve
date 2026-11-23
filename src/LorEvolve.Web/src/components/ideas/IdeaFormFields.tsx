import type { RefObject } from 'react'
import { Field } from '../Field'
import { UniverseSelect } from './UniverseSelect'
import type { Fields } from '../../ideas/ideaDraft'
import { IDEA_BODY_MAX_LENGTH, IDEA_TITLE_MAX_LENGTH } from '../../ideas/types'
import type { UniverseSummary } from '../../universes/types'
import { useI18n } from '../../i18n'

/** An idea editor's title, body and universe fields. */
export function IdeaFormFields({
  titleId,
  bodyId,
  universeFieldId,
  fieldErrors,
  titleInput,
  draft,
  isHeld,
  edit,
  isTooLong,
  changeUniverse,
  chosenUniverse,
  universes,
}: {
  titleId: string
  bodyId: string
  universeFieldId: string
  fieldErrors: Record<string, string>
  titleInput: RefObject<HTMLInputElement | null>
  draft: Fields
  isHeld: boolean
  edit: (change: Partial<Fields>) => void
  isTooLong: boolean
  changeUniverse: (next: string | null) => Promise<void>
  chosenUniverse: { id: string; name: string } | null
  universes: UniverseSummary[] | null
}) {
  const { t } = useI18n()
  return (
    <>
      <Field
        id={titleId}
        label={t('ideas.editor.fields.title')}
        error={
          fieldErrors.title ? (
            <span data-testid="idea-title-error">{fieldErrors.title}</span>
          ) : undefined
        }
        name={null}
        ref={titleInput}
        controlClassName="field__input--title"
        type="text"
        dir="auto"
        value={draft.title}
        maxLength={IDEA_TITLE_MAX_LENGTH}
        readOnly={isHeld}
        onChange={(event) => edit({ title: event.target.value })}
        aria-required="true"
        data-testid="idea-title"
      />

      <Field
        as="textarea"
        id={bodyId}
        label={t('ideas.editor.fields.body')}
        hint={t('ideas.editor.fields.bodyHint')}
        error={fieldErrors.body}
        controlClassName="idea__body"
        rows={10}
        value={draft.body}
        readOnly={isHeld}
        spellCheck
        onChange={(event) => edit({ body: event.target.value })}
        aria-invalid={isTooLong || fieldErrors.body ? true : undefined}
        data-testid="idea-body"
        count={{
          used: draft.body.length,
          max: IDEA_BODY_MAX_LENGTH,
          show: 'near',
          words: {
            count: 'ideas.editor.fields.bodyCount',
            tooLong: 'ideas.editor.fields.bodyTooLong',
          },
          // The margin is the hint's; over the limit the count is the plain error, as before.
          className: isTooLong ? undefined : 'idea__count',
          testId: 'idea-body-count',
        }}
      />

      <UniverseSelect
        universes={universes}
        archivedKey="ideas.editor.fields.archivedUniverse"
        stray={chosenUniverse ? { id: chosenUniverse.id, label: chosenUniverse.name } : null}
        id={universeFieldId}
        label={t('ideas.editor.fields.universe')}
        hint={t('ideas.editor.fields.universeHint')}
        error={fieldErrors.universeid}
        value={draft.universeId ?? ''}
        disabled={isHeld}
        onChange={(event) => changeUniverse(event.target.value === '' ? null : event.target.value)}
        data-testid="idea-universe"
        controlClassName="idea__universe"
      />
    </>
  )
}

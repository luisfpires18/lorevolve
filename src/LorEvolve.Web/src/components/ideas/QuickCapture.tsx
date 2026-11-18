import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Plus } from 'lucide-react'
import { Field } from '../Field'
import { ActionIcon } from '../ActionIcon'
import { createIdea } from '../../ideas/api'
import {
  IDEA_TITLE_MAX_LENGTH,
  IdeaReferenceKind,
  type IdeaInput,
  type IdeasScope,
} from '../../ideas/types'
import { ApiError } from '../../lib/api'
import { useI18n } from '../../i18n'

/**
 * What a capture creates from where it was typed: no universe from all ideas, the universe from a universe's, and the
 * universe plus one reference to the story from a story's - which is what puts it in that story's list.
 */
function captureInput(scope: IdeasScope, title: string): IdeaInput {
  return {
    title,
    body: '',
    universeId: scope.kind === 'all' ? null : scope.universe.id,
    references:
      scope.kind === 'story' ? [{ kind: IdeaReferenceKind.Story, id: scope.story.id }] : [],
    expectedUpdatedAt: null,
    projectId: scope.kind === 'project' ? scope.project.id : null,
  }
}

/**
 * One line, kept without leaving the list: the words become the title of a new idea with no body, placed by the list it
 * was typed in (`captureInput`). Enter keeps it, except while an input method is still composing. Kept words are cleared
 * and said so; refused ones stay in the box with the reason beside it. The full editor is one click away on the new row.
 */
export function QuickCapture({ scope, onCaptured }: { scope: IdeasScope; onCaptured: () => void }) {
  const { t } = useI18n()
  const inputId = useId()
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [said, setSaid] = useState('')
  // A second Enter before the first answer is the same idea, not another one.
  const inFlight = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (inFlight.current) return

    // A new attempt: what was said about the last one no longer applies.
    setSaid('')
    const title = text.trim()
    if (title === '') {
      setError(t('ideas.capture.empty'))
      return
    }

    inFlight.current = true
    setSaving(true)
    setError(null)
    try {
      const idea = await createIdea(captureInput(scope, title))
      setText('')
      // Ready for the next thought, even when the button was what kept this one.
      inputRef.current?.focus()
      setSaid(t('ideas.capture.captured', { title: idea.title }))
      onCaptured()
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.status === 400
          ? caught.message
          : t('ideas.capture.failed'),
      )
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }

  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    // Enter that confirms a composition (Japanese, Chinese, Korean input) is not Enter that submits.
    if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.keyCode === 229)) {
      event.preventDefault()
    }
  }

  return (
    <form
      className="ideacapture"
      onSubmit={(event) => void submit(event)}
      noValidate
      data-testid="idea-capture"
    >
      <Field
        id={inputId}
        label={t('ideas.capture.label')}
        error={
          error ? (
            <span role="alert" data-testid="idea-capture-error">
              {error}
            </span>
          ) : undefined
        }
      >
        {(control) => (
          <div className="ideacapture__row">
            <input
              {...control}
              ref={inputRef}
              className="field__input ideacapture__input"
              name="title"
              type="text"
              autoComplete="off"
              enterKeyHint="done"
              maxLength={IDEA_TITLE_MAX_LENGTH}
              placeholder={t('ideas.capture.placeholder')}
              value={text}
              readOnly={saving}
              onChange={(event) => {
                setText(event.target.value)
                if (error) setError(null)
              }}
              onKeyDown={keyDown}
              data-testid="idea-capture-input"
            />
            <button
              className="button button--secondary ideacapture__submit"
              type="submit"
              disabled={saving}
              data-testid="idea-capture-submit"
            >
              <ActionIcon icon={Plus} />
              {saving ? t('ideas.capture.capturing') : t('ideas.capture.submit')}
            </button>
          </div>
        )}
      </Field>
      {/* Always in the page, so what is said into it is announced. */}
      <p className="ideacapture__status" role="status" data-testid="idea-capture-status">
        {said}
      </p>
    </form>
  )
}

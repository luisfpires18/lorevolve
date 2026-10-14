import { useEffect, useRef, useState } from 'react'
import { ChangeList, EditConflict } from './EditConflict'
import { ApiError } from '../lib/api'
import { payloadKey, useDrawerGuard } from '../lib/drawerGuard'
import { differing, isChangedElsewhere } from '../lib/editConflict'
import { useReturnFocus } from '../lib/returnFocus'
import { createStory, getStory, STORY_CHANGED, updateStory } from '../stories/api'
import {
  STORY_STATUS_LABELS,
  STORY_STATUS_ORDER,
  StoryStatus,
  type StoryDetail,
  type StoryStatusValue,
} from '../stories/types'

interface StoryDraft {
  title: string
  premise: string
  status: StoryStatusValue
}

function draftOf(story: StoryDetail | null): StoryDraft {
  return {
    title: story?.title ?? '',
    premise: story?.premise ?? '',
    status: story?.status ?? StoryStatus.Planning,
  }
}

/** The draft as the save sends it. */
function inputOf(draft: StoryDraft) {
  return {
    title: draft.title.trim(),
    premise: draft.premise.trim() === '' ? null : draft.premise.trim(),
    status: draft.status,
  }
}

interface StoryFormProps {
  universeId: string
  /** The story being changed, or null when one is being started. */
  story: StoryDetail | null
  onClose: () => void
  onSaved: (story: StoryDetail) => void
}

/**
 * A story's title, premise and status, in the same drawer every Lorex form uses. Deliberately small:
 * a story is a title and what it is about, and its scenes are written on its own page.
 */
export function StoryForm({ universeId, story, onClose, onSaved }: StoryFormProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const title = useRef<HTMLInputElement>(null)
  // What the drawer opened on - the story as stored, or the blank form - which the draft is measured against, and the
  // version its save names. After a refused save the author may adopt the latest they reviewed instead (ADR 0043).
  const [base, setBase] = useState(() => ({ draft: draftOf(story), version: story?.version }))
  const initial = base.draft
  const [draft, setDraft] = useState<StoryDraft>(initial)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [conflict, setConflict] = useState(false)
  const saveButton = useRef<HTMLButtonElement>(null)

  const isDirty = payloadKey(inputOf(draft)) !== payloadKey(inputOf(initial))
  const { close, dialogProps } = useDrawerGuard(
    isDirty,
    story
      ? `“${story.title}” has unsaved changes. Leave without saving them?`
      : 'This new story has not been created. Leave without saving it?',
    onClose,
  )

  useReturnFocus()

  useEffect(() => {
    // showModal brings the focus trap, the backdrop and Escape with it.
    dialog.current?.showModal()
    title.current?.focus()
  }, [])

  function edit(change: Partial<StoryDraft>) {
    setDraft((current) => ({ ...current, ...change }))
  }

  async function save() {
    setMessage(null)
    setFieldErrors({})
    setConflict(false)
    setIsSaving(true)

    const input = inputOf(draft)

    try {
      const saved = story
        ? await updateStory(universeId, story.id, { ...input, expectedVersion: base.version })
        : await createStory(universeId, input)
      onSaved(saved)
    } catch (error: unknown) {
      if (isChangedElsewhere(error, STORY_CHANGED)) {
        setConflict(true)
      } else if (error instanceof ApiError) {
        setFieldErrors(error.fieldErrors)
        setMessage(
          Object.keys(error.fieldErrors).length === 0
            ? error.message
            : 'Some details need a change before this can be saved.',
        )
      } else {
        setMessage('That story could not be saved.')
      }
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <dialog
      className="drawer"
      ref={dialog}
      aria-labelledby="story-heading"
      {...dialogProps}
      data-testid="story-form"
    >
      <form
        className="drawer__panel"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <header className="drawer__head">
          {story ? <p className="drawer__eyebrow">Editing a story</p> : null}
          <h2 className="drawer__title" id="story-heading">
            {story ? story.title : 'New story'}
          </h2>
        </header>

        <div className="drawer__body">
          {message ? (
            <p className="form__message" role="alert" data-testid="story-error">
              {message}
            </p>
          ) : null}

          {conflict && story ? (
            <EditConflict
              what="story"
              read={() => getStory(universeId, story.id)}
              renderLatest={(latest) => (
                <ChangeList
                  changes={differing([
                    { label: 'Title', latest: latest.title, mine: draft.title.trim() },
                    { label: 'Premise', latest: latest.premise ?? '', mine: draft.premise.trim() },
                    {
                      label: 'Status',
                      latest: STORY_STATUS_LABELS[latest.status],
                      mine: STORY_STATUS_LABELS[draft.status],
                    },
                  ])}
                />
              )}
              onKeepMine={(latest) => {
                // The form stays as typed, measured against the latest; the next save names the version reviewed.
                setBase({ draft: draftOf(latest), version: latest.version })
                setConflict(false)
                requestAnimationFrame(() => saveButton.current?.focus())
              }}
              onUseLatest={(latest) => {
                setBase({ draft: draftOf(latest), version: latest.version })
                setDraft(draftOf(latest))
                setConflict(false)
                requestAnimationFrame(() => title.current?.focus())
              }}
              testId="story-conflict"
            />
          ) : null}

          <div className="field">
            <label className="field__label" htmlFor="story-title">
              Title
            </label>
            <input
              id="story-title"
              className="field__input"
              ref={title}
              type="text"
              dir="auto"
              placeholder="The Long Winter"
              value={draft.title}
              onChange={(event) => edit({ title: event.target.value })}
              aria-invalid={fieldErrors.title ? true : undefined}
              data-testid="story-title-input"
            />
            {fieldErrors.title ? <p className="field__error">{fieldErrors.title}</p> : null}
          </div>

          <div className="field">
            <label className="field__label" htmlFor="story-premise">
              Premise
            </label>
            <p className="field__hint">What the story is about. Optional.</p>
            <textarea
              id="story-premise"
              className="field__input field__input--area"
              rows={4}
              placeholder="A siege, told from its last day back to its first."
              value={draft.premise}
              onChange={(event) => edit({ premise: event.target.value })}
              aria-invalid={fieldErrors.premise ? true : undefined}
              data-testid="story-premise-input"
            />
            {fieldErrors.premise ? <p className="field__error">{fieldErrors.premise}</p> : null}
          </div>

          <div className="field">
            <span className="field__label" id="story-status-label">
              Status
            </span>
            <div className="segmented" role="group" aria-labelledby="story-status-label">
              {STORY_STATUS_ORDER.map((option) => (
                <button
                  key={option}
                  type="button"
                  className="segmented__option"
                  aria-pressed={draft.status === option}
                  onClick={() => edit({ status: option })}
                  data-testid={`story-status-${STORY_STATUS_LABELS[option].toLowerCase()}`}
                >
                  {STORY_STATUS_LABELS[option]}
                </button>
              ))}
            </div>
            <p className="field__hint">
              Where you are with the telling. It says nothing about canon.
            </p>
            {fieldErrors.status ? <p className="field__error">{fieldErrors.status}</p> : null}
          </div>
        </div>

        <footer className="drawer__actions">
          <button
            ref={saveButton}
            className="button"
            type="submit"
            disabled={isSaving}
            data-testid="save-story"
          >
            {isSaving ? 'Saving' : story ? 'Save story' : 'Create story'}
          </button>
          <button
            className="button button--secondary"
            type="button"
            onClick={close}
            data-testid="cancel-story"
          >
            Cancel
          </button>
        </footer>
      </form>
    </dialog>
  )
}

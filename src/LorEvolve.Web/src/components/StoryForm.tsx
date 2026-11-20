import { useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Field } from './Field'
import { SegmentedField } from './SegmentedField'
import { ChangeList, EditConflict } from './EditConflict'
import { payloadKey } from '../lib/drawerGuard'
import { Drawer } from './Drawer'
import { isChangedElsewhere } from '../lib/editConflict'
import { suggestStoryChanges } from '../suggestions/api'
import { useFormSave } from '../lib/useFormSave'
import { createStory, getStory, STORY_CHANGED, updateStory } from '../stories/api'
import { storyChanges } from '../stories/changes'
import { useI18n } from '../i18n'
import type { WorkspaceContext } from '../pages/UniverseWorkspace'
import {
  STORY_STATUS_KEYS,
  STORY_STATUS_LABELS,
  STORY_STATUS_ORDER,
  StoryStatus,
  type StoryDetail,
  type StoryStatusValue,
} from '../stories/types'
import { FormActions } from './FormActions'

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
  /** Sends the form as a suggestion instead of saving it (task 045); the story itself is not changed. */
  onSuggested?: () => void
}

/**
 * A story's title, premise and status, in the same drawer every LorEvolve form uses. Deliberately small:
 * a story is a title and what it is about, and its scenes are written on its own page.
 */
export function StoryForm({ universeId, story, onClose, onSaved, onSuggested }: StoryFormProps) {
  const { t } = useI18n()
  const suggesting = onSuggested !== undefined && story !== null
  const refreshProjects = useOutletContext<WorkspaceContext | undefined>()?.refreshProjects
  const title = useRef<HTMLInputElement>(null)
  // What the drawer opened on - the story as stored, or the blank form - which the draft is measured against, and the
  // version its save names. After a refused save the author may adopt the latest they reviewed instead (ADR 0043).
  const [base, setBase] = useState(() => ({ draft: draftOf(story), version: story?.version }))
  const initial = base.draft
  const [draft, setDraft] = useState<StoryDraft>(initial)
  const [conflict, setConflict] = useState(false)
  const form = useFormSave({
    refusal: (error) => {
      if (!isChangedElsewhere(error, STORY_CHANGED)) return false
      setConflict(true)
      return true
    },
    needChange: suggesting
      ? t('stories.storyForm.detailsToSend')
      : t('stories.storyForm.detailsToSave'),
    failed: suggesting ? t('stories.storyForm.failedSend') : t('stories.storyForm.failedSave'),
  })
  const { fieldErrors, message, isSaving } = form
  const saveButton = useRef<HTMLButtonElement>(null)

  const isDirty = payloadKey(inputOf(draft)) !== payloadKey(inputOf(initial))

  function edit(change: Partial<StoryDraft>) {
    setDraft((current) => ({ ...current, ...change }))
  }

  async function save() {
    const input = inputOf(draft)

    await form.save(async () => {
      setConflict(false)
      if (suggesting && story && onSuggested) {
        await suggestStoryChanges(universeId, story.id, { ...input, expectedVersion: base.version })
        onSuggested()
        return
      }
      const saved = story
        ? await updateStory(universeId, story.id, { ...input, expectedVersion: base.version })
        : await createStory(universeId, input)
      // A new story is a Writing project: the sidebar's Writing follows it (#272).
      if (!story) refreshProjects?.().catch(() => undefined)
      onSaved(saved)
    })
  }

  return (
    <Drawer
      initialFocus={title}
      testId="story-form"
      titleId="story-heading"
      eyebrow={
        story
          ? suggesting
            ? t('stories.storyForm.eyebrowSuggesting')
            : t('stories.storyForm.eyebrowEditing')
          : null
      }
      title={story ? story.title : t('stories.storyForm.newTitle')}
      isDirty={isDirty}
      leaveMessage={
        suggesting && story
          ? t('stories.storyForm.leaveSuggestion', { title: story.title })
          : story
            ? t('stories.storyForm.leaveUnsaved', { title: story.title })
            : t('stories.storyForm.leaveNew')
      }
      busy={isSaving}
      onClose={onClose}
      onSubmit={() => void save()}
      actions={(close) => (
        <FormActions
          submitLabel={
            suggesting
              ? t('stories.storyForm.sendSuggestion')
              : story
                ? t('stories.storyForm.save')
                : t('stories.storyForm.create')
          }
          busy={isSaving}
          busyLabel={
            suggesting
              ? t('stories.storyForm.sending')
              : story
                ? t('stories.storyForm.saving')
                : t('stories.storyForm.creating')
          }
          disabled={suggesting && !isDirty}
          submitTestId="save-story"
          submitRef={saveButton}
          onCancel={close}
          cancelTestId="cancel-story"
        />
      )}
    >
      {suggesting ? (
        <p className="callout" data-testid="story-suggesting">
          {t('stories.storyForm.suggestingNote')}
        </p>
      ) : null}

      {message ? (
        <p className="form__message" role="alert" data-testid="story-error">
          {message}
        </p>
      ) : null}

      {conflict && story ? (
        <EditConflict
          what={t('stories.storyForm.conflictNoun')}
          read={() => getStory(universeId, story.id)}
          renderLatest={(latest) => <ChangeList changes={storyChanges(latest, draft)} />}
          suggesting={suggesting}
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

      <Field label={t('stories.storyForm.titleLabel')} id="story-title" error={fieldErrors.title}>
        {(control) => (
          <input
            {...control}
            className="field__input"
            ref={title}
            type="text"
            dir="auto"
            placeholder={t('stories.storyForm.titlePlaceholder')}
            value={draft.title}
            onChange={(event) => edit({ title: event.target.value })}
            data-testid="story-title-input"
          />
        )}
      </Field>

      <Field
        label={t('stories.storyForm.premiseLabel')}
        id="story-premise"
        hint={t('stories.storyForm.premiseHint')}
        error={fieldErrors.premise}
      >
        {(control) => (
          <textarea
            {...control}
            className="field__input field__input--area"
            rows={4}
            placeholder={t('stories.storyForm.premisePlaceholder')}
            value={draft.premise}
            onChange={(event) => edit({ premise: event.target.value })}
            data-testid="story-premise-input"
          />
        )}
      </Field>

      <SegmentedField
        label={t('stories.storyForm.statusLabel')}
        id="story-status"
        hint={t('stories.storyForm.statusHint')}
        error={fieldErrors.status}
        options={STORY_STATUS_ORDER.map((option) => ({
          value: option,
          label: STORY_STATUS_LABELS[option],
          testId: `story-status-${STORY_STATUS_KEYS[option]}`,
        }))}
        value={draft.status}
        onChange={(status) => edit({ status })}
      />
    </Drawer>
  )
}

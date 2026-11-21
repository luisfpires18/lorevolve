import { useRef, useState } from 'react'
import { useFormSave } from '../lib/useFormSave'
import { saveStoryPublicSummary } from '../publishing/api'
import { useI18n } from '../i18n'
import { Drawer } from './Drawer'
import { Field } from './Field'
import { PUBLIC_SUMMARY_MAX, type ContentPublicationState } from '../publishing/types'

/**
 * A story's public summary (Task 011): the few lines readers of the public portal are shown about it, in the same
 * drawer every LorEvolve form uses and with the same leave guard. Separate from the premise on purpose - the premise is the
 * author's planning text and is never shown or copied here. A failed save keeps the draft, guarded.
 */
export function StoryPublicSummaryForm({
  universeId,
  storyId,
  title,
  summary,
  onClose,
  onSaved,
}: {
  universeId: string
  storyId: string
  title: string
  summary: string | null
  onClose: () => void
  onSaved: (state: ContentPublicationState) => void
}) {
  const { t } = useI18n()
  const field = useRef<HTMLTextAreaElement>(null)
  const [draft, setDraft] = useState(summary ?? '')
  const form = useFormSave({
    needChange: (fieldErrors, error) => fieldErrors.publicSummary ?? error.message,
    failed: t('stories.summaryForm.failedSave'),
  })

  const isDirty = draft.trim() !== (summary ?? '').trim()

  function save() {
    void form.save(async () =>
      onSaved(await saveStoryPublicSummary(universeId, storyId, draft.trim() || null)),
    )
  }

  return (
    <Drawer
      initialFocus={field}
      testId="story-public-summary-form"
      titleId="story-public-summary-heading"
      eyebrow={t('stories.summaryForm.eyebrow')}
      title={<bdi>{title}</bdi>}
      isDirty={isDirty}
      leaveMessage={t('stories.summaryForm.leaveUnsaved')}
      busy={form.isSaving}
      onClose={onClose}
      onSubmit={save}
      message={form.message}
      messageTestId="story-public-summary-error"
      actions={{
        submitLabel: t('stories.summaryForm.save'),
        busyLabel: t('stories.summaryForm.saving'),
        submitTestId: 'save-story-public-summary',
        cancelTestId: 'cancel-story-public-summary',
      }}
    >
      <Field
        as="textarea"
        id="story-public-summary"
        label={t('stories.summaryForm.label')}
        hint={t('stories.summaryForm.hint')}
        ref={field}
        rows={5}
        dir="auto"
        maxLength={PUBLIC_SUMMARY_MAX}
        aria-invalid={form.message ? true : undefined}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        data-testid="story-public-summary-input"
        count={{
          used: draft.trim().length,
          max: PUBLIC_SUMMARY_MAX,
          show: 'always',
          words: { tooLong: 'stories.summaryForm.count' },
        }}
      />
    </Drawer>
  )
}

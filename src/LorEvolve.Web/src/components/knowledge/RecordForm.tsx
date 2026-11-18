import { Drawer } from '../Drawer'
import { Field } from '../Field'
import { t, useI18n } from '../../i18n'
import { useReturnFocus } from '../../lib/returnFocus'
import { KNOWLEDGE_STATEMENT_MAX_LENGTH, type KnowledgeRecord } from '../../knowledge/api'
import { unchaptered } from '../../stories/format'
import { readingOrder } from '../../stories/structure'
import { draftKey, type Side } from '../../knowledge/recordDraft'
import { useRecordFormState } from '../../knowledge/useRecordFormState'
import { useRecordStories } from '../../knowledge/useRecordStories'
import { recordFormSave } from '../../knowledge/recordFormSave'
import { RecordOtherField } from './RecordOtherField'
import { RecordSceneFields } from './RecordSceneFields'
import { FormActions } from '../FormActions'

// ---------- The form ----------

interface RecordFormProps {
  universeId: string
  entityId: string
  entityName: string
  side: Side
  record: KnowledgeRecord | null
  onClose: () => void
  onSaved: () => void
}

/**
 * One record, created or edited in a drawer. From the "knows" side the knower is this entry and the subject is chosen;
 * from the "about" side the subject is this entry and the knower is chosen. The scene is picked story first, then scene in
 * reading order, unless the record is known from the start.
 */
export function RecordForm({
  universeId,
  entityId,
  entityName,
  side,
  record,
  onClose,
  onSaved,
}: RecordFormProps) {
  const { tx } = useI18n()
  const state = useRecordFormState({ record, side })
  const {
    headingId,
    statementId,
    storyId,
    sceneId,
    startId,
    initial,
    draft,
    setDraft,
    stories,
    storyRead,
    errors,
    message,
    isSaving,
  } = state

  const isDirty = draftKey(draft) !== draftKey(initial)
  useReturnFocus()

  useRecordStories({ ...state, universeId })

  // The story read is only the chosen story's: a read that arrives for a story no longer chosen is not shown.
  const story = storyRead && storyRead.id === draft.storyId ? storyRead : null
  const scenes = story ? readingOrder(story.arcs, story.chapters, story.scenes) : []
  const chapterLabel = (chapterId: string | null) => {
    if (chapterId === null || !story) return unchaptered()
    const index = story.chapters.findIndex((chapter) => chapter.id === chapterId)
    return index < 0
      ? unchaptered()
      : t('ai.knowledge.form.chapter', {
          number: index + 1,
          title: story.chapters[index].title,
        })
  }
  const groupedScenes = scenes.reduce<{ label: string; scenes: typeof scenes }[]>(
    (groups, scene) => {
      const label = chapterLabel(scene.chapterId)
      const last = groups[groups.length - 1]
      if (last && last.label === label) last.scenes.push(scene)
      else groups.push({ label, scenes: [scene] })
      return groups
    },
    [],
  )

  const { save } = recordFormSave({ ...state, universeId, entityId, side, record, onSaved })

  return (
    <Drawer
      testId="knowledge-form"
      titleId={headingId}
      eyebrow={t('ai.knowledge.form.eyebrow')}
      title={
        record
          ? t('ai.knowledge.form.titleEdit')
          : side === 'knows'
            ? tx('ai.knowledge.form.titleKnows', { name: <bdi>{entityName}</bdi> })
            : tx('ai.knowledge.form.titleAbout', { name: <bdi>{entityName}</bdi> })
      }
      context={<p className="drawer__context">{t('ai.knowledge.form.context')}</p>}
      isDirty={isDirty}
      leaveMessage={t('ai.knowledge.form.discard')}
      onClose={onClose}
      submitFrom="body"
      onSubmit={() => void save()}
      noValidate
      actions={(close) => (
        <FormActions
          submitLabel={record ? t('ai.knowledge.form.save') : t('ai.knowledge.form.add')}
          busy={isSaving}
          busyLabel={record ? t('ai.knowledge.form.saving') : t('ai.knowledge.form.adding')}
          submitTestId="knowledge-save"
          onCancel={() => void close()}
          cancelTestId="knowledge-cancel"
        />
      )}
    >
      {message ? (
        <p className="form__message" role="alert" data-testid="knowledge-form-error">
          {message}
        </p>
      ) : null}

      <RecordOtherField
        universeId={universeId}
        entityId={entityId}
        entityName={entityName}
        side={side}
        draft={draft}
        setDraft={setDraft}
        errors={errors}
      />

      <Field label={t('ai.knowledge.form.statement')} id={statementId} error={errors.statement}>
        {(control) => (
          <textarea
            {...control}
            className="field__input field__input--area"
            rows={3}
            dir="auto"
            maxLength={KNOWLEDGE_STATEMENT_MAX_LENGTH}
            value={draft.statement}
            onChange={(event) =>
              setDraft((current) => ({ ...current, statement: event.target.value }))
            }
            data-testid="knowledge-statement"
          />
        )}
      </Field>

      <label className="checkbox" htmlFor={startId}>
        <input
          id={startId}
          type="checkbox"
          checked={draft.knownFromStart}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              knownFromStart: event.target.checked,
              storyId: event.target.checked ? '' : current.storyId,
              sceneId: event.target.checked ? '' : current.sceneId,
            }))
          }
          data-testid="knowledge-from-start"
        />{' '}
        {t('ai.knowledge.fromStartLabel')}
      </label>

      {draft.knownFromStart ? null : (
        <RecordSceneFields
          storyId={storyId}
          sceneId={sceneId}
          draft={draft}
          setDraft={setDraft}
          stories={stories}
          errors={errors}
          story={story}
          groupedScenes={groupedScenes}
        />
      )}
    </Drawer>
  )
}

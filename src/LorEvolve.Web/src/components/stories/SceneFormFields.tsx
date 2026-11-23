import { ChronologyPointFields, type ChronologyPointPart } from '../ChronologyPointFields'
import { EntityPicker } from '../EntityPicker'
import type { Chronology } from '../../chronology/types'
import { Field } from '../Field'
import { useI18n } from '../../i18n'
import { unchaptered } from '../../stories/format'
import { chapterChoices } from '../../stories/structure'
import { SectionListEditor } from '../lore/SectionListEditor'
import { beatEdits } from '../../stories/beats'
import { EMPTY_POINT, type SceneDraft } from '../../stories/sceneDraft'
import type { Chapter, PlotArc, Scene } from '../../stories/types'
import { useId, type RefObject } from 'react'
import { Button } from '../Button'
import { QuietNote } from '../QuietNote'

/** The scene form's fields: title, chapter, summary, beats, notes, point of view, date and lore. */
export function SceneFormFields({
  universeId,
  scene,
  chapters,
  arcs,
  chronology,
  suggesting,
  title,
  draft,
  fieldErrors,
  hasPoint,
  unreckoned,
  edit,
  setPart,
}: {
  universeId: string
  scene: Scene | null
  chapters: Chapter[]
  arcs: PlotArc[]
  chronology: Chronology
  suggesting: boolean
  title: RefObject<HTMLInputElement | null>
  draft: SceneDraft
  fieldErrors: Record<string, string>
  hasPoint: boolean
  unreckoned: boolean
  edit: (change: Partial<SceneDraft>) => void
  setPart: (part: ChronologyPointPart, value: string) => void
}) {
  const { t } = useI18n()
  const beatList = useId()
  const beats = beatEdits(draft.beats, (next) => edit({ beats: next }), beatList)
  const beatName = (index: number) => t('stories.beats.named', { n: index + 1 })

  return (
    <>
      <Field
        id="scene-title"
        label={t('stories.sceneForm.titleLabel')}
        error={fieldErrors.title}
        name={null}
        ref={title}
        type="text"
        dir="auto"
        value={draft.title}
        onChange={(event) => edit({ title: event.target.value })}
        data-testid="scene-title-input"
      />

      {chapters.length > 0 ? (
        <Field
          as="select"
          id="scene-chapter"
          label={t('stories.sceneForm.chapterLabel')}
          hint={
            scene ? t('stories.sceneForm.chapterHintMove') : t('stories.sceneForm.chapterHintNew')
          }
          error={fieldErrors.chapterid}
          value={draft.chapterId}
          onChange={(event) => edit({ chapterId: event.target.value })}
          data-testid="scene-chapter-select"
        >
          <option value="">{unchaptered()}</option>
          {chapterChoices(arcs, chapters).map((choice) => (
            <option key={choice.id} value={choice.id}>
              {choice.label}
            </option>
          ))}
        </Field>
      ) : null}

      <Field
        as="textarea"
        id="scene-summary"
        label={t('stories.sceneForm.summaryLabel')}
        hint={t('stories.sceneForm.summaryHint')}
        error={fieldErrors.summary}
        rows={3}
        value={draft.summary}
        onChange={(event) => edit({ summary: event.target.value })}
        data-testid="scene-summary-input"
      />

      {/* A suggestion never changes a scene's beats: the API takes none from one. */}
      {suggesting ? null : (
        // A scene's beats (ADR 0070): its steps in order, each a title and an optional note, saved with the scene, whole.
        <Field
          group="fieldset"
          className="scenechron"
          label={t('stories.beats.legend')}
          hint={t('stories.beats.hint')}
          error={fieldErrors.beats}
          data-testid="scene-beats-field"
        >
          <SectionListEditor
            bare
            listId={beatList}
            sections={draft.beats}
            sectionLabel={(_, index) => beatName(index)}
            move={beats.move}
            add={beats.add}
            remove={(key) => beats.remove(draft.beats.findIndex((beat) => beat.key === key))}
            words={{
              add: t('stories.beats.add'),
              remove: t('stories.beats.remove'),
              removeLabel: (_, index) => t('stories.beats.removeLabel', { n: index + 1 }),
              moveTitles: { up: t('stories.beats.earlier'), down: t('stories.beats.later') },
            }}
            testIds={{
              row: () => 'scene-beat-row',
              up: () => 'scene-beat-up',
              down: () => 'scene-beat-down',
              remove: () => 'scene-beat-remove',
              add: 'scene-beat-add',
            }}
            row={(beat, index) => (
              <>
                <Field
                  hideLabel
                  name={null}
                  label={t('stories.beats.titleLabel', { n: index + 1 })}
                  error={fieldErrors[`beats[${index}].title`]}
                  type="text"
                  dir="auto"
                  placeholder={t('stories.beats.titlePlaceholder')}
                  value={beat.title}
                  onChange={(event) => beats.update(index, { title: event.target.value })}
                  data-testid="scene-beat-title"
                />
                <Field
                  hideLabel
                  name={null}
                  label={t('stories.beats.noteLabel', { n: index + 1 })}
                  error={fieldErrors[`beats[${index}].note`]}
                  type="text"
                  dir="auto"
                  placeholder={t('stories.beats.notePlaceholder')}
                  value={beat.note}
                  onChange={(event) => beats.update(index, { note: event.target.value })}
                  data-testid="scene-beat-note"
                />
              </>
            )}
          />
        </Field>
      )}

      <Field
        as="textarea"
        id="scene-notes"
        label={t('stories.sceneForm.notesLabel')}
        hint={t('stories.sceneForm.notesHint')}
        error={fieldErrors.notes}
        rows={4}
        value={draft.notes}
        onChange={(event) => edit({ notes: event.target.value })}
        data-testid="scene-notes-input"
      />

      <div data-testid="scene-pov-field">
        <EntityPicker
          label={t('stories.sceneForm.povLabel')}
          universeId={universeId}
          value={draft.pov}
          onChange={(pov) => edit({ pov })}
          error={fieldErrors.poventityid}
        />
      </div>

      <Field
        group="fieldset"
        className="scenechron"
        label={t('stories.sceneForm.whenLegend')}
        hint={t('stories.sceneForm.whenHint')}
      >
        <ChronologyPointFields
          chronology={chronology}
          ids={{
            eraId: 'scene-eraId',
            year: 'scene-year',
            month: 'scene-month',
            day: 'scene-day',
          }}
          value={draft.point}
          onChange={setPart}
          errors={{
            eraId: fieldErrors['chronology.eraid'],
            year: fieldErrors['chronology.year'],
            month: fieldErrors['chronology.month'],
            day: fieldErrors['chronology.day'],
          }}
        />

        {unreckoned ? (
          <QuietNote spacing="hint" testId="scene-unreckoned">
            {t('stories.sceneForm.unreckoned')}
          </QuietNote>
        ) : null}

        {hasPoint ? (
          <p className="types__blockedlinks">
            <Button
              tone="secondary"
              size="sm"
              onClick={() => edit({ point: EMPTY_POINT })}
              data-testid="scene-chronology-clear"
            >
              {t('stories.sceneForm.clearWhen')}
            </Button>
          </p>
        ) : null}
      </Field>

      <div data-testid="scene-lore-field">
        <EntityPicker
          multiple
          label={t('stories.sceneForm.loreLabel')}
          hint={t('stories.sceneForm.loreHint')}
          universeId={universeId}
          value={draft.entities}
          onChange={(entities) => edit({ entities })}
          error={fieldErrors.entityids}
        />
      </div>
    </>
  )
}

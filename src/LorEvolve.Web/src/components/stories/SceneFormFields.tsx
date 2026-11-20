import { ChronologyPointFields, type ChronologyPointPart } from '../ChronologyPointFields'
import { EntityPicker } from '../EntityPicker'
import { EntityMultiPicker } from '../EntityMultiPicker'
import type { Chronology } from '../../chronology/types'
import { Field } from '../Field'
import { useI18n } from '../../i18n'
import { unchaptered } from '../../stories/format'
import { chapterChoices } from '../../stories/structure'
import { SceneBeatsField } from '../SceneBeatsField'
import { EMPTY_POINT, type SceneDraft } from '../../stories/sceneDraft'
import type { Chapter, PlotArc, Scene } from '../../stories/types'
import type { RefObject } from 'react'
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
        placeholder={t('stories.sceneForm.titlePlaceholder')}
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
        <SceneBeatsField
          beats={draft.beats}
          onChange={(beats) => edit({ beats })}
          errors={fieldErrors}
        />
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
          placeholder={t('stories.sceneForm.povPlaceholder')}
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
          <Button
            tone="secondary"
            size="sm"
            className="scenechron__clear"
            onClick={() => edit({ point: EMPTY_POINT })}
            data-testid="scene-chronology-clear"
          >
            {t('stories.sceneForm.clearWhen')}
          </Button>
        ) : null}
      </Field>

      <div data-testid="scene-lore-field">
        <EntityMultiPicker
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

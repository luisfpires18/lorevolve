import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { EraRelations } from '../EraRelations'
import type { Chronology } from '../../chronology/types'
import { t, useI18n } from '../../i18n'
import { EMPTY_FACT, renderFact } from '../../lore/facts'
import type { EntityDetail } from '../../lore/types'
import type { FieldDefinition } from '../../lore/typeDefinitions'
import { formatSpan, resolveFields, type FieldSource } from '../../progression/eras'
import type { Era, Progression } from '../../progression/types'
import { useUniverseAccess } from '../../universes/access'
import { EraItems } from './EraItems'
import { EraPanelHead } from './EraPanelHead'
import { EraLooks } from './EraLooks'
import { EraSteps } from './EraSteps'
import { SectionTitle } from '../Section'
import { Fact } from '../Fact'
import { FactList } from '../FactList'

/** Getters, so each label is looked up in the current language when read. */
const SOURCE_LABELS: Record<FieldSource, string> = {
  get era() {
    return t('progression.view.source.era')
  },
  get cleared() {
    return t('progression.view.source.cleared')
  },
  get entry() {
    return t('progression.view.source.entry')
  },
}

export function EraPanel({
  era,
  entry,
  definitions,
  chronology,
  universeId,
  progression,
  busy,
  isFirst,
  isLast,
  previous,
  next,
  params,
  onEdit,
  onMove,
  onRemove,
}: {
  era: Era
  entry: EntityDetail
  definitions: FieldDefinition[]
  chronology: Chronology
  universeId: string
  progression: Progression
  busy: boolean
  isFirst: boolean
  isLast: boolean
  /** The eras before and after this one in the author's order, for reading the progression straight through. */
  previous: Era | null
  next: Era | null
  params: URLSearchParams
  onEdit: () => void
  onMove: (by: number) => void
  onRemove: () => void
}) {
  const { t } = useI18n()
  const title = useRef<HTMLHeadingElement>(null)
  const shown = useRef(era.id)
  useEffect(() => {
    if (shown.current === era.id) return
    shown.current = era.id
    title.current?.focus()
  }, [era.id])
  const access = useUniverseAccess()
  const span = formatSpan(chronology, era.start, era.end)
  const fields = resolveFields(definitions, entry.fields, era)
  const forms = progression.forms.filter((form) => form.eras.some((one) => one.id === era.id))
  const abilities = progression.abilities.filter((ability) =>
    ability.eras.some((one) => one.id === era.id),
  )
  const looks = progression.appearances.filter((appearance) =>
    appearance.eras.some((one) => one.id === era.id),
  )

  return (
    <article className="erapanel" aria-labelledby="era-title" data-testid="era-panel">
      <EraPanelHead
        era={era}
        entry={entry}
        title={title}
        span={span}
        access={access}
        busy={busy}
        isFirst={isFirst}
        isLast={isLast}
        onEdit={onEdit}
        onMove={onMove}
        onRemove={onRemove}
      />

      {era.description ? (
        <p className="erapanel__description prose" data-testid="era-description">
          {era.description}
        </p>
      ) : null}

      {era.stories.length > 0 || era.scenes.length > 0 ? (
        <div className="rail__block">
          <SectionTitle level={4} tone="label">
            {t('progression.era.covers')}
          </SectionTitle>
          <ul className="eracovers" data-testid="era-covers">
            {era.stories.map((story) => (
              <li key={story.id}>
                {story.isTrashed ? (
                  <span>{t('progression.era.inTrash', { title: story.title })}</span>
                ) : (
                  <Link to={`/app/universes/${universeId}/stories/${story.id}`}>{story.title}</Link>
                )}
              </li>
            ))}
            {era.scenes.map((scene) => (
              <li key={scene.id}>
                {scene.isTrashed ? (
                  <span>{t('progression.era.inTrash', { title: scene.title })}</span>
                ) : (
                  <Link
                    to={`/app/universes/${universeId}/stories/${scene.storyId}#scene-${scene.id}`}
                  >
                    {scene.title}
                  </Link>
                )}
                <span> · {scene.storyTitle}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {fields.length > 0 ? (
        <FactList className="erafacts" testId="era-fields-read">
          {fields.map((field) => (
            <Fact
              name={field.definition.name}
              key={field.definition.id}
              data-source={field.source}
              testId={`era-fact-${field.definition.name}`}
              valueClassName="prose"
            >
              {field.source === 'cleared'
                ? EMPTY_FACT
                : field.value
                  ? renderFact(field.value, chronology)
                  : EMPTY_FACT}
              <span className={`erasource erasource--${field.source}`}>
                {SOURCE_LABELS[field.source]}
              </span>
            </Fact>
          ))}
        </FactList>
      ) : null}

      <EraItems heading={t('progression.era.forms')} era={era} items={forms} testId="era-forms" />
      <EraItems
        heading={t('progression.era.abilities')}
        era={era}
        items={abilities}
        testId="era-abilities"
      />

      {looks.length > 0 ? <EraLooks universeId={universeId} entry={entry} looks={looks} /> : null}

      {/* Read again whenever the progression is saved or restored: an era's dates decide what holds in it. */}
      <EraRelations
        key={progression.version}
        universeId={universeId}
        entityId={entry.id}
        eraId={era.id}
      />

      <EraSteps entry={entry} previous={previous} next={next} params={params} />
    </article>
  )
}

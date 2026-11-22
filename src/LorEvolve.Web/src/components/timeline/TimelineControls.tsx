import { Field } from '../Field'
import { SearchField } from '../SearchField'
import { EntityPicker, type EntityChoice } from '../EntityPicker'
import { t, useI18n } from '../../i18n'
import { CANON_LABELS, CANON_ORDER, type CanonStatusValue } from '../../lore/types'
import type { StorySummary } from '../../stories/types'
import type { WorkspaceContext } from '../../pages/UniverseWorkspace'
import type { Dispatch, SetStateAction } from 'react'
import { SOURCES } from '../../timeline/timelineSources'

/** The search box, the story, source and status filters, and the participant picker. */
export function TimelineControls({
  universe,
  typed,
  setTyped,
  storyId,
  stories,
  story,
  sourceParam,
  canonStatus,
  participant,
  setParticipant,
  page,
  update,
}: {
  universe: WorkspaceContext['universe']
  typed: string
  setTyped: Dispatch<SetStateAction<string>>
  storyId: string | null
  stories: StorySummary[] | null
  story: StorySummary | null
  sourceParam: (typeof SOURCES)[number] | null
  canonStatus: CanonStatusValue | null
  participant: EntityChoice | null
  setParticipant: Dispatch<SetStateAction<EntityChoice | null>>
  page: number
  update: (change: Record<string, string | null>) => void
}) {
  useI18n()
  return (
    <div className="controls chron__controls">
      <SearchField
        className="controls__search"
        id="chron-search"
        label={t('time.timeline.search')}
        placeholder={t('time.timeline.searchPlaceholder')}
        value={typed}
        onChange={setTyped}
        testId="chron-search"
      />

      <div className="controls__filters">
        <Field
          as="select"
          id="chron-story"
          label={t('time.timeline.storyFilter')}
          value={storyId ?? ''}
          onChange={(event) => update({ story: event.target.value })}
          data-testid="chron-story"
        >
          <option value="">{t('time.timeline.allStories')}</option>
          {storyId && stories && !story ? (
            <option value={storyId}>{t('time.timeline.storyUnavailableOption')}</option>
          ) : null}
          {(stories ?? []).map((one) => (
            <option key={one.id} value={one.id}>
              {one.title}
            </option>
          ))}
        </Field>

        <Field
          as="select"
          id="chron-source"
          label={t('time.timeline.show')}
          value={sourceParam?.value ?? ''}
          onChange={(event) => update({ source: event.target.value })}
          data-testid="chron-source"
        >
          <option value="">{t('time.timeline.everything')}</option>
          {SOURCES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label()}
            </option>
          ))}
        </Field>

        <Field
          as="select"
          id="chron-canon"
          label={t('time.timeline.status')}
          value={canonStatus ?? ''}
          onChange={(event) => update({ status: event.target.value })}
          data-testid="chron-canon"
        >
          <option value="">{t('time.timeline.anyStatus')}</option>
          {CANON_ORDER.map((status) => (
            <option key={status} value={status}>
              {CANON_LABELS[status]}
            </option>
          ))}
        </Field>

        <EntityPicker
          label={t('time.timeline.takingPart')}
          universeId={universe.id}
          value={participant}
          onChange={(choice) => {
            setParticipant(choice)
            if (page !== 1) update({ page: null })
          }}
          placeholder={t('time.timeline.takingPartPlaceholder')}
        />
      </div>
    </div>
  )
}

import { useUniverseAccess } from '../../universes/access'
import { findEra, formatChronologyYear, formatSignedYear } from '../../chronology/format'
import { t, useI18n } from '../../i18n'
import { groupTimeline } from '../../timeline/format'
import type { TimelineEntry, TimelineItem } from '../../timeline/types'
import type { WorkspaceContext } from '../../pages/UniverseWorkspace'
import type { Dispatch, SetStateAction } from 'react'
import type { FormState } from '../../timeline/useTimelineState'
import { TimelineRow } from './TimelineRow'
import { QuietNote } from '../QuietNote'

/** The spine: each year group in the order things happen, then the items with no period and the items with no date. */
export function TimelineStream({
  groups,
  unreckoned,
  unplaced,
  chronology,
  access,
  setForm,
  remove,
  universe,
  storyPath,
}: {
  groups: ReturnType<typeof groupTimeline>['groups']
  unreckoned: TimelineItem[]
  unplaced: TimelineItem[]
  chronology: WorkspaceContext['chronology']
  access: ReturnType<typeof useUniverseAccess>
  setForm: Dispatch<SetStateAction<FormState>>
  remove: (entry: TimelineEntry) => Promise<void>
  universe: WorkspaceContext['universe']
  storyPath: (id: string) => string
}) {
  useI18n()
  return (
    <div className="chron__stream" data-testid="chron-stream">
      {groups.map((group, index) => {
        const heading = formatChronologyYear(chronology, group.year, group.eraId)

        // The margin carries the year as the universe writes it, and the era's full name
        // beneath - or the free-text label of a universe that names no eras. An era with no
        // short label is written by its name, which would wrap the year across the narrow
        // margin, so there the margin shows the year and leaves the name to the line below.
        const era = findEra(chronology, group.eraId)
        const margin = era && !era.abbreviation ? formatSignedYear(group.year) : heading
        const aside = era ? era.name : group.eraLabel
        // The era's name is drawn where its years begin, and only said again after that: the year's own mark
        // carries it on every other group, and a column of the same long name is noise, not chronology.
        const previous = groups[index - 1]
        const repeatsEra =
          previous !== undefined &&
          previous.eraId === group.eraId &&
          previous.eraLabel === group.eraLabel

        return (
          <section className="chron__group" key={group.key}>
            <h2 className="chron__year">
              <span className="chron__yearnum">{margin}</span>
              {aside ? (
                <span className={repeatsEra ? 'chron__era visually-hidden' : 'chron__era'}>
                  {aside}
                </span>
              ) : null}
            </h2>
            <ul className="chron__moments">
              {group.entries.map((item) => (
                <TimelineRow
                  key={`${item.sourceKind}:${item.sourceId}`}
                  item={item}
                  heading={heading}
                  chronology={chronology}
                  access={access}
                  setForm={setForm}
                  remove={remove}
                  universe={universe}
                  storyPath={storyPath}
                />
              ))}
            </ul>
          </section>
        )
      })}

      {unreckoned.length > 0 ? (
        <section className="chron__group chron__group--unplaced" data-testid="chron-unreckoned">
          <h2 className="chron__year">
            <span className="chron__yearnum chron__yearnum--none">?</span>
            <span className="chron__era">{t('time.timeline.noPeriod')}</span>
          </h2>
          <div>
            <QuietNote className="chron__aside">{t('time.timeline.noPeriodHint')}</QuietNote>
            <ul className="chron__moments chron__moments--unplaced">
              {unreckoned.map((item) => (
                <TimelineRow
                  key={`${item.sourceKind}:${item.sourceId}`}
                  item={item}
                  chronology={chronology}
                  access={access}
                  setForm={setForm}
                  remove={remove}
                  universe={universe}
                  storyPath={storyPath}
                />
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {unplaced.length > 0 ? (
        <section className="chron__group chron__group--unplaced">
          <h2 className="chron__year">
            <span className="chron__yearnum chron__yearnum--none">?</span>
            <span className="chron__era">{t('time.timeline.unplaced')}</span>
          </h2>
          <div>
            <QuietNote className="chron__aside">{t('time.timeline.unplacedHint')}</QuietNote>
            <ul className="chron__moments chron__moments--unplaced">
              {unplaced.map((item) => (
                <TimelineRow
                  key={`${item.sourceKind}:${item.sourceId}`}
                  item={item}
                  chronology={chronology}
                  access={access}
                  setForm={setForm}
                  remove={remove}
                  universe={universe}
                  storyPath={storyPath}
                />
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </div>
  )
}

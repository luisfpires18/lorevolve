import { useUniverseAccess } from '../../universes/access'
import { useI18n } from '../../i18n'
import { formatTimelineDate } from '../../timeline/format'
import { DATE_KIND_LABELS, type TimelineEntry, type TimelineItem } from '../../timeline/types'
import { CanonBadge } from '../CanonBadge'
import type { WorkspaceContext } from '../../pages/UniverseWorkspace'
import type { Dispatch, SetStateAction } from 'react'
import type { FormState } from '../../timeline/useTimelineState'
import { SOURCE_LABELS } from '../../timeline/timelineSources'
import { MomentMenu } from './MomentMenu'
import { MomentBody } from './MomentBody'
import { SceneBody } from './SceneBody'
import { FactBody } from './FactBody'

/**
 * One item on the spine. `heading` is the year already standing in the margin: an item known only to that year would repeat
 * it word for word, so its own stamp is dropped. A moment opens its drawer; a scene and a fact link to where they live.
 */
export function TimelineRow({
  item,
  heading,
  chronology,
  access,
  setForm,
  remove,
  universe,
  storyPath,
}: {
  item: TimelineItem
  heading?: string
  chronology: WorkspaceContext['chronology']
  access: ReturnType<typeof useUniverseAccess>
  setForm: Dispatch<SetStateAction<FormState>>
  remove: (entry: TimelineEntry) => Promise<void>
  universe: WorkspaceContext['universe']
  storyPath: (id: string) => string
}) {
  useI18n()
  const stamp = formatTimelineDate(item.date, chronology)
  const restates = stamp === heading
  const source = item.sourceKind

  return (
    <li
      className="moment"

      data-kind={item.date.kind}
      data-source={source}
      data-title={item.title}
      data-testid="timeline-item"
    >
      <span className="moment__mark" aria-hidden="true" />

      <div className="moment__head">
        <p className="moment__stamp">
          {stamp && !restates ? <span className="moment__when">{stamp}</span> : null}
          {/* The mark's shape and the date line already say exact, approximate ("c.") or a span; the word is said,
                and shown only where there is no date line to carry it. */}
          <span className={stamp ? 'moment__kind visually-hidden' : 'moment__kind'}>
            {DATE_KIND_LABELS[item.date.kind]}
          </span>
          <span className="moment__source" data-testid="timeline-source">
            {SOURCE_LABELS[source]}
          </span>
          {item.event ? <CanonBadge status={item.event.canonStatus} /> : null}
          {item.loreFact ? <CanonBadge status={item.loreFact.canonStatus} /> : null}
        </p>
        {item.event && access.editContent ? (
          <MomentMenu entry={item.event} setForm={setForm} remove={remove} />
        ) : null}
      </div>

      {item.event ? (
        <MomentBody
          entry={item.event}
          access={access}
          setForm={setForm}
          universe={universe}
          storyPath={storyPath}
        />
      ) : null}
      {item.scene ? <SceneBody item={item} scene={item.scene} storyPath={storyPath} /> : null}
      {item.loreFact ? <FactBody item={item} fact={item.loreFact} universe={universe} /> : null}
    </li>
  )
}

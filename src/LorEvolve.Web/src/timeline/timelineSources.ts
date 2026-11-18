import { t } from '../i18n'
import { TimelineSource, type TimelineSourceValue } from './types'

/** The Source filter's values in the address: words, never the API's numbers. */
export const SOURCES: { value: string; source: TimelineSourceValue; label: () => string }[] = [
  {
    value: 'moments',
    source: TimelineSource.Event,
    label: () => t('time.timeline.sources.moments'),
  },
  { value: 'scenes', source: TimelineSource.Scene, label: () => t('time.timeline.sources.scenes') },
  { value: 'lore', source: TimelineSource.LoreFact, label: () => t('time.timeline.sources.lore') },
]

/** What a row says it is, in words, so its kind never rests on a colour or a shape. */
export const SOURCE_LABELS: Record<TimelineSourceValue, string> = {
  get [TimelineSource.Event]() {
    return t('time.timeline.sourceLabels.moment')
  },
  get [TimelineSource.Scene]() {
    return t('time.timeline.sourceLabels.scene')
  },
  get [TimelineSource.LoreFact]() {
    return t('time.timeline.sourceLabels.lore')
  },
}

import { useUniverseAccess } from '../../universes/access'
import { CalendarRange, Plus } from 'lucide-react'
import { t, useI18n } from '../../i18n'
import { PageHeader } from '../PageHeader'
import type { Dispatch, SetStateAction } from 'react'
import type { FormState } from '../../timeline/useTimelineState'
import { Button } from '../Button'

/** The page header, with the link to the configuration and New moment. */
export function TimelineHeader({
  access,
  setForm,
}: {
  access: ReturnType<typeof useUniverseAccess>
  setForm: Dispatch<SetStateAction<FormState>>
}) {
  useI18n()
  return (
    <PageHeader
      title={t('time.timeline.title')}
      lede={t('time.timeline.lede')}
      actions={
        <>
          {/* How this universe's dates are written and ordered: the calendar, reached from the timeline it governs. */}
          <Button
            tone="secondary"
            icon={CalendarRange}
            to="configuration"
            data-testid="timeline-configuration"
          >
            {t('time.timeline.configuration')}
          </Button>
          {access.editContent ? (
            <Button icon={Plus} onClick={() => setForm({ mode: 'new' })} data-testid="new-moment">
              {t('time.timeline.newMoment')}
            </Button>
          ) : null}
        </>
      }
    />
  )
}

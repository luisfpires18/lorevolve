import { useUniverseAccess } from '../../universes/access'
import { CalendarRange, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ActionIcon } from '../ActionIcon'
import { t, useI18n } from '../../i18n'
import { PageHeader } from '../PageHeader'
import type { Dispatch, SetStateAction } from 'react'
import type { FormState } from '../../timeline/useTimelineState'

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
          <Link
            className="button button--secondary"
            to="configuration"
            data-testid="timeline-configuration"
          >
            <ActionIcon icon={CalendarRange} />
            {t('time.timeline.configuration')}
          </Link>
          {access.editContent ? (
            <button
              className="button"
              type="button"
              onClick={() => setForm({ mode: 'new' })}
              data-testid="new-moment"
            >
              <ActionIcon icon={Plus} />
              {t('time.timeline.newMoment')}
            </button>
          ) : null}
        </>
      }
    />
  )
}

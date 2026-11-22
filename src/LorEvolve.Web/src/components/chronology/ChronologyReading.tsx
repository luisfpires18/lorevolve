import type { Chronology } from '../../chronology/types'
import { t, useI18n } from '../../i18n'
import { EmptyState } from '../EmptyState'
import { PageHeader } from '../PageHeader'
import { QuietNote } from '../QuietNote'
import { Section } from '../Section'
import { CalendarMonthReadingRow } from './CalendarMonthRow'
import { EraReadingRow } from './ChronologyEraRow'

/**
 * A universe's chronology for a collaborator who reads but does not edit (ADR 0041 amendment): the periods and the
 * calendar as lists, not forms.
 */
export function ChronologyReading({ chronology }: { chronology: Chronology }) {
  useI18n()
  return (
    <>
      <PageHeader
        title={t('time.chronology.reading.title')}
        lede={<p>{t('time.chronology.reading.lede')}</p>}
      />
      <Section
        title={t('time.chronology.reading.periods')}
        className="chronology"
        titleId="chronology-reading-heading"
        rule={false}
      >
        {chronology.eras.length === 0 ? (
          <EmptyState testId="chronology-empty" title={t('time.chronology.reading.plain')} />
        ) : (
          <ol className="eras eras--reading" data-testid="eras-reading">
            {chronology.eras.map((era, index) => (
              <EraReadingRow key={era.id} era={era} index={index} />
            ))}
          </ol>
        )}
      </Section>
      <Section
        title={t('time.chronology.reading.calendar')}
        className="chronology calendar"
        titleId="calendar-reading-heading"
        rule={false}
      >
        {chronology.calendar ? (
          <ol className="months months--reading" data-testid="months-reading">
            {chronology.calendar.months.map((month, index) => (
              <CalendarMonthReadingRow key={month.id} month={month} index={index} />
            ))}
          </ol>
        ) : (
          <QuietNote spacing="block" testId="calendar-note">
            {t('time.chronology.reading.simple')}
          </QuietNote>
        )}
      </Section>
    </>
  )
}

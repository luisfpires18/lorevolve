import { useOutletContext } from 'react-router-dom'
import { useI18n } from '../i18n'
import { CalendarEditor } from '../components/CalendarEditor'
import { ChronologyEditor } from '../components/ChronologyEditor'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { EraDirection, EraLabelPosition, type Chronology } from '../chronology/types'
import { useUniverseAccess } from '../universes/access'
import type { WorkspaceContext } from './UniverseWorkspace'

/**
 * A universe's chronology as a workspace section of its own, beside World Rules: the eras its dates are written and
 * ordered in (ADR 0022). Worldbuilding, not configuration - so it left Settings (follow-up to UI refinement 014). The
 * editor, its whole-list save, its preview, its refusals and its leave guard are exactly what they were; only where it
 * lives changed.
 *
 * A collaborator who reads but does not edit (ADR 0041 amendment) is shown the periods as a list, not a form.
 */
export default function ChronologyPage() {
  const { universe, chronology, setChronology } = useOutletContext<WorkspaceContext>()
  const access = useUniverseAccess()

  return (
    <article className="chronologypage" data-testid="chronology-page">
      {access.editContent ? (
        <>
          <ChronologyEditor
            universeId={universe.id}
            chronology={chronology}
            onSaved={setChronology}
          />
          <CalendarEditor
            universeId={universe.id}
            chronology={chronology}
            onSaved={setChronology}
          />
        </>
      ) : (
        <ChronologyReading chronology={chronology} />
      )}
    </article>
  )
}

function ChronologyReading({ chronology }: { chronology: Chronology }) {
  const { t, tn, tx } = useI18n()

  return (
    <>
      <PageHeader
        title={t('time.chronology.reading.title')}
        lede={<p>{t('time.chronology.reading.lede')}</p>}
      />
      <section className="chronology" aria-labelledby="chronology-reading-heading">
        <h2 className="settings__heading" id="chronology-reading-heading">
          {t('time.chronology.reading.periods')}
        </h2>
        {chronology.eras.length === 0 ? (
          <EmptyState testId="chronology-empty" title={t('time.chronology.reading.plain')} />
        ) : (
          <ol className="eras eras--reading" data-testid="eras-reading">
            {chronology.eras.map((era, index) => {
              const label = era.abbreviation ?? era.name
              const sample =
                era.labelPosition === EraLabelPosition.AfterYear ? `1 ${label}` : `${label} 1`
              return (
                <li className="era" key={era.id} data-testid="era-reading">
                  <span className="era__ordinal" aria-hidden="true">
                    {index + 1}
                  </span>
                  <div className="era__body">
                    <p className="era__readname">
                      <bdi>{era.name}</bdi>
                    </p>
                    <p className="field__hint">
                      {tx(
                        era.direction === EraDirection.Descending
                          ? 'time.chronology.reading.countsDown'
                          : 'time.chronology.reading.countsUp',
                        { sample: <bdi>{sample}</bdi> },
                      )}
                    </p>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </section>
      <section className="chronology calendar" aria-labelledby="calendar-reading-heading">
        <h2 className="settings__heading" id="calendar-reading-heading">
          {t('time.chronology.reading.calendar')}
        </h2>
        {chronology.calendar ? (
          <ol className="months months--reading" data-testid="months-reading">
            {chronology.calendar.months.map((month, index) => (
              <li className="month month--reading" key={month.id} data-testid="month-reading">
                <span className="month__ordinal" aria-hidden="true">
                  {index + 1}
                </span>
                <bdi className="month__readname">{month.name}</bdi>
                <span className="month__use">
                  {tn('time.chronology.reading.days', month.dayCount, { n: month.dayCount })}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="settings__note" data-testid="calendar-note">
            {t('time.chronology.reading.simple')}
          </p>
        )}
      </section>
    </>
  )
}

import { t, useI18n } from '../../i18n'
import type {
  CinemaPhase,
  CinemaProduction,
  CinemaSaga,
  CinemaSagas as Sagas,
} from '../../projects/sagas'
import type { Dispatch, SetStateAction } from 'react'
import { Production } from './Production'

/** The productions that belong to no phase, each with the way to add it to one. */
export function SagasUnassigned({
  universeId,
  data,
  busy,
  setAdding,
  phaseChoices,
}: {
  universeId: string
  data: Sagas
  busy: boolean
  setAdding: Dispatch<SetStateAction<CinemaProduction | null>>
  phaseChoices: { saga: CinemaSaga; phase: CinemaPhase }[]
}) {
  useI18n()

  return (
    <section className="projects" data-testid="sagas-unassigned">
      <header className="projects__head">
        <div className="projects__headtext">
          <h2 className="sectionrule">{t('projects.sagas.unassigned')}</h2>
          <p className="projects__lede">{t('projects.sagas.unassignedHint')}</p>
        </div>
      </header>
      {data.unassigned.length === 0 ? (
        <p className="projectcard__meta">{t('projects.sagas.noUnassigned')}</p>
      ) : (
        <ul className="fieldlist">
          {data.unassigned.map((production) => (
            <li
              key={production.projectId}
              className="fieldlist__row"
              data-testid={`unassigned-${production.projectId}`}
            >
              <Production universeId={universeId} production={production} />
              <div className="fieldlist__actions">
                <button
                  className="button button--secondary button--sm"
                  type="button"
                  disabled={busy || phaseChoices.length === 0}
                  title={phaseChoices.length === 0 ? t('projects.sagas.needsPhase') : undefined}
                  data-testid={`unassigned-add-${production.projectId}`}
                  onClick={() => setAdding(production)}
                >
                  {t('projects.sagas.addToPhase')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

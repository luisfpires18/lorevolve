import { useEffect, useState } from 'react'
import { EmptyState } from './EmptyState'
import { t, useI18n } from '../i18n'
import { confirmAction } from '../lib/confirm'
import {
  addMember,
  createPhase,
  createSaga,
  listSagas,
  savePhase,
  saveSaga,
  type CinemaProduction,
  type CinemaSagas as Sagas,
} from '../projects/sagas'
import { SagaSection } from './projects/SagaSection'
import { SagasUnassigned } from './projects/SagasUnassigned'
import { AddDrawer } from './projects/AddDrawer'
import { GroupDrawer, type Editing } from './projects/GroupDrawer'
import { NewButton } from './NewButton'
import { errorText } from '../lib/errorText'
import { LoadError } from './LoadError'
import { LoadingNote } from './LoadingNote'

/**
 * Cinema Sagas and Phases (#289): a universe's release order across its independent films and series. Every action
 * here changes only the saga, the phase or a membership; a production row opens the original project.
 */
export function CinemaSagas({ universeId }: { universeId: string }) {
  useI18n()
  const [data, setData] = useState<Sagas | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<Editing | null>(null)
  const [adding, setAdding] = useState<CinemaProduction | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    listSagas(universeId, controller.signal)
      .then(setData)
      .catch(() => {
        if (!controller.signal.aborted) setFailed(t('projects.sagas.failed'))
      })
    return () => controller.abort()
  }, [universeId])

  function failing(error: unknown) {
    setBusy(false)
    setFailed(errorText(error, t('projects.sagas.failed')))
  }

  function refresh() {
    return listSagas(universeId).then((read) => {
      setData(read)
      setBusy(false)
      setFailed(null)
    })
  }

  function run(work: () => Promise<unknown>) {
    setBusy(true)
    work().then(refresh).catch(failing)
  }

  function confirmDelete(title: string, confirmLabel: string, action: () => Promise<unknown>) {
    void confirmAction({
      title,
      message: t('projects.sagas.deleteMessage'),
      confirmLabel,
      variant: 'destructive',
      action: () => action().then(refresh),
    })
  }

  if (data === null) {
    return failed ? (
      <LoadError
        message={failed}
        onRetry={() => void refresh().catch(failing)}
        testId="sagas-failed"
      />
    ) : (
      <LoadingNote>{t('projects.sagas.loading')}</LoadingNote>
    )
  }

  const phaseChoices = data.sagas.flatMap((saga) => saga.phases.map((phase) => ({ saga, phase })))

  return (
    <div data-testid="cinema-sagas">
      <div className="form__actions">
        <NewButton
          data-testid="saga-new"
          onClick={() => setEditing({ saga: null, phase: null, forPhase: false })}
        >
          {t('projects.sagas.newSaga')}
        </NewButton>
      </div>

      {failed ? (
        <p className="form__message" role="alert">
          {failed}
        </p>
      ) : null}

      {data.sagas.length === 0 ? (
        <EmptyState
          title={t('projects.sagas.empty')}
          hint={t('projects.sagas.emptyHint')}
          testId="sagas-empty"
        />
      ) : null}

      {data.sagas.map((saga, sagaIndex) => (
        <SagaSection
          key={saga.id}
          universeId={universeId}
          data={data}
          busy={busy}
          setEditing={setEditing}
          run={run}
          confirmDelete={confirmDelete}
          saga={saga}
          sagaIndex={sagaIndex}
        />
      ))}

      <SagasUnassigned
        universeId={universeId}
        data={data}
        busy={busy}
        setAdding={setAdding}
        phaseChoices={phaseChoices}
      />

      {editing ? (
        <GroupDrawer
          editing={editing}
          onClose={() => setEditing(null)}
          onSave={(input) => {
            const { saga, phase, forPhase } = editing
            const work = !forPhase
              ? saga
                ? saveSaga(universeId, saga.id, { ...input, expectedVersion: saga.version })
                : createSaga(universeId, input)
              : phase
                ? savePhase(universeId, saga!.id, phase.id, {
                    ...input,
                    expectedVersion: phase.version,
                  })
                : createPhase(universeId, saga!.id, input)
            return work.then(refresh).then(() => setEditing(null))
          }}
        />
      ) : null}

      {adding ? (
        <AddDrawer
          production={adding}
          choices={phaseChoices}
          onClose={() => setAdding(null)}
          onAdd={(saga, phase) =>
            addMember(universeId, saga, phase, adding.projectId)
              .then(refresh)
              .then(() => setAdding(null))
          }
        />
      ) : null}
    </div>
  )
}

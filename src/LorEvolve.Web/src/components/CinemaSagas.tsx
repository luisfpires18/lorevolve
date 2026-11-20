import { useCallback, useState } from 'react'
import { EmptyState } from './EmptyState'
import { t, useI18n } from '../i18n'
import { confirmDelete } from '../lib/confirm'
import {
  addMember,
  createPhase,
  createSaga,
  listSagas,
  savePhase,
  saveSaga,
  type CinemaProduction,
  type Editing,
} from '../projects/sagas'
import { SagaSection } from './projects/SagaSection'
import { SagasUnassigned } from './projects/SagasUnassigned'
import { NameSummaryDrawer } from './NameSummaryDrawer'
import { PickOneDrawer } from './PickOneDrawer'
import { NewButton } from './NewButton'
import { useLoadedList } from '../lib/useLoadedList'
import { LoadError } from './LoadError'
import { LoadingNote } from './LoadingNote'
import { FormMessage } from './FormMessage'

/**
 * Cinema Sagas and Phases (#289): a universe's release order across its independent films and series. Every action
 * here changes only the saga, the phase or a membership; a production row opens the original project.
 */
export function CinemaSagas({ universeId }: { universeId: string }) {
  useI18n()
  const [editing, setEditing] = useState<Editing | null>(null)
  const [adding, setAdding] = useState<CinemaProduction | null>(null)
  const read = useCallback((signal?: AbortSignal) => listSagas(universeId, signal), [universeId])
  const { data, failed, busy, refresh, run } = useLoadedList(read, t('projects.sagas.failed'))

  function askDelete(title: string, confirmLabel: string, action: () => Promise<unknown>) {
    void confirmDelete({ title, message: t('projects.sagas.deleteMessage'), confirmLabel }, () =>
      action().then(refresh),
    )
  }

  if (data === null) {
    return failed ? (
      <LoadError message={failed} onRetry={() => void refresh()} testId="sagas-failed" />
    ) : (
      <LoadingNote>{t('projects.sagas.loading')}</LoadingNote>
    )
  }

  const phaseChoices = data.sagas.flatMap((saga) => saga.phases.map((phase) => ({ saga, phase })))

  return (
    <div data-testid="cinema-sagas">
      <div className="actions form__actions">
        <NewButton
          data-testid="saga-new"
          onClick={() => setEditing({ saga: null, phase: null, forPhase: false })}
        >
          {t('projects.sagas.newSaga')}
        </NewButton>
      </div>

      {failed ? <FormMessage>{failed}</FormMessage> : null}

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
          confirmDelete={askDelete}
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
        <NameSummaryDrawer
          testId="saga-drawer"
          eyebrow={
            editing.forPhase && editing.saga
              ? t('projects.sagas.phaseEyebrow', { saga: editing.saga.name })
              : t('projects.sagas.sagaEyebrow')
          }
          title={
            editing.forPhase
              ? t(editing.phase ? 'projects.sagas.editPhase' : 'projects.sagas.newPhase')
              : t(editing.saga ? 'projects.sagas.editSaga' : 'projects.sagas.newSaga')
          }
          initial={editing.forPhase ? editing.phase : editing.saga}
          words="projects.sagas"
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
        <PickOneDrawer
          testId="saga-add-drawer"
          titleId="saga-add-heading"
          title={t('projects.sagas.addTitle', { name: adding.name })}
          label={t('projects.sagas.phase')}
          choose={t('projects.sagas.choosePhase')}
          options={phaseChoices.map(({ saga, phase }) => ({
            value: phase.id,
            label: `${saga.name} / ${phase.name}`,
          }))}
          submitLabel={t('projects.sagas.add')}
          failed={t('projects.sagas.failed')}
          selectTestId="saga-add-phase"
          submitTestId="saga-add-save"
          onClose={() => setAdding(null)}
          onAdd={(phaseId) => {
            const choice = phaseChoices.find(({ phase }) => phase.id === phaseId)!
            return addMember(universeId, choice.saga.id, phaseId, adding.projectId)
              .then(refresh)
              .then(() => setAdding(null))
          }}
        />
      ) : null}
    </div>
  )
}

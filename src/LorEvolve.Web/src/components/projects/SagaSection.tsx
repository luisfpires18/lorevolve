import { ActionMenuItem } from '../ActionMenu'
import { t, useI18n } from '../../i18n'
import {
  deletePhase,
  deleteSaga,
  moveMember,
  movePhase,
  moveSaga,
  removeMember,
  type CinemaSaga,
  type CinemaSagas as Sagas,
  productionRow,
  type Editing,
} from '../../projects/sagas'
import type { Dispatch, SetStateAction } from 'react'
import { FolderInput } from 'lucide-react'
import { TypeRow } from '../TypeRow'
import { TypeRowActions } from '../TypeRowActions'
import { QuietNote } from '../QuietNote'

/** One saga's row: its verbs, its summary, and its phases with their productions, each a row of its own. */
export function SagaSection({
  universeId,
  data,
  busy,
  setEditing,
  run,
  confirmDelete,
  saga,
  sagaIndex,
}: {
  universeId: string
  data: Sagas
  busy: boolean
  setEditing: Dispatch<SetStateAction<Editing | null>>
  run: (work: () => Promise<unknown>) => void
  confirmDelete: (title: string, confirmLabel: string, action: () => Promise<unknown>) => void
  saga: CinemaSaga
  sagaIndex: number
}) {
  useI18n()

  return (
    <TypeRow
      testId={`saga-${saga.id}`}
      name={saga.name}
      actions={
        <TypeRowActions
          name={saga.name}
          sibling={{
            index: sagaIndex,
            count: data.sagas.length,
            busy,
            to: (next) => run(() => moveSaga(universeId, saga.id, next)),
          }}
          moveTestIds={{ up: `saga-${saga.id}-up`, down: `saga-${saga.id}-down` }}
          addChild={{
            onAdd: () => setEditing({ saga, phase: null, forPhase: true }),
            testId: `saga-phase-new-${saga.id}`,
          }}
          onEdit={() => setEditing({ saga, phase: null, forPhase: false })}
          editTestId={`saga-edit-${saga.id}`}
          words={{
            addChild: t('projects.sagas.newPhase'),
            addChildLabel: t('projects.sagas.newPhaseNamed', { name: saga.name }),
            edit: t('projects.sagas.editSaga'),
            editLabel: t('projects.sagas.editSagaNamed', { name: saga.name }),
            first: t('projects.common.alreadyFirst'),
            last: t('projects.common.alreadyLast'),
          }}
          onDelete={() =>
            confirmDelete(
              t('projects.sagas.deleteSagaTitle', { name: saga.name }),
              t('projects.sagas.deleteSaga'),
              () => deleteSaga(universeId, saga.id),
            )
          }
          deleteLabel={t('projects.sagas.deleteSaga')}
          deleteTestId={`saga-delete-${saga.id}`}
          menuTestId={`saga-actions-${saga.id}`}
        />
      }
    >
      {saga.summary ? <p className="prose">{saga.summary}</p> : null}
      {saga.phases.length === 0 ? (
        <QuietNote spacing="flush">{t('projects.sagas.noPhases')}</QuietNote>
      ) : (
        <ol className="types__list">
          {saga.phases.map((phase, phaseIndex) => (
            <TypeRow
              key={phase.id}
              testId={`phase-${phase.id}`}
              name={phase.name}
              actions={
                <TypeRowActions
                  name={phase.name}
                  sibling={{
                    index: phaseIndex,
                    count: saga.phases.length,
                    busy,
                    to: (next) => run(() => movePhase(universeId, saga.id, phase.id, next)),
                  }}
                  moveTestIds={{ up: `phase-${phase.id}-up`, down: `phase-${phase.id}-down` }}
                  onEdit={() => setEditing({ saga, phase, forPhase: true })}
                  editTestId={`phase-edit-${phase.id}`}
                  words={{
                    edit: t('projects.sagas.editPhase'),
                    editLabel: t('projects.sagas.editPhaseNamed', { name: phase.name }),
                    first: t('projects.common.alreadyFirst'),
                    last: t('projects.common.alreadyLast'),
                  }}
                  onDelete={() =>
                    confirmDelete(
                      t('projects.sagas.deletePhaseTitle', { name: phase.name }),
                      t('projects.sagas.deletePhase'),
                      () => deletePhase(universeId, saga.id, phase.id),
                    )
                  }
                  deleteLabel={t('projects.sagas.deletePhase')}
                  deleteTestId={`phase-delete-${phase.id}`}
                  menuTestId={`phase-actions-${phase.id}`}
                />
              }
            >
              {phase.summary ? <p className="prose">{phase.summary}</p> : null}
              {phase.members.length === 0 ? (
                <QuietNote spacing="flush">{t('projects.sagas.noMembers')}</QuietNote>
              ) : (
                <ol className="types__list" data-testid={`phase-members-${phase.id}`}>
                  {phase.members.map((member, memberIndex) => (
                    <TypeRow
                      key={member.projectId}
                      {...productionRow(universeId, member)}
                      testId={`phase-member-${member.projectId}`}
                      actions={
                        <TypeRowActions
                          name={member.name}
                          sibling={{
                            index: memberIndex,
                            count: phase.members.length,
                            busy,
                            to: (next) =>
                              run(() =>
                                moveMember(universeId, saga.id, phase.id, member.projectId, next),
                              ),
                          }}
                          moveTestIds={{
                            up: `member-${member.projectId}-up`,
                            down: `member-${member.projectId}-down`,
                          }}
                          words={{
                            first: t('projects.common.alreadyFirst'),
                            last: t('projects.common.alreadyLast'),
                          }}
                          menuItems={
                            <ActionMenuItem
                              icon={FolderInput}
                              disabled={busy}
                              testId={`member-remove-${member.projectId}`}
                              onClick={() =>
                                run(() =>
                                  removeMember(universeId, saga.id, phase.id, member.projectId),
                                )
                              }
                            >
                              {t('projects.sagas.remove')}
                            </ActionMenuItem>
                          }
                          menuTestId={`member-actions-${member.projectId}`}
                        />
                      }
                    />
                  ))}
                </ol>
              )}
            </TypeRow>
          ))}
        </ol>
      )}
    </TypeRow>
  )
}

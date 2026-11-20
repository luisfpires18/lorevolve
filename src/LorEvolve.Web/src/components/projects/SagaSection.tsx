import { ActionMenu, ActionMenuItem } from '../ActionMenu'
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
  type Editing,
} from '../../projects/sagas'
import type { Dispatch, SetStateAction } from 'react'
import { MoveItems } from '../MoveItems'
import { Production } from './Production'
import { FolderInput, Pencil, Plus, Trash } from 'lucide-react'
import { ProjectCard } from '../ProjectCard'
import { PageHeader } from '../PageHeader'
import { QuietNote } from '../QuietNote'

/** One saga: its head and menu, and its phases with their productions. */
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
    <section className="projects" data-testid={`saga-${saga.id}`}>
      <PageHeader
        level={2}
        size="panel"
        title={<bdi>{saga.name}</bdi>}
        lede={saga.summary || undefined}
        actions={
          <ActionMenu
            label={t('projects.common.more', { name: saga.name })}
            triggerTestId={`saga-actions-${saga.id}`}
          >
            <MoveItems
              first={sagaIndex === 0}
              last={sagaIndex === data.sagas.length - 1}
              busy={busy}
              testIds={{ up: `saga-${saga.id}-up`, down: `saga-${saga.id}-down` }}
              onMove={(step) => run(() => moveSaga(universeId, saga.id, sagaIndex + step))}
            />
            <ActionMenuItem
              icon={Plus}
              testId={`saga-phase-new-${saga.id}`}
              onClick={() => setEditing({ saga, phase: null, forPhase: true })}
            >
              {t('projects.sagas.newPhase')}
            </ActionMenuItem>
            <ActionMenuItem
              icon={Pencil}
              testId={`saga-edit-${saga.id}`}
              onClick={() => setEditing({ saga, phase: null, forPhase: false })}
            >
              {t('projects.sagas.editSaga')}
            </ActionMenuItem>
            <ActionMenuItem
              icon={Trash}
              tone="danger"
              testId={`saga-delete-${saga.id}`}
              onClick={() =>
                confirmDelete(
                  t('projects.sagas.deleteSagaTitle', { name: saga.name }),
                  t('projects.sagas.deleteSaga'),
                  () => deleteSaga(universeId, saga.id),
                )
              }
            >
              {t('projects.sagas.deleteSaga')}
            </ActionMenuItem>
          </ActionMenu>
        }
      />

      {saga.phases.length === 0 ? (
        <QuietNote>{t('projects.sagas.noPhases')}</QuietNote>
      ) : (
        <ol className="projectcardlist">
          {saga.phases.map((phase, phaseIndex) => (
            <ProjectCard
              key={phase.id}
              testId={`phase-${phase.id}`}
              title={<bdi>{phase.name}</bdi>}
              actions={
                <ActionMenu
                  label={t('projects.common.more', { name: phase.name })}
                  triggerTestId={`phase-actions-${phase.id}`}
                >
                  <MoveItems
                    first={phaseIndex === 0}
                    last={phaseIndex === saga.phases.length - 1}
                    busy={busy}
                    testIds={{ up: `phase-${phase.id}-up`, down: `phase-${phase.id}-down` }}
                    onMove={(step) =>
                      run(() => movePhase(universeId, saga.id, phase.id, phaseIndex + step))
                    }
                  />
                  <ActionMenuItem
                    icon={Pencil}
                    testId={`phase-edit-${phase.id}`}
                    onClick={() => setEditing({ saga, phase, forPhase: true })}
                  >
                    {t('projects.sagas.editPhase')}
                  </ActionMenuItem>
                  <ActionMenuItem
                    icon={Trash}
                    tone="danger"
                    testId={`phase-delete-${phase.id}`}
                    onClick={() =>
                      confirmDelete(
                        t('projects.sagas.deletePhaseTitle', { name: phase.name }),
                        t('projects.sagas.deletePhase'),
                        () => deletePhase(universeId, saga.id, phase.id),
                      )
                    }
                  >
                    {t('projects.sagas.deletePhase')}
                  </ActionMenuItem>
                </ActionMenu>
              }
            >
              {phase.summary ? <p className="prose">{phase.summary}</p> : null}
              {phase.members.length === 0 ? (
                <QuietNote>{t('projects.sagas.noMembers')}</QuietNote>
              ) : (
                <ol className="fieldlist" data-testid={`phase-members-${phase.id}`}>
                  {phase.members.map((member, memberIndex) => (
                    <li
                      key={member.projectId}
                      className="fieldlist__row"
                      data-testid={`phase-member-${member.projectId}`}
                    >
                      <Production universeId={universeId} production={member} />
                      <div className="actions actions--compact fieldlist__actions">
                        <ActionMenu
                          label={t('projects.common.more', { name: member.name })}
                          triggerTestId={`member-actions-${member.projectId}`}
                        >
                          <MoveItems
                            first={memberIndex === 0}
                            last={memberIndex === phase.members.length - 1}
                            busy={busy}
                            testIds={{
                              up: `member-${member.projectId}-up`,
                              down: `member-${member.projectId}-down`,
                            }}
                            onMove={(step) =>
                              run(() =>
                                moveMember(
                                  universeId,
                                  saga.id,
                                  phase.id,
                                  member.projectId,
                                  memberIndex + step,
                                ),
                              )
                            }
                          />
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
                        </ActionMenu>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </ProjectCard>
          ))}
        </ol>
      )}
    </section>
  )
}

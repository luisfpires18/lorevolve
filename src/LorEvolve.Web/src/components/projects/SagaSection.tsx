import { ActionMenu } from '../ActionMenu'
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
} from '../../projects/sagas'
import type { Dispatch, SetStateAction } from 'react'
import { MoveItems } from '../MoveItems'
import { Production } from './Production'
import type { Editing } from './GroupDrawer'
import { FolderInput, Pencil, Plus, Trash } from 'lucide-react'
import { ActionIcon } from '../ActionIcon'
import { PageHeader } from '../PageHeader'

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
              index={sagaIndex}
              count={data.sagas.length}
              busy={busy}
              testId={`saga-${saga.id}`}
              onMove={(place) => run(() => moveSaga(universeId, saga.id, place))}
            />
            <button
              className="actionmenu__item"
              type="button"
              data-testid={`saga-phase-new-${saga.id}`}
              onClick={() => setEditing({ saga, phase: null, forPhase: true })}
            >
              <ActionIcon icon={Plus} />
              {t('projects.sagas.newPhase')}
            </button>
            <button
              className="actionmenu__item"
              type="button"
              data-testid={`saga-edit-${saga.id}`}
              onClick={() => setEditing({ saga, phase: null, forPhase: false })}
            >
              <ActionIcon icon={Pencil} />
              {t('projects.sagas.editSaga')}
            </button>
            <button
              className="actionmenu__item actionmenu__item--danger"
              type="button"
              data-testid={`saga-delete-${saga.id}`}
              onClick={() =>
                confirmDelete(
                  t('projects.sagas.deleteSagaTitle', { name: saga.name }),
                  t('projects.sagas.deleteSaga'),
                  () => deleteSaga(universeId, saga.id),
                )
              }
            >
              <ActionIcon icon={Trash} />
              {t('projects.sagas.deleteSaga')}
            </button>
          </ActionMenu>
        }
      />

      {saga.phases.length === 0 ? (
        <p className="projectcard__meta">{t('projects.sagas.noPhases')}</p>
      ) : (
        <ol className="projectcardlist">
          {saga.phases.map((phase, phaseIndex) => (
            <li key={phase.id} className="projectcard" data-testid={`phase-${phase.id}`}>
              <div className="projectcard__head">
                <h3 className="projectcard__title">
                  <bdi>{phase.name}</bdi>
                </h3>
                <div className="projectcard__actions">
                  <ActionMenu
                    label={t('projects.common.more', { name: phase.name })}
                    triggerTestId={`phase-actions-${phase.id}`}
                  >
                    <MoveItems
                      index={phaseIndex}
                      count={saga.phases.length}
                      busy={busy}
                      testId={`phase-${phase.id}`}
                      onMove={(place) => run(() => movePhase(universeId, saga.id, phase.id, place))}
                    />
                    <button
                      className="actionmenu__item"
                      type="button"
                      data-testid={`phase-edit-${phase.id}`}
                      onClick={() => setEditing({ saga, phase, forPhase: true })}
                    >
                      <ActionIcon icon={Pencil} />
                      {t('projects.sagas.editPhase')}
                    </button>
                    <button
                      className="actionmenu__item actionmenu__item--danger"
                      type="button"
                      data-testid={`phase-delete-${phase.id}`}
                      onClick={() =>
                        confirmDelete(
                          t('projects.sagas.deletePhaseTitle', { name: phase.name }),
                          t('projects.sagas.deletePhase'),
                          () => deletePhase(universeId, saga.id, phase.id),
                        )
                      }
                    >
                      <ActionIcon icon={Trash} />
                      {t('projects.sagas.deletePhase')}
                    </button>
                  </ActionMenu>
                </div>
              </div>
              {phase.summary ? <p className="prose">{phase.summary}</p> : null}
              {phase.members.length === 0 ? (
                <p className="projectcard__meta">{t('projects.sagas.noMembers')}</p>
              ) : (
                <ol className="fieldlist" data-testid={`phase-members-${phase.id}`}>
                  {phase.members.map((member, memberIndex) => (
                    <li
                      key={member.projectId}
                      className="fieldlist__row"
                      data-testid={`phase-member-${member.projectId}`}
                    >
                      <Production universeId={universeId} production={member} />
                      <div className="fieldlist__actions">
                        <ActionMenu
                          label={t('projects.common.more', { name: member.name })}
                          triggerTestId={`member-actions-${member.projectId}`}
                        >
                          <MoveItems
                            index={memberIndex}
                            count={phase.members.length}
                            busy={busy}
                            testId={`member-${member.projectId}`}
                            onMove={(place) =>
                              run(() =>
                                moveMember(universeId, saga.id, phase.id, member.projectId, place),
                              )
                            }
                          />
                          <button
                            className="actionmenu__item"
                            type="button"
                            disabled={busy}
                            data-testid={`member-remove-${member.projectId}`}
                            onClick={() =>
                              run(() =>
                                removeMember(universeId, saga.id, phase.id, member.projectId),
                              )
                            }
                          >
                            <ActionIcon icon={FolderInput} />
                            {t('projects.sagas.remove')}
                          </button>
                        </ActionMenu>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

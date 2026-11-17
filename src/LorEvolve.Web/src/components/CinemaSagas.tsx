import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ActionMenu } from './ActionMenu'
import { Drawer } from './Drawer'
import { EmptyState } from './EmptyState'
import { Field } from './Field'
import { t, useI18n } from '../i18n'
import { confirmAction } from '../lib/confirm'
import { formatLabel, kindLabel, projectPath } from '../projects/sections'
import {
  addMember,
  createPhase,
  createSaga,
  deletePhase,
  deleteSaga,
  listSagas,
  moveMember,
  movePhase,
  moveSaga,
  removeMember,
  savePhase,
  saveSaga,
  type CinemaPhase,
  type CinemaProduction,
  type CinemaSaga,
  type CinemaSagas as Sagas,
} from '../projects/sagas'

/** What the edit drawer is for: a new or existing saga, or a new or existing phase of one saga. */
type Editing = { saga: CinemaSaga | null; phase: CinemaPhase | null; forPhase: boolean }

/** One production row: a link to the original project, with its kind and format. */
function Production({
  universeId,
  production,
}: {
  universeId: string
  production: CinemaProduction
}) {
  return (
    <span className="fieldlist__text">
      <Link
        className="fieldlist__name"
        to={projectPath(production.projectId, '', universeId)}
        data-testid={`saga-production-${production.projectId}`}
      >
        <bdi>{production.name}</bdi>
      </Link>
      <span className="fieldlist__meta">
        {kindLabel(production.kind)}
        {production.format ? ` · ${formatLabel(production.format)}` : ''}
      </span>
    </span>
  )
}

/** Move up / Move down items for a row of an ordered list, as the seasons list has them. */
function MoveItems({
  index,
  count,
  busy,
  testId,
  onMove,
}: {
  index: number
  count: number
  busy: boolean
  testId: string
  onMove: (place: number) => void
}) {
  return (
    <>
      {index === 0 ? null : (
        <button
          className="actionmenu__item"
          type="button"
          disabled={busy}
          data-testid={`${testId}-up`}
          onClick={() => onMove(index - 1)}
        >
          {t('projects.common.moveUp')}
        </button>
      )}
      {index === count - 1 ? null : (
        <button
          className="actionmenu__item"
          type="button"
          disabled={busy}
          data-testid={`${testId}-down`}
          onClick={() => onMove(index + 1)}
        >
          {t('projects.common.moveDown')}
        </button>
      )}
    </>
  )
}

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
    setFailed(error instanceof Error ? error.message : t('projects.sagas.failed'))
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
      <EmptyState title={failed} testId="sagas-failed" />
    ) : (
      <p className="projects__lede">{t('projects.sagas.loading')}</p>
    )
  }

  const phaseChoices = data.sagas.flatMap((saga) => saga.phases.map((phase) => ({ saga, phase })))

  return (
    <div data-testid="cinema-sagas">
      <div className="form__actions">
        <button
          className="button"
          type="button"
          data-testid="saga-new"
          onClick={() => setEditing({ saga: null, phase: null, forPhase: false })}
        >
          {t('projects.sagas.newSaga')}
        </button>
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
        <section key={saga.id} className="projects" data-testid={`saga-${saga.id}`}>
          <header className="projects__head">
            <div className="projects__headtext">
              <h2 className="sectionrule">
                <bdi>{saga.name}</bdi>
              </h2>
              {saga.summary ? <p className="projects__lede">{saga.summary}</p> : null}
            </div>
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
                {t('projects.sagas.newPhase')}
              </button>
              <button
                className="actionmenu__item"
                type="button"
                data-testid={`saga-edit-${saga.id}`}
                onClick={() => setEditing({ saga, phase: null, forPhase: false })}
              >
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
                {t('projects.sagas.deleteSaga')}
              </button>
            </ActionMenu>
          </header>

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
                          onMove={(place) =>
                            run(() => movePhase(universeId, saga.id, phase.id, place))
                          }
                        />
                        <button
                          className="actionmenu__item"
                          type="button"
                          data-testid={`phase-edit-${phase.id}`}
                          onClick={() => setEditing({ saga, phase, forPhase: true })}
                        >
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
                                    moveMember(
                                      universeId,
                                      saga.id,
                                      phase.id,
                                      member.projectId,
                                      place,
                                    ),
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
      ))}

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

function GroupDrawer({
  editing,
  onClose,
  onSave,
}: {
  editing: Editing
  onClose: () => void
  onSave: (input: { name: string; summary: string | null }) => Promise<unknown>
}) {
  const current = editing.forPhase ? editing.phase : editing.saga
  const [name, setName] = useState(current?.name ?? '')
  const [summary, setSummary] = useState(current?.summary ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isDirty = name !== (current?.name ?? '') || summary !== (current?.summary ?? '')
  const title = editing.forPhase
    ? t(current ? 'projects.sagas.editPhase' : 'projects.sagas.newPhase')
    : t(current ? 'projects.sagas.editSaga' : 'projects.sagas.newSaga')

  function save() {
    setSaving(true)
    setError(null)
    onSave({ name: name.trim(), summary: summary.trim() || null }).catch((failure: unknown) => {
      setSaving(false)
      setError(failure instanceof Error ? failure.message : t('projects.sagas.failed'))
    })
  }

  return (
    <Drawer
      testId="saga-drawer"
      titleId="saga-drawer-heading"
      eyebrow={
        editing.forPhase && editing.saga
          ? t('projects.sagas.phaseEyebrow', { saga: editing.saga.name })
          : t('projects.sagas.sagaEyebrow')
      }
      title={title}
      isDirty={isDirty}
      leaveMessage={t('projects.sagas.leave')}
      onClose={onClose}
      onSubmit={save}
      busy={saving}
      actions={(close) => (
        <>
          <button
            className="button"
            type="submit"
            disabled={saving || name.trim() === ''}
            data-testid="saga-drawer-save"
          >
            {saving ? t('projects.sagas.saving') : t('projects.sagas.save')}
          </button>
          <button className="button button--secondary" type="button" onClick={close}>
            {t('projects.common.cancel')}
          </button>
        </>
      )}
    >
      <Field label={t('projects.sagas.name')}>
        {(control) => (
          <input
            {...control}
            className="field__input"
            value={name}
            maxLength={200}
            required
            placeholder={t('projects.sagas.namePlaceholder')}
            data-testid="saga-drawer-name"
            onChange={(event) => setName(event.target.value)}
          />
        )}
      </Field>
      <Field label={t('projects.sagas.summary')}>
        {(control) => (
          <textarea
            {...control}
            className="field__input"
            value={summary}
            maxLength={4000}
            rows={3}
            placeholder={t('projects.sagas.summaryPlaceholder')}
            data-testid="saga-drawer-summary"
            onChange={(event) => setSummary(event.target.value)}
          />
        )}
      </Field>
      {error ? (
        <p className="form__message" role="alert">
          {error}
        </p>
      ) : null}
    </Drawer>
  )
}

function AddDrawer({
  production,
  choices,
  onClose,
  onAdd,
}: {
  production: CinemaProduction
  choices: { saga: CinemaSaga; phase: CinemaPhase }[]
  onClose: () => void
  onAdd: (sagaId: string, phaseId: string) => Promise<unknown>
}) {
  const [chosen, setChosen] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function add() {
    const choice = choices.find(({ phase }) => phase.id === chosen)
    if (!choice) return
    setSaving(true)
    setError(null)
    onAdd(choice.saga.id, choice.phase.id).catch((failure: unknown) => {
      setSaving(false)
      setError(failure instanceof Error ? failure.message : t('projects.sagas.failed'))
    })
  }

  return (
    <Drawer
      testId="saga-add-drawer"
      titleId="saga-add-heading"
      title={t('projects.sagas.addTitle', { name: production.name })}
      onClose={onClose}
      onSubmit={add}
      busy={saving}
      actions={(close) => (
        <>
          <button
            className="button"
            type="submit"
            disabled={saving || chosen === ''}
            data-testid="saga-add-save"
          >
            {t('projects.sagas.add')}
          </button>
          <button className="button button--secondary" type="button" onClick={close}>
            {t('projects.common.cancel')}
          </button>
        </>
      )}
    >
      <Field label={t('projects.sagas.phase')}>
        {(control) => (
          <select
            {...control}
            className="field__input"
            value={chosen}
            data-testid="saga-add-phase"
            onChange={(event) => setChosen(event.target.value)}
          >
            <option value="">{t('projects.sagas.choosePhase')}</option>
            {choices.map(({ saga, phase }) => (
              <option key={phase.id} value={phase.id}>
                {saga.name} / {phase.name}
              </option>
            ))}
          </select>
        )}
      </Field>
      {error ? (
        <p className="form__message" role="alert">
          {error}
        </p>
      ) : null}
    </Drawer>
  )
}

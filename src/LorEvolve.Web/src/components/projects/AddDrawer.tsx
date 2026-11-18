import { useState } from 'react'
import { Drawer } from '../Drawer'
import { Field } from '../Field'
import { t } from '../../i18n'
import type { CinemaPhase, CinemaProduction, CinemaSaga } from '../../projects/sagas'

export function AddDrawer({
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

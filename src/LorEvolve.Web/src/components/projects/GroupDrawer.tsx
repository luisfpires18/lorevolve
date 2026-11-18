import { useState } from 'react'
import { Drawer } from '../Drawer'
import { Field } from '../Field'
import { t } from '../../i18n'
import type { CinemaPhase, CinemaSaga } from '../../projects/sagas'

/** What the edit drawer is for: a new or existing saga, or a new or existing phase of one saga. */
export type Editing = { saga: CinemaSaga | null; phase: CinemaPhase | null; forPhase: boolean }

export function GroupDrawer({
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

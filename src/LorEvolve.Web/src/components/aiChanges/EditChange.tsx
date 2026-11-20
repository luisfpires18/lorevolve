import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { editChange } from '../../aiChanges/api'
import {
  ChangeResource,
  type Change,
  type ChangeEditable,
  type Proposal,
} from '../../aiChanges/types'
import { Field } from '../Field'
import { useI18n } from '../../i18n'
import { ApiError } from '../../lib/api'
import { CANON_LABELS, CanonStatus, type CanonStatusValue } from '../../lore/types'
import { FormActions } from '../FormActions'

/** The plain values a reviewer may change before approving. Saved over the proposal's revision, then checked again. */
export function EditChange({
  universeId,
  proposal,
  change,
  values,
  onCancel,
  onSaved,
}: {
  universeId: string
  proposal: Proposal
  change: Change
  values: ChangeEditable
  onCancel: () => void
  onSaved: (next: Proposal) => void
}) {
  const { t } = useI18n()
  const [draft, setDraft] = useState<ChangeEditable>(values)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const id = useId()
  const form = useRef<HTMLFormElement>(null)

  // The first value takes the focus, so a keyboard edit starts where it should.
  useEffect(() => {
    form.current?.querySelector<HTMLElement>('input, textarea, select')?.focus()
  }, [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      onSaved(
        await editChange(universeId, proposal.proposal.id, change.id, proposal.revision, draft),
      )
    } catch (problem: unknown) {
      setError(problem instanceof ApiError ? problem.message : t('review.aiChange.edit.failed'))
      setSaving(false)
    }
  }

  const text = (name: keyof ChangeEditable, label: string, long = false) =>
    draft[name] === undefined || draft[name] === null ? null : (
      <Field label={label} id={`${id}-${name}`}>
        {(control) =>
          long ? (
            <textarea
              id={control.id}
              className="field__input field__input--area"
              rows={name === 'text' ? 10 : 3}
              dir="auto"
              value={String(draft[name] ?? '')}
              onChange={(event) => setDraft({ ...draft, [name]: event.target.value })}
            />
          ) : (
            <input
              id={control.id}
              className="field__input"
              dir="auto"
              value={String(draft[name] ?? '')}
              onChange={(event) => setDraft({ ...draft, [name]: event.target.value })}
              data-testid={`ai-change-edit-${name}`}
            />
          )
        }
      </Field>
    )

  return (
    <form
      ref={form}
      className="aichangeedit"
      onSubmit={(event) => void submit(event)}
      aria-label={t('review.aiChange.edit.form', { title: change.title })}
      data-testid="ai-change-edit-form"
    >
      {text('name', t('review.aiChange.edit.name'))}
      {text('title', t('review.aiChange.edit.title'))}
      {text('summary', t('review.aiChange.edit.summary'), true)}
      {text('premise', t('review.aiChange.edit.premise'), true)}
      {text('notes', t('review.aiChange.edit.notes'), true)}
      {text('description', t('review.aiChange.edit.description'), true)}
      {text(
        'text',
        change.resource === ChangeResource.Manuscript
          ? t('review.aiChange.edit.prose')
          : change.resource === ChangeResource.Idea
            ? t('review.aiChange.edit.idea')
            : t('review.aiChange.edit.text'),
        true,
      )}
      {draft.canonStatus !== undefined && draft.canonStatus !== null ? (
        <Field
          as="select"
          label={t('review.aiChange.edit.canon')}
          id={`${id}-canon`}
          value={draft.canonStatus ?? ''}
          onChange={(event) =>
            setDraft({ ...draft, canonStatus: Number(event.target.value) as CanonStatusValue })
          }
        >
          {[CanonStatus.Idea, CanonStatus.Draft, CanonStatus.Canon].map((status) => (
            <option key={status} value={status}>
              {CANON_LABELS[status]}
            </option>
          ))}
        </Field>
      ) : null}
      {error ? (
        <p className="form__message" role="alert">
          {error}
        </p>
      ) : null}
      <FormActions
        submitLabel={t('review.aiChange.edit.save')}
        busy={saving}
        busyLabel={t('review.aiChange.edit.saving')}
        submitTestId="ai-change-edit-save"
        onCancel={onCancel}
        lockCancel
        size="sm"
        inline
      />
    </form>
  )
}

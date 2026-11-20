import { useState, type ReactNode } from 'react'
import { Drawer } from './Drawer'
import { Field } from './Field'
import { t } from '../i18n'
import { FormActions } from './FormActions'
import { errorText } from '../lib/errorText'
import { FormMessage } from './FormMessage'

/** The words a name and summary drawer reads: `${words}.save`, `.saving`, `.name` and the rest. */
type NameSummaryWords = 'projects.sagas' | 'projects.comics'

interface NameSummaryDrawerProps {
  /** The dialog's id; `-heading`, `-save`, `-name` and `-summary` are derived from it. */
  testId: string
  eyebrow: ReactNode
  title: ReactNode
  /** What is being edited, or null for a new one. */
  initial: { name: string; summary: string | null } | null
  words: NameSummaryWords
  onClose: () => void
  /** A rejection keeps the drawer open with its message. */
  onSave: (input: { name: string; summary: string | null }) => Promise<unknown>
}

/** A drawer that names something and sums it up: a saga or a phase, a comic collection. */
export function NameSummaryDrawer({
  testId,
  eyebrow,
  title,
  initial,
  words,
  onClose,
  onSave,
}: NameSummaryDrawerProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [summary, setSummary] = useState(initial?.summary ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isDirty = name !== (initial?.name ?? '') || summary !== (initial?.summary ?? '')

  function save() {
    setSaving(true)
    setError(null)
    onSave({ name: name.trim(), summary: summary.trim() || null }).catch((failure: unknown) => {
      setSaving(false)
      setError(errorText(failure, t(`${words}.failed`)))
    })
  }

  return (
    <Drawer
      testId={testId}
      titleId={`${testId}-heading`}
      eyebrow={eyebrow}
      title={title}
      isDirty={isDirty}
      leaveMessage={t(`${words}.leave`)}
      onClose={onClose}
      onSubmit={save}
      busy={saving}
      actions={(close) => (
        <FormActions
          submitLabel={t(`${words}.save`)}
          busy={saving}
          busyLabel={t(
            words === 'projects.sagas' ? 'projects.sagas.saving' : 'projects.comics.saving',
          )}
          disabled={name.trim() === ''}
          submitTestId={`${testId}-save`}
          onCancel={close}
        />
      )}
    >
      <Field
        label={t(`${words}.name`)}
        requiredMark
        name={null}
        value={name}
        maxLength={200}
        required
        placeholder={t(`${words}.namePlaceholder`)}
        data-testid={`${testId}-name`}
        onChange={(event) => setName(event.target.value)}
      />
      <Field
        as="textarea"
        label={t(`${words}.summary`)}
        value={summary}
        maxLength={4000}
        rows={3}
        placeholder={t(`${words}.summaryPlaceholder`)}
        data-testid={`${testId}-summary`}
        onChange={(event) => setSummary(event.target.value)}
      />
      {error ? <FormMessage>{error}</FormMessage> : null}
    </Drawer>
  )
}

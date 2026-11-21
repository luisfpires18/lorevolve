import { useState, type ReactNode } from 'react'
import { Drawer } from './Drawer'
import { Field } from './Field'
import { t } from '../i18n'
import { FormActions } from './FormActions'
import { errorText } from '../lib/errorText'
import { FormMessage } from './FormMessage'

/** The words a name and summary drawer reads: `${words}.save`, `.saving`, `.name` and the rest. */
type NameSummaryWords = 'projects.sagas' | 'projects.comics'

/** The drawer's words given one by one. With no `summary` the drawer asks for the name alone. */
export interface NameSummaryText {
  save: string
  /** Absent: the busy label `FormActions` gives. */
  saving?: string
  name: string
  namePlaceholder?: string
  summary?: string
  summaryPlaceholder?: string
  leave: string
  failed: string
}

interface NameSummaryDrawerProps {
  /** The dialog's id; `-heading`, `-save`, `-cancel`, `-name` and `-summary` are derived from it. */
  testId: string
  /** Each part's id instead, when a screen's ids put the part before a key (`project-page-new-name-<chapter>`). */
  partTestId?: (part: 'heading' | 'save' | 'cancel' | 'name' | 'summary') => string
  eyebrow: ReactNode
  title: ReactNode
  /** What is being edited, or null for a new one. */
  initial: { name: string; summary: string | null } | null
  words: NameSummaryWords | NameSummaryText
  /** The name may be left empty, as a comic page's may. */
  nameOptional?: boolean
  /** The list is busy elsewhere, as with a move in flight: saving waits. */
  busy?: boolean
  onClose: () => void
  /** A rejection keeps the drawer open with its message. */
  onSave: (input: { name: string; summary: string | null }) => Promise<unknown>
}

function textOf(words: NameSummaryWords): NameSummaryText {
  return {
    save: t(`${words}.save`),
    saving: t(words === 'projects.sagas' ? 'projects.sagas.saving' : 'projects.comics.saving'),
    name: t(`${words}.name`),
    namePlaceholder: t(`${words}.namePlaceholder`),
    summary: t(`${words}.summary`),
    summaryPlaceholder: t(`${words}.summaryPlaceholder`),
    leave: t(`${words}.leave`),
    failed: t(`${words}.failed`),
  }
}

/** A drawer that names something and sums it up: a saga or a phase, a comic collection, a season, a comic page. */
export function NameSummaryDrawer({
  testId,
  partTestId = (part) => `${testId}-${part}`,
  eyebrow,
  title,
  initial,
  words,
  nameOptional = false,
  busy = false,
  onClose,
  onSave,
}: NameSummaryDrawerProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [summary, setSummary] = useState(initial?.summary ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isDirty = name !== (initial?.name ?? '') || summary !== (initial?.summary ?? '')
  const text = typeof words === 'string' ? textOf(words) : words

  function save() {
    if (busy || saving) return
    setSaving(true)
    setError(null)
    onSave({ name: name.trim(), summary: summary.trim() || null }).catch((failure: unknown) => {
      setSaving(false)
      setError(errorText(failure, text.failed))
    })
  }

  return (
    <Drawer
      testId={testId}
      titleId={partTestId('heading')}
      eyebrow={eyebrow}
      title={title}
      isDirty={isDirty}
      leaveMessage={text.leave}
      onClose={onClose}
      onSubmit={save}
      busy={saving}
      actions={(close) => (
        <FormActions
          submitLabel={text.save}
          busy={saving}
          busyLabel={text.saving}
          disabled={busy || (!nameOptional && name.trim() === '')}
          submitTestId={partTestId('save')}
          onCancel={close}
          cancelTestId={partTestId('cancel')}
        />
      )}
    >
      <Field
        label={text.name}
        requiredMark={!nameOptional}
        name={null}
        value={name}
        maxLength={200}
        required={!nameOptional}
        placeholder={text.namePlaceholder}
        data-testid={partTestId('name')}
        onChange={(event) => setName(event.target.value)}
      />
      {text.summary ? (
        <Field
          as="textarea"
          label={text.summary}
          value={summary}
          maxLength={4000}
          rows={3}
          placeholder={text.summaryPlaceholder}
          data-testid={partTestId('summary')}
          onChange={(event) => setSummary(event.target.value)}
        />
      ) : null}
      {error ? <FormMessage>{error}</FormMessage> : null}
    </Drawer>
  )
}

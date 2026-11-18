import { useState } from 'react'
import { Drawer } from '../Drawer'
import { Field } from '../Field'
import { t } from '../../i18n'
import type { ComicCollection, ComicCollectionKind } from '../../projects/comicCollections'
import { WORDS } from '../../projects/comicCollectionWords'
import { Button } from '../Button'

/** What the edit drawer is for: a new collection of one kind, or an existing one. */
export type Editing = { kind: ComicCollectionKind; collection: ComicCollection | null }

export function CollectionDrawer({
  editing,
  onClose,
  onSave,
}: {
  editing: Editing
  onClose: () => void
  onSave: (input: { name: string; summary: string | null }) => Promise<unknown>
}) {
  const current = editing.collection
  const [name, setName] = useState(current?.name ?? '')
  const [summary, setSummary] = useState(current?.summary ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isDirty = name !== (current?.name ?? '') || summary !== (current?.summary ?? '')

  function save() {
    setSaving(true)
    setError(null)
    onSave({ name: name.trim(), summary: summary.trim() || null }).catch((failure: unknown) => {
      setSaving(false)
      setError(failure instanceof Error ? failure.message : t('projects.comics.failed'))
    })
  }

  return (
    <Drawer
      testId="comic-collection-drawer"
      titleId="comic-collection-drawer-heading"
      eyebrow={t(WORDS[editing.kind].eyebrow)}
      title={current ? t('projects.comics.edit') : t(WORDS[editing.kind].add)}
      isDirty={isDirty}
      leaveMessage={t('projects.comics.leave')}
      onClose={onClose}
      onSubmit={save}
      busy={saving}
      actions={(close) => (
        <>
          <Button
            type="submit"
            disabled={saving || name.trim() === ''}
            data-testid="comic-collection-drawer-save"
          >
            {saving ? t('projects.comics.saving') : t('projects.comics.save')}
          </Button>
          <Button tone="secondary" onClick={close}>
            {t('projects.common.cancel')}
          </Button>
        </>
      )}
    >
      <Field label={t('projects.comics.name')}>
        {(control) => (
          <input
            {...control}
            className="field__input"
            value={name}
            maxLength={200}
            required
            placeholder={t('projects.comics.namePlaceholder')}
            data-testid="comic-collection-drawer-name"
            onChange={(event) => setName(event.target.value)}
          />
        )}
      </Field>
      <Field label={t('projects.comics.summary')}>
        {(control) => (
          <textarea
            {...control}
            className="field__input"
            value={summary}
            maxLength={4000}
            rows={3}
            placeholder={t('projects.comics.summaryPlaceholder')}
            data-testid="comic-collection-drawer-summary"
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

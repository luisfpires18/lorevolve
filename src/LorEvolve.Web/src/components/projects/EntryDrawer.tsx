import { useState } from 'react'
import { Drawer } from '../Drawer'
import { Field } from '../Field'
import { t } from '../../i18n'
import { levelWord, nameOf } from '../../projectEntities/levelWords'
import type { ComicCollection, ComicNode } from '../../projects/comicCollections'

const nodeLabel = (node: ComicNode) =>
  `${node.projectName} - ${levelWord(node.level)} ${nameOf(node)}`

export function EntryDrawer({
  collection,
  candidates,
  onClose,
  onAdd,
}: {
  collection: ComicCollection
  candidates: ComicNode[]
  onClose: () => void
  onAdd: (nodeId: string) => Promise<unknown>
}) {
  const [chosen, setChosen] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function add() {
    if (chosen === '') return
    setSaving(true)
    setError(null)
    onAdd(chosen).catch((failure: unknown) => {
      setSaving(false)
      setError(failure instanceof Error ? failure.message : t('projects.comics.failed'))
    })
  }

  return (
    <Drawer
      testId="comic-entry-drawer"
      titleId="comic-entry-drawer-heading"
      title={t('projects.comics.addTitle', { name: collection.name })}
      onClose={onClose}
      onSubmit={add}
      busy={saving}
      actions={(close) => (
        <>
          <button
            className="button"
            type="submit"
            disabled={saving || chosen === ''}
            data-testid="comic-entry-drawer-save"
          >
            {t('projects.comics.add')}
          </button>
          <button className="button button--secondary" type="button" onClick={close}>
            {t('projects.common.cancel')}
          </button>
        </>
      )}
    >
      {candidates.length === 0 ? (
        <p className="projectcard__meta">{t('projects.comics.noCandidates')}</p>
      ) : (
        <Field label={t('projects.comics.part')}>
          {(control) => (
            <select
              {...control}
              className="field__input"
              value={chosen}
              data-testid="comic-entry-drawer-node"
              onChange={(event) => setChosen(event.target.value)}
            >
              <option value="">{t('projects.comics.choosePart')}</option>
              {candidates.map((node) => (
                <option key={node.nodeId} value={node.nodeId}>
                  {nodeLabel(node)}
                </option>
              ))}
            </select>
          )}
        </Field>
      )}
      {error ? (
        <p className="form__message" role="alert">
          {error}
        </p>
      ) : null}
    </Drawer>
  )
}

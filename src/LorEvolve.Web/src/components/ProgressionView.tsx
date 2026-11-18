import { useSearchParams } from 'react-router-dom'
import { EmptyState } from './EmptyState'
import { EraForm } from './EraForm'
import { ProgressionItemForm } from './ProgressionItemForm'
import type { Chronology } from '../chronology/types'
import { useI18n } from '../i18n'
import type { EntityDetail } from '../lore/types'
import type { FieldDefinition } from '../lore/typeDefinitions'
import type { Progression } from '../progression/types'
import { useUniverseAccess } from '../universes/access'
import { useProgressionState } from '../progression/useProgressionState'
import { progressionActions } from '../progression/progressionActions'
import { progressionItemActions } from '../progression/progressionItemActions'
import { ProgressionHead } from './progression/ProgressionHead'
import { Overview } from './progression/Overview'
import { EraNav } from './progression/EraNav'
import { EraPanel } from './progression/EraPanel'
import { EraList } from './progression/EraList'
import { ProgressionItems } from './progression/ProgressionItems'
import { ProgressionHistory } from './progression/ProgressionHistory'
import { Button } from './Button'

interface ProgressionViewProps {
  universeId: string
  entry: EntityDetail
  /** The entry's type's active fields, in order. */
  definitions: FieldDefinition[]
  chronology: Chronology
  /** Called after a save or restore, so the page can read the entry again (it now has eras, or none). */
  onChanged: () => void
}

/**
 * An entry's eras (Issue #41), on one entry and one identity: the main profile first, then each era in the author's order,
 * chosen by the address (`?era=`), so a reload, Back and a shared link land on the same one. An era shows what it is, when,
 * the stories and scenes it covers, and every field as it reads then - the era's own value, none, or the entry's - each
 * saying which. Nothing here ever reads another era's value into this one.
 */
export function ProgressionView({
  universeId,
  entry,
  definitions,
  chronology,
  onChanged,
}: ProgressionViewProps) {
  const { t, tn } = useI18n()
  const access = useUniverseAccess()
  const [params, setParams] = useSearchParams()
  const state = useProgressionState({ universeId, entry })
  const {
    progression,
    setProgression,
    failed,
    editing,
    setEditing,
    editingItem,
    setEditingItem,
    message,
    historyKey,
    setHistoryKey,
    busy,
    ticket,
    load,
  } = state

  function changed(next: Progression) {
    ticket.current++
    setProgression(next)
    setHistoryKey((key) => key + 1)
    onChanged()
  }

  if (failed) {
    return (
      <div className="notice notice--error" role="alert">
        <p>{t('progression.view.readFailed')}</p>
        <Button tone="secondary" onClick={() => void load()}>
          {t('progression.view.retry')}
        </Button>
      </div>
    )
  }

  if (!progression) {
    return <p className="muted">{t('progression.view.reading')}</p>
  }

  const selectedId = params.get('era')
  const selected = progression.eras.find((era) => era.id === selectedId) ?? null

  const { choose, move, remove, write } = progressionActions({
    ...state,
    universeId,
    entry,
    t,
    params,
    setParams,
    changed,
  })

  const { removeItem, removeAppearance, moveItem } = progressionItemActions({
    ...state,
    universeId,
    entry,
    t,
    tn,
    changed,
    write,
  })

  return (
    <section
      className="progression"
      aria-labelledby="progression-heading"
      data-testid="progression"
    >
      <ProgressionHead access={access} setEditing={setEditing} />

      {message ? (
        <p className="form__message" role="alert" data-testid="progression-message">
          {message}
        </p>
      ) : null}

      {selected ? null : (
        <Overview universeId={universeId} entry={entry} progression={progression} />
      )}

      {progression.eras.length === 0 ? (
        <EmptyState
          testId="progression-empty"
          title={t('progression.view.empty.title', { name: entry.name })}
          hint={t('progression.view.empty.hint')}
        />
      ) : (
        <>
          <EraNav entry={entry} progression={progression} selected={selected} params={params} />

          {selected ? (
            <EraPanel
              era={selected}
              entry={entry}
              definitions={definitions}
              chronology={chronology}
              universeId={universeId}
              progression={progression}
              busy={busy}
              isFirst={progression.eras[0].id === selected.id}
              isLast={progression.eras[progression.eras.length - 1].id === selected.id}
              previous={progression.eras[progression.eras.indexOf(selected) - 1] ?? null}
              next={progression.eras[progression.eras.indexOf(selected) + 1] ?? null}
              params={params}
              onEdit={() => setEditing(selected)}
              onMove={(by) => move(selected, by)}
              onRemove={() => void remove(selected)}
            />
          ) : (
            <EraList progression={progression} chronology={chronology} params={params} />
          )}
        </>
      )}

      {selected ? null : (
        <ProgressionItems
          universeId={universeId}
          entry={entry}
          progression={progression}
          busy={busy}
          setEditingItem={setEditingItem}
          moveItem={moveItem}
          removeItem={removeItem}
          removeAppearance={removeAppearance}
          load={load}
        />
      )}

      {access.manageHistory && progression.version > 0 ? (
        <ProgressionHistory
          key={historyKey}
          universeId={universeId}
          entityId={entry.id}
          currentVersion={progression.version}
          onRestored={changed}
          onStale={() => void load()}
        />
      ) : null}

      {editing ? (
        <EraForm
          universeId={universeId}
          entityId={entry.id}
          entityName={entry.name}
          definitions={definitions}
          entryFields={entry.fields}
          chronology={chronology}
          progression={progression}
          era={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            const wasNew = editing === 'new'
            setEditing(null)
            changed(saved)
            if (wasNew && saved.eras.length > 0) choose(saved.eras[saved.eras.length - 1].id)
          }}
        />
      ) : null}

      {editingItem ? (
        <ProgressionItemForm
          universeId={universeId}
          entityId={entry.id}
          entityName={entry.name}
          progression={progression}
          kind={editingItem.kind}
          item={editingItem.item}
          onClose={() => setEditingItem(null)}
          onSaved={(saved) => {
            setEditingItem(null)
            changed(saved)
          }}
        />
      ) : null}
    </section>
  )
}

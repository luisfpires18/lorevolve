import { t, useI18n } from '../i18n'
import { useUniverseAccess } from '../universes/access'
import { useOutletContext } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { EmptyState } from '../components/EmptyState'
import type { WorkspaceContext } from './UniverseWorkspace'
import { BulkEraseConfirm } from '../components/trash/BulkEraseConfirm'
import { TrashHeader } from '../components/trash/TrashHeader'
import { TrashNotices } from '../components/trash/TrashNotices'
import { TrashPager } from '../components/trash/TrashPager'
import { TrashRow } from '../components/trash/TrashRow'
import { TrashSelectBar } from '../components/trash/TrashSelectBar'
import { trashActions } from '../trash/trashActions'
import { trashSelectionActions } from '../trash/trashSelectionActions'
import { keyOf } from '../trash/trashText'
import { useTrashReads } from '../trash/useTrashReads'
import { useTrashState } from '../trash/useTrashState'

/**
 * What this universe has thrown away, and the one thing to do about each of it.
 *
 * A list, not a dashboard. Nothing is counted, charted or summarised here: the question the screen answers is "what did I
 * lose, and can I have it back". Each row says what it is in words - an entry, a story, a chapter, a scene, an arc, a beat
 * - and where it was, and every other fact about it is readable in its own place the moment it returns.
 *
 * A row whose story or arc is in the Trash too says so and waits: it is never put somewhere else instead.
 *
 * Every row can also be deleted permanently (ADR 0015, 0029 and 0033, amended): a quiet second action that asks first, in
 * the row, naming what goes with it. Never the loud one - Restore is. A row that must wait to be restored can still be
 * deleted.
 */
export default function UniverseTrash() {
  const { tn } = useI18n()
  const access = useUniverseAccess()
  const { universe, refreshProjects } = useOutletContext<WorkspaceContext>()
  const { user } = useAuth()

  const trash = useTrashState()
  const {
    page,
    setPage,
    state,
    selection,
    setSelection,
    restoring,
    confirming,
    erasing,
    isSelecting,
    bulkConfirming,
    bulkBusy,
    bulkError,
    bulkPanelRef,
  } = trash
  const { load } = useTrashReads({ ...trash, universe })
  const rowActions = trashActions({ ...trash, access, universe, refreshProjects, user, load })

  const result = state.kind === 'ready' ? state.value : null
  const pageItems = result?.items ?? []

  // What is selected belongs to the page on screen, as in Lore: another page is another list, so nothing is ever selected
  // out of sight. Reset while rendering, so no frame shows an old page's selection; and only rows still on screen count.
  if (selection.page !== page) setSelection({ page, keys: new Set() })
  const selectedKeys = selection.page === page ? selection.keys : new Set<string>()
  const selected = pageItems.filter((item) => selectedKeys.has(keyOf(item)))
  // While the question is open or the delete is working, the selection cannot change underneath it.
  const selectionLocked = bulkConfirming || bulkBusy

  const selectionActions = trashSelectionActions({
    ...trash,
    universe,
    user,
    tn,
    load,
    pageItems,
    selectedKeys,
    selected,
    selectionLocked,
  })
  const { bulkErase, cancelBulkErase } = selectionActions

  const busy = restoring !== null || confirming !== null || erasing !== null

  return (
    <article className="trash">
      <TrashHeader
        {...trash}
        {...selectionActions}
        access={access}
        universe={universe}
        pageItems={pageItems}
        busy={busy}
      />

      <TrashNotices {...trash} universe={universe} load={load} />

      {result && result.items.length > 0 ? (
        <ul className="trash__list" data-testid="trash-list">
          {result.items.map((item) => (
            <TrashRow
              key={keyOf(item)}
              {...trash}
              {...rowActions}
              item={item}
              universe={universe}
              access={access}
              busy={busy}
              selectedKeys={selectedKeys}
              selectionLocked={selectionLocked}
              toggle={selectionActions.toggle}
            />
          ))}
        </ul>
      ) : null}

      {result && result.items.length === 0 ? (
        <EmptyState
          testId="trash-empty"
          title={t('data.trash.empty.title')}
          hint={t('data.trash.empty.hint')}
        />
      ) : null}

      {result && result.totalPages > 1 ? (
        <TrashPager result={result} selectionLocked={selectionLocked} setPage={setPage} />
      ) : null}

      {isSelecting && bulkConfirming ? (
        <BulkEraseConfirm
          items={selected}
          panelRef={bulkPanelRef}
          busy={bulkBusy}
          error={bulkError}
          onErase={() => void bulkErase()}
          onCancel={cancelBulkErase}
        />
      ) : null}

      {isSelecting && !bulkConfirming ? (
        <TrashSelectBar
          {...trash}
          {...selectionActions}
          selected={selected}
          pageItems={pageItems}
        />
      ) : null}
    </article>
  )
}

import type { Dispatch, SetStateAction } from 'react'
import { Field } from '../Field'
import { UNASSIGNED } from '../../ideas/useBoardsRead'
import { useI18n } from '../../i18n'
import type { UniverseSummary } from '../../universes/types'

/** The boards list's search, its Show filter and the live or deleted switch. */
export function BoardsControls({
  searchId,
  showId,
  typed,
  setTyped,
  universe,
  show,
  update,
  universes,
  deleted,
}: {
  searchId: string
  showId: string
  typed: string
  setTyped: Dispatch<SetStateAction<string>>
  universe: { id: string; name: string } | null
  show: string
  update: (change: Record<string, string | null>) => void
  universes: UniverseSummary[] | null
  deleted: boolean
}) {
  const { t } = useI18n()
  return (
    <div className="controls ideas__controls">
      <Field id={searchId} className="controls__search" label={t('ideas.boards.filter')}>
        {(control) => (
          <input
            {...control}
            className="field__input"
            type="search"
            placeholder={t('ideas.boards.searchPlaceholder')}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            data-testid="boards-search"
          />
        )}
      </Field>

      {universe ? null : (
        <Field id={showId} className="ideas__show" label={t('ideas.boards.show')}>
          {(control) => (
            <select
              {...control}
              className="field__input field__input--select"
              value={show}
              onChange={(event) => update({ show: event.target.value })}
              data-testid="boards-show"
            >
              <option value="">{t('ideas.boards.allBoards')}</option>
              <option value={UNASSIGNED}>{t('ideas.boards.noUniverse')}</option>
              {(universes ?? []).map((one) => (
                <option key={one.id} value={one.id}>
                  {one.isArchived
                    ? t('ideas.boards.archivedUniverse', { name: one.name })
                    : one.name}
                </option>
              ))}
            </select>
          )}
        </Field>
      )}

      <div className="segmented" role="group" aria-label={t('ideas.boards.which')}>
        <button
          type="button"
          className="segmented__option"
          aria-pressed={!deleted}
          onClick={() => update({ view: null })}
          data-testid="boards-view-live"
        >
          {t('ideas.boards.viewLive')}
        </button>
        <button
          type="button"
          className="segmented__option"
          aria-pressed={deleted}
          onClick={() => update({ view: 'deleted' })}
          data-testid="boards-view-deleted"
        >
          {t('ideas.boards.viewDeleted')}
        </button>
      </div>
    </div>
  )
}

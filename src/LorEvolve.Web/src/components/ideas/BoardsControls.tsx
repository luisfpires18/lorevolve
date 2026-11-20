import type { Dispatch, SetStateAction } from 'react'
import { Field } from '../Field'
import { SearchField } from '../SearchField'
import { SegmentedControl } from '../SegmentedControl'
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
      <SearchField
        id={searchId}
        className="controls__search"
        label={t('ideas.boards.filter')}
        placeholder={t('ideas.boards.searchPlaceholder')}
        value={typed}
        onChange={setTyped}
        testId="boards-search"
      />

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

      <SegmentedControl
        label={t('ideas.boards.which')}
        options={[
          { value: 'live', label: t('ideas.boards.viewLive'), testId: 'boards-view-live' },
          {
            value: 'deleted',
            label: t('ideas.boards.viewDeleted'),
            testId: 'boards-view-deleted',
          },
        ]}
        value={deleted ? 'deleted' : 'live'}
        onChange={(view) => update({ view: view === 'deleted' ? 'deleted' : null })}
      />
    </div>
  )
}

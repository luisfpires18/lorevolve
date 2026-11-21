import type { Dispatch, SetStateAction } from 'react'
import { SearchField } from '../SearchField'
import { SegmentedControl } from '../SegmentedControl'
import { UniverseSelect } from './UniverseSelect'
import { UNASSIGNED, type RecordWords } from '../../ideas/useRecordList'
import { t, useI18n } from '../../i18n'
import type { UniverseSummary } from '../../universes/types'

/**
 * An ideas or boards list's search, its Show filter (outside a universe) and the live or deleted switch. `testIdPrefix`
 * gives `ideas-search`, `ideas-show`, `ideas-view-live`. `strayOption` names a `?show=` universe the list does not
 * have; the boards list has none, so its select shows blank (G2). Catalogue: `docs/design/ui-components.md`.
 */
export function RecordListControls({
  testIdPrefix: id,
  words: w,
  allLabel,
  strayOption,
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
  testIdPrefix: string
  words: RecordWords
  /** The Show filter's first option: "All ideas". */
  allLabel: string
  strayOption: boolean
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
  useI18n() // Re-renders on a language change; the words are read through the module's t.
  return (
    <div className="controls ideas__controls">
      <SearchField
        id={searchId}
        className="controls__search"
        label={t(`${w}.filter`)}
        placeholder={t(`${w}.searchPlaceholder`)}
        value={typed}
        onChange={setTyped}
        testId={`${id}-search`}
      />

      {universe ? null : (
        <UniverseSelect
          universes={universes}
          archivedKey={`${w}.archivedUniverse`}
          stray={
            strayOption && show !== '' && show !== UNASSIGNED
              ? { id: show, label: t('ideas.browser.aUniverse') }
              : null
          }
          id={showId}
          className="ideas__show"
          label={t(`${w}.show`)}
          value={show}
          onChange={(event) => update({ show: event.target.value })}
          data-testid={`${id}-show`}
        >
          <option value="">{allLabel}</option>
          <option value={UNASSIGNED}>{t(`${w}.noUniverse`)}</option>
        </UniverseSelect>
      )}

      <SegmentedControl
        label={t(`${w}.which`)}
        options={[
          { value: 'live', label: t(`${w}.viewLive`), testId: `${id}-view-live` },
          { value: 'deleted', label: t(`${w}.viewDeleted`), testId: `${id}-view-deleted` },
        ]}
        value={deleted ? 'deleted' : 'live'}
        onChange={(view) => update({ view: view === 'deleted' ? 'deleted' : null })}
      />
    </div>
  )
}

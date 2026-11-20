import type { Dispatch, SetStateAction } from 'react'
import { Field } from '../Field'
import { SearchField } from '../SearchField'
import { SegmentedControl } from '../SegmentedControl'
import { UNASSIGNED } from '../../ideas/useIdeasRead'
import { useI18n } from '../../i18n'
import type { UniverseSummary } from '../../universes/types'

/** An ideas list's search, its Show filter and the live or deleted switch. */
export function IdeasControls({
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
        label={t('ideas.browser.filter')}
        placeholder={t('ideas.browser.searchPlaceholder')}
        value={typed}
        onChange={setTyped}
        testId="ideas-search"
      />

      {universe ? null : (
        <Field
          as="select"
          id={showId}
          className="ideas__show"
          label={t('ideas.browser.show')}
          value={show}
          onChange={(event) => update({ show: event.target.value })}
          data-testid="ideas-show"
        >
          <option value="">{t('ideas.browser.allIdeas')}</option>
          <option value={UNASSIGNED}>{t('ideas.browser.noUniverse')}</option>
          {show !== '' && show !== UNASSIGNED && !universes?.some((one) => one.id === show) ? (
            <option value={show}>{t('ideas.browser.aUniverse')}</option>
          ) : null}
          {(universes ?? []).map((one) => (
            <option key={one.id} value={one.id}>
              {one.isArchived ? t('ideas.browser.archivedUniverse', { name: one.name }) : one.name}
            </option>
          ))}
        </Field>
      )}

      <SegmentedControl
        label={t('ideas.browser.which')}
        options={[
          { value: 'live', label: t('ideas.browser.viewLive'), testId: 'ideas-view-live' },
          {
            value: 'deleted',
            label: t('ideas.browser.viewDeleted'),
            testId: 'ideas-view-deleted',
          },
        ]}
        value={deleted ? 'deleted' : 'live'}
        onChange={(view) => update({ view: view === 'deleted' ? 'deleted' : null })}
      />
    </div>
  )
}

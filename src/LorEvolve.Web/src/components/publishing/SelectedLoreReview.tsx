import { useI18n } from '../../i18n'
import type { SelectedLore } from '../../publishing/types'

/**
 * The lore entries that become public with the world (Issue #47), by name and type: a private universe's entry pages do
 * not show which were selected, so the owner reviews them here before saying yes. Nothing here changes a selection.
 */
export function SelectedLoreReview({ selected }: { selected: SelectedLore }) {
  const { t, tn } = useI18n()
  const { totalCount, items } = selected
  if (totalCount === 0) {
    return (
      <p className="settings__note" data-testid="publish-confirm-no-selected-lore">
        <strong>{t('universe.publish.selected.loreLabel')}</strong>{' '}
        {t('universe.publish.selected.none')}
      </p>
    )
  }

  return (
    <div className="publication__selected" data-testid="publish-confirm-selected-lore">
      <p className="settings__note" id="publish-confirm-lore">
        <strong>{t('universe.publish.selected.alsoPublic')}</strong>{' '}
        {tn('universe.publish.selected.some', totalCount, { n: totalCount })}
      </p>
      {/* Focusable so a long list scrolls from the keyboard as well. */}
      <ul className="publication__selectedlist" aria-labelledby="publish-confirm-lore" tabIndex={0}>
        {items.map((entry) => (
          <li key={entry.id} data-testid="publish-confirm-selected-entry">
            <bdi>{entry.name}</bdi>{' '}
            <span className="publication__selectedtype">
              · <bdi>{entry.typeName}</bdi>
            </span>
          </li>
        ))}
      </ul>
      {totalCount > items.length ? (
        <p className="settings__note" data-testid="publish-confirm-selected-more">
          {t('universe.publish.selected.more', { n: totalCount - items.length })}
        </p>
      ) : null}
      <p className="settings__note">{t('universe.publish.selected.again')}</p>
    </div>
  )
}

import { TypeIcon } from './TypeIcon'
import type { MentionSearch } from '../lore/mentionSearch'
import type { EntitySummary } from '../lore/types'

interface MentionSuggestionsProps {
  id: string
  search: MentionSearch
  query: string
  active: number
  position: { top: number; left: number }
  onChoose: (row: EntitySummary) => void
  onHover: (index: number) => void
}

/**
 * The suggestions under the caret while an `@` mention is being typed: each entry's name and type. A listbox the text box
 * drives (`aria-activedescendant`), so the focus never leaves the prose: Up and Down move, Enter or Tab choose, Escape
 * closes. A press chooses without taking the focus.
 */
export function MentionSuggestions({
  id,
  search,
  query,
  active,
  position,
  onChoose,
  onHover,
}: MentionSuggestionsProps) {
  const waiting = search.query === null
  return (
    <div
      className="mentionsuggest"
      style={{ top: position.top, left: position.left }}
      data-testid="mention-suggestions"
    >
      {query.trim() === '' ? (
        <p className="mentionsuggest__note">Type a name to mention Lore.</p>
      ) : waiting ? (
        <p className="mentionsuggest__note">Looking…</p>
      ) : search.failed ? (
        <p className="mentionsuggest__note">Lore could not be searched.</p>
      ) : search.rows.length === 0 ? (
        <p className="mentionsuggest__note" data-testid="mention-suggestions-none">
          No Lore matches “<bdi>{query.trim()}</bdi>”.
        </p>
      ) : (
        <ul className="mentionsuggest__list" role="listbox" id={id} aria-label="Lore to mention">
          {search.rows.map((row, index) => (
            <li
              key={row.id}
              id={`${id}-${index}`}
              role="option"
              aria-selected={index === active}
              className="mentionsuggest__option"
              onMouseDown={(event) => {
                // Keep the caret in the prose: choosing happens on the press, not on a focus change.
                event.preventDefault()
                onChoose(row)
              }}
              onMouseEnter={() => onHover(index)}
              data-testid="mention-suggestion"
              data-name={row.name}
            >
              <TypeIcon iconKey={row.entityTypeIcon} className="mentionsuggest__icon" />
              <span className="mentionsuggest__name">
                <bdi>{row.name}</bdi>
              </span>
              <span className="mentionsuggest__type">
                <bdi>{row.entityTypeName}</bdi>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

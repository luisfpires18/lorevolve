import { useEffect, useId, useState } from 'react'
import { getEntity } from '../lore/api'
import { findNames, linkNames, type NameSource } from '../lore/mentions'
import type { SceneLoreReference } from '../stories/types'

/**
 * "Link names from this scene's Lore" (ADR 0058 amendment): finds where the prose names an entry of the scene's Lore in
 * plain words - its name, an alias, or a first name no other entry shares - and lists each name with how often it
 * appears. Nothing changes until the author confirms; then every ticked name becomes a mention, as one edit of the text
 * box (one undo step), unsaved until Save like any other.
 */
export function NameLinker({
  universeId,
  entities,
  text,
  onLink,
  onClose,
}: {
  universeId: string
  entities: SceneLoreReference[]
  text: string
  onLink: (next: string, count: number) => void
  onClose: () => void
}) {
  const titleId = useId()
  const [sources, setSources] = useState<NameSource[] | 'loading' | 'failed'>('loading')
  const [skipped, setSkipped] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    const controller = new AbortController()
    Promise.all(
      entities
        .filter((entity) => !entity.isTrashed)
        .map((entity) => getEntity(universeId, entity.entityId, controller.signal)),
    )
      .then((entries) =>
        setSources(
          entries.map((entry) => ({
            entityId: entry.id,
            name: entry.name,
            aliases: entry.aliases,
          })),
        ),
      )
      .catch(() => {
        if (!controller.signal.aborted) setSources('failed')
      })
    return () => controller.abort()
  }, [universeId, entities])

  const matches = Array.isArray(sources) ? findNames(text, sources) : []
  const key = (match: { entityId: string; term: string }) => `${match.entityId} ${match.term}`
  const rows = Array.from(
    matches
      .reduce((groups, match) => {
        const row = groups.get(key(match)) ?? { ...match, count: 0 }
        groups.set(key(match), { ...row, count: row.count + 1 })
        return groups
      }, new Map<string, (typeof matches)[number] & { count: number }>())
      .values(),
  )
  const chosen = matches.filter((match) => !skipped.has(key(match)))
  const nameOf = (entityId: string) =>
    Array.isArray(sources) ? sources.find((source) => source.entityId === entityId)?.name : ''

  return (
    <section className="recovery namelinker" aria-labelledby={titleId} data-testid="name-linker">
      <p className="recovery__title" id={titleId}>
        Link names from this scene’s Lore
      </p>
      {sources === 'loading' ? (
        <p className="recovery__text" role="status">
          Looking for names…
        </p>
      ) : sources === 'failed' ? (
        <p className="recovery__text" role="alert">
          This scene’s Lore could not be read. Try again.
        </p>
      ) : rows.length === 0 ? (
        <p className="recovery__text" data-testid="name-linker-none">
          The prose names no entry of this scene’s Lore that is not a mention already.
        </p>
      ) : (
        <>
          <p className="recovery__hint">
            Each ticked name becomes a mention everywhere it appears. Nothing is saved until Save.
          </p>
          <ul className="namelinker__list">
            {rows.map((row) => (
              <li key={key(row)}>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={!skipped.has(key(row))}
                    onChange={(event) =>
                      setSkipped((current) => {
                        const next = new Set(current)
                        if (event.target.checked) next.delete(key(row))
                        else next.add(key(row))
                        return next
                      })
                    }
                    data-testid="name-linker-row"
                    data-term={row.term}
                  />
                  <span>
                    “{row.term}”
                    {row.term === nameOf(row.entityId) ? '' : ` as ${nameOf(row.entityId)}`},{' '}
                    {row.count === 1 ? 'once' : `${row.count} times`}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="recovery__actions">
        {rows.length > 0 ? (
          <button
            className="button"
            type="button"
            disabled={chosen.length === 0}
            onClick={() => onLink(linkNames(text, chosen), chosen.length)}
            data-testid="name-linker-apply"
          >
            {chosen.length === 1 ? 'Link 1 name' : `Link ${chosen.length} names`}
          </button>
        ) : null}
        <button
          className="button button--text"
          type="button"
          onClick={onClose}
          data-testid="name-linker-close"
        >
          {rows.length > 0 ? 'Cancel' : 'Close'}
        </button>
      </div>
    </section>
  )
}

import { useEffect, useId, useRef, useState } from 'react'
import { Quoted } from './NameList'
import { listIdeas, listReferenceTargets } from '../ideas/api'
import { IdeaReferenceKind } from '../ideas/types'
import { useReturnFocus } from '../lib/returnFocus'
import { useI18n } from '../i18n'

/** What a picked idea or entry puts on a card: its id and what the card shows of it. */
export interface PickedTarget {
  id: string
  name: string
  excerpt: string | null
  entityTypeName: string | null
}

interface IdeaBoardPickerProps {
  what: 'idea' | 'entry'
  /** The board's universe: an entry must be in it, an idea in it or in none. Null for an unassigned board. */
  universe: { id: string; name: string } | null
  /** Ids already on the board, shown as placed rather than offered twice. */
  placed: Set<string>
  onChoose: (target: PickedTarget) => void
  onClose: () => void
}

/** What one request answered, and which request it was - so a list is never shown for words no longer typed. */
interface Answer {
  request: string
  targets: PickedTarget[] | null
}

/**
 * Choosing an idea or a lore entry to place on a board, in the drawer every LorEvolve form uses.
 *
 * Only what the board may hold is offered (ADR 0066): an unassigned board takes any of the account's live ideas; a
 * universe board takes that universe's ideas and unassigned ones, and its live entries. Nothing deleted or in the Trash.
 */
export function IdeaBoardPicker({
  what,
  universe,
  placed,
  onChoose,
  onClose,
}: IdeaBoardPickerProps) {
  const { t, tx } = useI18n()
  const dialog = useRef<HTMLDialogElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const headingId = useId()
  const searchId = useId()
  const resultsId = useId()
  const [query, setQuery] = useState('')
  const [answer, setAnswer] = useState<Answer | null>(null)
  const universeId = universe?.id ?? null

  useReturnFocus()

  useEffect(() => {
    dialog.current?.showModal()
    search.current?.focus()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const asked = query

    async function read(): Promise<PickedTarget[]> {
      if (what === 'entry') {
        const targets = await listReferenceTargets(
          universeId!,
          IdeaReferenceKind.Entity,
          asked,
          controller.signal,
        )
        return targets.map((target) => ({
          id: target.id,
          name: target.name,
          excerpt: null,
          entityTypeName: target.entityTypeName,
        }))
      }

      const base = { storyId: null, deleted: false, search: asked, page: 1 }
      const pages = await Promise.all(
        universeId
          ? [
              listIdeas({ ...base, universeId, unassigned: false }, controller.signal),
              listIdeas({ ...base, universeId: null, unassigned: true }, controller.signal),
            ]
          : [listIdeas({ ...base, universeId: null, unassigned: false }, controller.signal)],
      )
      return pages
        .flatMap((page) => page.items)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map((idea) => ({
          id: idea.id,
          name: idea.title,
          excerpt: idea.excerpt,
          entityTypeName: null,
        }))
    }

    // Typing settles before the API is asked, so a fast typist makes one call, not ten.
    const timer = setTimeout(() => {
      read()
        .then((targets) => setAnswer({ request: asked, targets }))
        .catch(() => {
          if (!controller.signal.aborted) setAnswer({ request: asked, targets: null })
        })
    }, 150)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [what, universeId, query])

  const results = answer?.request === query ? answer.targets : undefined

  return (
    <dialog
      className="drawer ideapicker"
      ref={dialog}
      aria-labelledby={headingId}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === dialog.current) onClose()
      }}
      data-testid="board-picker"
    >
      <div className="drawer__panel">
        <header className="drawer__head">
          <p className="drawer__eyebrow">
            {universe
              ? tx('ideas.boardPicker.inUniverse', { universe: <Quoted text={universe.name} /> })
              : t('ideas.boardPicker.inNoUniverse')}
          </p>
          <h2 className="drawer__title" id={headingId}>
            {what === 'idea' ? t('ideas.boardPicker.addIdea') : t('ideas.boardPicker.addEntry')}
          </h2>
        </header>

        <div className="drawer__body">
          <div className="field">
            <label className="field__label" htmlFor={searchId}>
              {t('ideas.boardPicker.findByName')}
            </label>
            <input
              id={searchId}
              ref={search}
              className="field__input"
              type="search"
              value={query}
              placeholder={
                what === 'idea'
                  ? t('ideas.boardPicker.placeholderIdea')
                  : t('ideas.boardPicker.placeholderEntry')
              }
              onChange={(event) => setQuery(event.target.value)}
              aria-controls={resultsId}
              data-testid="board-picker-search"
            />
          </div>

          <div id={resultsId} aria-live="polite">
            {results === undefined ? (
              <p className="notice ideapicker__notice" role="status">
                {t('ideas.boardPicker.looking')}
              </p>
            ) : results === null ? (
              <p className="form__message" role="alert">
                {t('ideas.boardPicker.loadFailed')}
              </p>
            ) : results.length === 0 ? (
              <p className="notice ideapicker__notice" data-testid="board-picker-empty">
                {query.trim()
                  ? what === 'idea'
                    ? t('ideas.boardPicker.emptyNamedIdea')
                    : t('ideas.boardPicker.emptyNamedEntry')
                  : what === 'idea'
                    ? t('ideas.boardPicker.emptyIdeas')
                    : t('ideas.boardPicker.emptyEntries')}
              </p>
            ) : (
              <ul className="ideapicker__results" data-testid="board-picker-results">
                {results.map((target) => {
                  const isPlaced = placed.has(target.id)
                  return (
                    <li key={target.id}>
                      <button
                        className="ideapicker__option"
                        type="button"
                        disabled={isPlaced}
                        onClick={() => onChoose(target)}
                        data-testid="board-picker-option"
                        data-name={target.name}
                      >
                        <span className="ideapicker__name">
                          <bdi>{target.name}</bdi>
                        </span>
                        {target.entityTypeName ? (
                          <span className="ideapicker__context">{target.entityTypeName}</span>
                        ) : null}
                        <span className="ideapicker__state">
                          {isPlaced ? t('ideas.boardPicker.placed') : t('ideas.boardPicker.add')}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>

        <footer className="drawer__actions">
          <button
            className="button button--secondary"
            type="button"
            onClick={onClose}
            data-testid="board-picker-close"
          >
            {t('ideas.boardPicker.close')}
          </button>
        </footer>
      </div>
    </dialog>
  )
}

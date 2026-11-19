import { useEffect, useId, useRef, useState } from 'react'
import { Drawer } from './Drawer'
import { SearchField } from './SearchField'
import { useDebouncedValue } from '../lib/useDebouncedValue'
import { Quoted } from './NameList'
import { listIdeas, listReferenceTargets } from '../ideas/api'
import { IdeaReferenceKind } from '../ideas/types'
import { useReturnFocus } from '../lib/returnFocus'
import { useI18n } from '../i18n'
import { FormActions } from './FormActions'
import { LoadingNote } from './LoadingNote'

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
  const search = useRef<HTMLInputElement>(null)
  const headingId = useId()
  const searchId = useId()
  const resultsId = useId()
  const [query, setQuery] = useState('')
  // Typing settles before the API is asked, so a fast typist makes one call, not ten.
  const settled = useDebouncedValue(query)
  const [answer, setAnswer] = useState<Answer | null>(null)
  const universeId = universe?.id ?? null

  useReturnFocus()

  useEffect(() => {
    search.current?.focus()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const asked = settled

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

    read()
      .then((targets) => setAnswer({ request: asked, targets }))
      .catch(() => {
        if (!controller.signal.aborted) setAnswer({ request: asked, targets: null })
      })

    return () => {
      controller.abort()
    }
  }, [what, universeId, settled])

  const results = answer?.request === query ? answer.targets : undefined

  return (
    <Drawer
      testId="board-picker"
      titleId={headingId}
      className="ideapicker"
      eyebrow={
        universe
          ? tx('ideas.boardPicker.inUniverse', { universe: <Quoted text={universe.name} /> })
          : t('ideas.boardPicker.inNoUniverse')
      }
      title={what === 'idea' ? t('ideas.boardPicker.addIdea') : t('ideas.boardPicker.addEntry')}
      onClose={onClose}
      actions={() => (
        <FormActions onCancel={onClose} dismiss="close" cancelTestId="board-picker-close" />
      )}
    >
      <SearchField
        id={searchId}
        label={t('ideas.boardPicker.findByName')}
        inputRef={search}
        value={query}
        placeholder={
          what === 'idea'
            ? t('ideas.boardPicker.placeholderIdea')
            : t('ideas.boardPicker.placeholderEntry')
        }
        onChange={setQuery}
        aria-controls={resultsId}
        testId="board-picker-search"
      />

      <div id={resultsId} aria-live="polite">
        {results === undefined ? (
          <LoadingNote className="ideapicker__notice">{t('ideas.boardPicker.looking')}</LoadingNote>
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
    </Drawer>
  )
}

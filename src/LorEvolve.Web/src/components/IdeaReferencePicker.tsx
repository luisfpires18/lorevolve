import { useEffect, useId, useRef, useState } from 'react'
import { Quoted } from './NameList'
import { listReferenceTargets, referenceContext } from '../ideas/api'
import {
  IDEA_REFERENCE_KIND_LABELS,
  IDEA_REFERENCE_KINDS,
  IdeaReferenceKind,
  type IdeaReference,
  type IdeaReferenceKindValue,
} from '../ideas/types'
import { useReturnFocus } from '../lib/returnFocus'

/** What to type, per kind, in the words the rest of LorEvolve uses for it. */
const PLACEHOLDERS: Record<IdeaReferenceKindValue, string> = {
  [IdeaReferenceKind.Entity]: 'Name of a lore entry',
  [IdeaReferenceKind.Story]: 'Title of a story',
  [IdeaReferenceKind.Scene]: 'Title of a scene',
  [IdeaReferenceKind.PlotArc]: 'Title of an arc',
  [IdeaReferenceKind.PlotBeat]: 'Title of a beat',
}

/** What one request answered, and which request it was - so a list is never shown for words no longer typed. */
interface Answer {
  request: string
  targets: IdeaReference[] | null
}

type Results =
  { kind: 'searching' } | { kind: 'ready'; targets: IdeaReference[] } | { kind: 'error' }

interface IdeaReferencePickerProps {
  universeId: string
  universeName: string | null
  /** What the idea already references, shown as added rather than offered twice. */
  chosen: IdeaReference[]
  onChoose: (reference: IdeaReference) => void
  onClose: () => void
}

/**
 * Choosing something for an idea to reference, in the drawer every LorEvolve form uses.
 *
 * One kind at a time - Lore, Story, Scene, Arc, Beat - named in words, then a filter over names. Only live content of the
 * idea's own universe is offered: the API never lists another universe's, and nothing in the Trash. Every control is an
 * ordinary button or field, so Tab walks it in order, Escape closes it and the focus goes back to Add reference.
 */
export function IdeaReferencePicker({
  universeId,
  universeName,
  chosen,
  onChoose,
  onClose,
}: IdeaReferencePickerProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const headingId = useId()
  const searchId = useId()
  const kindsId = useId()
  const resultsId = useId()

  const [kind, setKind] = useState<IdeaReferenceKindValue>(IdeaReferenceKind.Entity)
  const [query, setQuery] = useState('')
  const [answer, setAnswer] = useState<Answer | null>(null)

  const request = `${kind}:${query}`
  const results: Results =
    answer?.request !== request
      ? { kind: 'searching' }
      : answer.targets === null
        ? { kind: 'error' }
        : { kind: 'ready', targets: answer.targets }

  useReturnFocus()

  useEffect(() => {
    dialog.current?.showModal()
    search.current?.focus()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const asked = `${kind}:${query}`

    // Typing settles before the API is asked, so a fast typist makes one call, not ten.
    const timer = setTimeout(() => {
      listReferenceTargets(universeId, kind, query, controller.signal)
        .then((targets) => setAnswer({ request: asked, targets }))
        .catch(() => {
          if (!controller.signal.aborted) setAnswer({ request: asked, targets: null })
        })
    }, 150)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [universeId, kind, query])

  const chosenKeys = new Set(chosen.map((reference) => `${reference.kind}:${reference.id}`))

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
      data-testid="idea-reference-picker"
    >
      <div className="drawer__panel">
        <header className="drawer__head">
          <p className="drawer__eyebrow">
            {universeName ? (
              <>
                In <Quoted text={universeName} />
              </>
            ) : (
              'In this idea’s universe'
            )}
          </p>
          <h2 className="drawer__title" id={headingId}>
            Add a reference
          </h2>
        </header>

        <div className="drawer__body">
          <div className="field">
            <span className="field__label" id={kindsId}>
              What to reference
            </span>
            <div className="segmented" role="group" aria-labelledby={kindsId}>
              {IDEA_REFERENCE_KINDS.map((option) => (
                <button
                  key={option}
                  type="button"
                  className="segmented__option"
                  aria-pressed={kind === option}
                  onClick={() => setKind(option)}
                  data-testid={`idea-picker-kind-${IDEA_REFERENCE_KIND_LABELS[option].toLowerCase()}`}
                >
                  {IDEA_REFERENCE_KIND_LABELS[option]}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label className="field__label" htmlFor={searchId}>
              Find by name
            </label>
            <input
              id={searchId}
              ref={search}
              className="field__input"
              type="search"
              value={query}
              placeholder={PLACEHOLDERS[kind]}
              onChange={(event) => setQuery(event.target.value)}
              aria-controls={resultsId}
              data-testid="idea-picker-search"
            />
          </div>

          <div id={resultsId} aria-live="polite">
            {results.kind === 'searching' ? (
              <p className="notice ideapicker__notice" role="status">
                Looking…
              </p>
            ) : null}
            {results.kind === 'error' ? (
              <p className="form__message" role="alert">
                That list could not be read. Try again.
              </p>
            ) : null}
            {results.kind === 'ready' && results.targets.length === 0 ? (
              <p className="notice ideapicker__notice" data-testid="idea-picker-empty">
                {query.trim()
                  ? 'Nothing by that name here. Content in the Trash is not offered.'
                  : 'Nothing of this kind here yet. Content in the Trash is not offered.'}
              </p>
            ) : null}
            {results.kind === 'ready' && results.targets.length > 0 ? (
              <ul className="ideapicker__results" data-testid="idea-picker-results">
                {results.targets.map((target) => {
                  const added = chosenKeys.has(`${target.kind}:${target.id}`)
                  const context = referenceContext(target)
                  return (
                    <li key={`${target.kind}:${target.id}`}>
                      <button
                        className="ideapicker__option"
                        type="button"
                        disabled={added}
                        onClick={() => onChoose(target)}
                        data-testid="idea-picker-option"
                        data-name={target.name}
                      >
                        <span className="ideapicker__name">{target.name}</span>
                        {context ? <span className="ideapicker__context">{context}</span> : null}
                        <span className="ideapicker__state">{added ? 'Added' : 'Add'}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            ) : null}
          </div>
        </div>

        <footer className="drawer__actions">
          <button
            className="button button--secondary"
            type="button"
            onClick={onClose}
            data-testid="idea-picker-close"
          >
            Close
          </button>
        </footer>
      </div>
    </dialog>
  )
}

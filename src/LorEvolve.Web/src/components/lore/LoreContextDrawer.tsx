import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Drawer } from '../Drawer'
import { useI18n } from '../../i18n'
import { useReturnFocus } from '../../lib/returnFocus'
import { useUniverseAccess } from '../../universes/access'
import type { LoreContextProps } from '../LoreContext'
import { useLoreContextLinks } from '../../lore/useLoreContextLinks'
import { LoreContextRow } from './LoreContextRow'
import { LoreContextMentioned } from './LoreContextMentioned'
import { LorePreview } from './LorePreview'
import { FormActions } from '../FormActions'

/**
 * A link or unlink is the scene's whole save, sent over the scene exactly as stored with only its lore changed, and naming
 * the version the page holds (ADR 0043). If anyone saved the scene since, the API refuses it and nothing is overwritten;
 * the story is read again and the author can try once more over what is there now. Nothing is shown as linked until the
 * API says so.
 */
export function LoreContextDrawer({
  universeId,
  storyId,
  scene,
  chronology,
  mentions,
  onSceneSaved,
  onSceneChanged,
  onClose,
}: LoreContextProps & { onClose: () => void }) {
  const { t, tn, tx } = useI18n()
  const access = useUniverseAccess()
  const dialog = useRef<HTMLDialogElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const linkedHeading = useRef<HTMLHeadingElement>(null)
  const headingId = useId()
  const searchId = useId()
  const resultsId = useId()

  const [preview, setPreview] = useState<{ id: string; from: string } | null>(null)

  useReturnFocus()

  useEffect(() => {
    search.current?.focus()
  }, [])

  const {
    query,
    setQuery,
    term,
    results,
    searchFailed,
    isSearching,
    busy,
    message,
    announcement,
    mentioned,
    references,
    linked,
    linkedIds,
    setLink,
  } = useLoreContextLinks({
    universeId,
    storyId,
    scene,
    mentions,
    onSceneSaved,
    onSceneChanged,
    dialog,
    linkedHeading,
  })

  function openPreview(id: string, from: string) {
    setPreview({ id, from })
  }

  function closePreview() {
    const from = preview?.from
    setPreview(null)
    requestAnimationFrame(() => {
      const back = from
        ? dialog.current?.querySelector<HTMLElement>(`[data-preview-from="${from}"]`)
        : null
      ;(back ?? search.current)?.focus()
    })
  }

  /** Up and Down move between the results, and from the search box into them. */
  function moveThrough(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    const buttons = Array.from(
      dialog.current?.querySelectorAll<HTMLElement>('[data-result-name]') ?? [],
    )
    if (buttons.length === 0) return
    event.preventDefault()
    const at = buttons.indexOf(document.activeElement as HTMLElement)
    const next =
      event.key === 'ArrowDown' ? Math.min(at + 1, buttons.length - 1) : at <= 0 ? -1 : at - 1
    if (next < 0) search.current?.focus()
    else buttons[next].focus()
  }

  return (
    <Drawer
      testId="lore-context"
      titleId={headingId}
      className="lorecontext"
      dialogRef={dialog}
      eyebrow={t('lore.context.drawerEyebrow')}
      title={<bdi>{scene.title}</bdi>}
      // In the head, which never scrolls: an absolutely placed span in the body could stretch the dialog.
      context={
        <p className="visually-hidden" role="status" data-testid="lore-context-announcer">
          {announcement}
        </p>
      }
      // Nothing in the drawer is ever unsaved, so it closes without asking; Escape and the backdrop still go through the guard.
      onClose={onClose}
      actions={(close) => (
        <FormActions onCancel={close} dismiss="close" cancelTestId="lore-context-close" />
      )}
    >
      {message ? (
        <p className="form__message" role="alert" data-testid="lore-context-error">
          {message}
        </p>
      ) : null}

      {preview ? (
        <LorePreview
          universeId={universeId}
          entityId={preview.id}
          chronology={chronology}
          isLinked={linkedIds.has(preview.id)}
          canLink={access.editContent}
          busy={busy !== null}
          onLink={(row, link) => void setLink(row, link)}
          onBack={closePreview}
        />
      ) : (
        <>
          <section className="lorecontext__group" aria-labelledby={`${headingId}-linked`}>
            <h3
              className="sectionrule sectionrule--accent"
              id={`${headingId}-linked`}
              ref={linkedHeading}
              tabIndex={-1}
            >
              {t('lore.context.inScenePick')}
            </h3>
            {linked.length === 0 ? (
              <p className="entry__blank" data-testid="lore-context-none">
                {access.editContent ? t('lore.context.noneEditable') : t('lore.context.none')}
              </p>
            ) : (
              <ul className="relations__rows" data-testid="lore-context-linked-list">
                {linked.map((row) => (
                  <LoreContextRow
                    key={row.id}
                    row={row}
                    from="linked"
                    universeId={universeId}
                    linkedIds={linkedIds}
                    busy={busy}
                    access={access}
                    setLink={setLink}
                    openPreview={openPreview}
                    moveThrough={moveThrough}
                  />
                ))}
              </ul>
            )}
          </section>

          <LoreContextMentioned
            universeId={universeId}
            headingId={headingId}
            mentioned={mentioned}
            references={references}
            linkedIds={linkedIds}
            busy={busy}
            access={access}
            setLink={setLink}
            openPreview={openPreview}
          />

          <section className="lorecontext__group" aria-labelledby={`${headingId}-find`}>
            <h3 className="sectionrule sectionrule--accent" id={`${headingId}-find`}>
              {t('lore.context.find')}
            </h3>
            <label className="visually-hidden" htmlFor={searchId}>
              {t('lore.context.searchLabel')}
            </label>
            <input
              id={searchId}
              ref={search}
              className="field__input"
              type="search"
              dir="auto"
              placeholder={t('lore.context.searchPlaceholder')}
              autoComplete="off"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={moveThrough}
              aria-controls={resultsId}
              data-testid="lore-context-search"
            />
            <div id={resultsId}>
              <p className="visually-hidden" role="status">
                {isSearching
                  ? t('lore.context.searching')
                  : results
                    ? results.length === 0
                      ? t('lore.context.noMatches')
                      : tn('lore.context.matches', results.length, { n: results.length })
                    : ''}
              </p>
              {searchFailed ? (
                <p className="form__message" data-testid="lore-context-search-error">
                  {t('lore.context.searchFailed')}
                </p>
              ) : term !== '' && !results ? (
                <p className="entry__blank">{t('lore.context.searchingNote')}</p>
              ) : results && results.length === 0 ? (
                <p className="entry__blank" data-testid="lore-context-no-results">
                  {tx('lore.context.nothingMatches', { term: <bdi>{term}</bdi> })}
                </p>
              ) : results ? (
                <ul className="relations__rows" data-testid="lore-context-results">
                  {results.map((row) => (
                    <LoreContextRow
                      key={row.id}
                      row={row}
                      from="result"
                      universeId={universeId}
                      linkedIds={linkedIds}
                      busy={busy}
                      access={access}
                      setLink={setLink}
                      openPreview={openPreview}
                      moveThrough={moveThrough}
                    />
                  ))}
                </ul>
              ) : null}
            </div>
          </section>
        </>
      )}
    </Drawer>
  )
}

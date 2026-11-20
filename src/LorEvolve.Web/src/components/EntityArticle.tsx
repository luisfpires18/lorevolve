import { useId } from 'react'
import { Pencil } from 'lucide-react'
import { LoreArticle } from './ArticleView'
import { RecoveredDraft } from './RecoveredDraft'
import { isEmptyDocument } from '../lore/document'
import { useI18n } from '../i18n'
import { storedOf, useEntityArticle } from '../lore/useEntityArticle'
import { useArticleEditing } from '../lore/useArticleEditing'
import { ArticleEditing } from './lore/ArticleEditing'
import { ArticleHistory } from './lore/ArticleHistory'
import { Button } from './Button'
import { LoadError } from './LoadError'
import { Announce } from './Announce'
import { LoadingNote } from './LoadingNote'
import { QuietNote } from './QuietNote'

export interface EntityArticleSectionProps {
  universeId: string
  entityId: string
  entityName: string

  /** False while the entry's own form is open: one editor on the page at a time. */
  canEdit: boolean

  /** Told whenever writing starts or stops, so the page can give the writing its own save bar. */
  onEditingChange: (editing: boolean) => void

  /** A save or a restore landed, and the entry was worked on at this moment. */
  onSaved: (updatedAt: string) => void
}

/**
 * An entry's article: the long-form prose that describes it, beside - never inside - the structured lore.
 *
 * It is read on its own route when the entry opens, and written on it: an explicit Save, or Ctrl+S / Cmd+S while the
 * focus is in the article. The text is unsaved until the API confirms it, so a failed save changes nothing on screen and
 * can be tried again. A save over an article saved by someone else, or from another tab or device, since this one opened is
 * refused (ADR 0043): the text stays in the editor, the author reviews the latest saved article, and then keeps their own
 * text - saving again over what they have seen - or takes the latest. While anything is unsaved, following a link, signing
 * out or leaving the page asks first.
 *
 * Unsaved writing is also kept on this device as a recovery copy, never sent anywhere (ADR 0029). When the entry opens
 * with a copy that differs from what is saved, the saved article is shown and the copy is offered beside it: recovering
 * puts it in the editor as unsaved changes, and discarding lets it go.
 *
 * The article has no status of its own: it is as settled as its entry, whose Canon control sits above it. And it is
 * never read for meaning - a year written here is a word, not a field.
 *
 * Under the article, its own history: every saved version, readable in place and restorable as the next version.
 */
export function EntityArticleSection({
  universeId,
  entityId,
  entityName,
  canEdit,
  onEditingChange,
  onSaved,
}: EntityArticleSectionProps) {
  const { t, tx } = useI18n()
  const headingId = useId()
  const statusId = useId()
  const tooLongId = useId()
  const noteId = useId()

  const article = useEntityArticle({ universeId, entityId, entityName, onEditingChange, onSaved })
  const editing = useArticleEditing({ ...article, onSaved })
  const {
    access,
    load,
    setReads,
    stored,
    setStored,
    isEditing,
    historyKey,
    setHistoryKey,
    announcement,
    section,
    startButton,
    isReady,
    hasArticle,
    offer,
    isHeld,
    isSaving,
    isDirty,
  } = article
  const { startEditing, reread, recoverDraft, discardDraft } = editing

  const status = isSaving
    ? { state: 'saving', text: t('entity.article.status.saving') }
    : isDirty
      ? { state: 'dirty', text: t('entity.article.status.unsaved') }
      : stored.updatedAt === null
        ? { state: 'empty', text: t('entity.article.status.empty') }
        : { state: 'saved', text: t('entity.article.status.saved') }

  const canStart = canEdit && !isHeld
  const note = !canEdit
    ? t('entity.article.note.entryOpen')
    : offer
      ? t('entity.article.note.draftOffered')
      : null

  return (
    <section
      ref={section}
      // The entry page's `#article` - where a search result found in the article lands (ADR 0031).
      id="article"
      className="entry__article article"
      aria-labelledby={headingId}
      data-testid="article"
      data-state={isEditing ? 'editing' : 'reading'}
    >
      <div className="article__head">
        {/* Focusable by script only, so arriving at the article puts a keyboard and a screen reader on its heading. */}
        <h2
          className="article__title sectionrule sectionrule--accent"
          id={headingId}
          tabIndex={-1}
          data-arrival-focus
        >
          {t('entity.article.title')}
        </h2>
        {isReady && !isEditing && hasArticle && access.editContent ? (
          <Button
            tone="secondary"
            icon={Pencil}
            ref={startButton}
            onClick={() => startEditing()}
            disabled={!canStart}
            aria-describedby={note ? noteId : undefined}
            data-testid="article-edit"
          >
            {t('entity.article.edit')}
          </Button>
        ) : null}
      </div>

      {/* Beside the control it explains, not after the whole article. */}
      {isReady && !isEditing && note && access.editContent ? (
        <QuietNote className="article__note" testId="article-note" id={noteId}>
          {note}
        </QuietNote>
      ) : null}

      {load.kind === 'loading' ? (
        <LoadingNote testId="article-loading">{t('entity.article.opening')}</LoadingNote>
      ) : null}

      {load.kind === 'missing' ? (
        <QuietNote size="body" testId="article-missing">
          {t('entity.article.missing')}
        </QuietNote>
      ) : null}

      {load.kind === 'error' ? (
        <LoadError
          message={t('entity.article.openFailed')}
          onRetry={reread}
          retryLabel={t('entity.article.retry')}
          retryTestId="article-retry"
          testId="article-load-error"
        />
      ) : null}

      {offer && access.editContent ? (
        <RecoveredDraft
          what={t('entity.article.recoveredWhat')}
          draft={offer}
          savedUpdatedAt={stored.updatedAt}
          preview={
            isEmptyDocument(offer.content) ? (
              <QuietNote size="body">{t('entity.article.draftBlank')}</QuietNote>
            ) : (
              <LoreArticle content={offer.content} />
            )
          }
          onRecover={recoverDraft}
          onDiscard={discardDraft}
          testId="article-recovery"
        />
      ) : null}

      {isReady && !isEditing ? (
        hasArticle ? (
          <LoreArticle content={stored.content} />
        ) : (
          <div className="article__empty" data-testid="article-empty">
            <p className="article__emptyline">{t('entity.article.empty.line')}</p>
            {access.editContent ? (
              <>
                <p className="article__emptyhint">
                  {tx('entity.article.empty.hint', { name: <bdi>{entityName}</bdi> })}
                </p>
                <Button
                  icon={Pencil}
                  ref={startButton}
                  onClick={() => startEditing()}
                  disabled={!canStart}
                  aria-describedby={note ? noteId : undefined}
                  data-testid="article-write"
                >
                  {t('entity.article.empty.write')}
                </Button>
              </>
            ) : null}
          </div>
        )
      ) : null}

      {isReady && isEditing ? (
        <ArticleEditing
          {...article}
          {...editing}
          universeId={universeId}
          entityId={entityId}
          statusId={statusId}
          tooLongId={tooLongId}
          status={status}
        />
      ) : null}

      {load.kind !== 'missing' &&
      !isEditing &&
      stored.updatedAt !== null &&
      access.manageHistory ? (
        <ArticleHistory
          universeId={universeId}
          entityId={entityId}
          reloadKey={historyKey}
          current={stored}
          onRestored={(article) => {
            setStored(storedOf(article))
            setHistoryKey((key) => key + 1)
            if (article.updatedAt) onSaved(article.updatedAt)
          }}
          onStale={() => setReads((current) => current + 1)}
        />
      ) : null}

      <Announce testId="article-announcer">{announcement}</Announce>
    </section>
  )
}

import { lazy, Suspense } from 'react'
import { Check, X } from 'lucide-react'
import { ActionIcon } from '../ActionIcon'
import { EditConflict, LatestText } from '../EditConflict'
import { LoreArticle } from '../ArticleView'
import { getEntityArticle } from '../../lore/article'
import { isEmptyDocument } from '../../lore/document'
import { useI18n } from '../../i18n'
import type { useEntityArticle } from '../../lore/useEntityArticle'
import type { useArticleEditing } from '../../lore/useArticleEditing'

// The editor and its 125 KB of Tiptap and ProseMirror come only when an author presses Edit; reading needs neither.
const LoreEditor = lazy(() =>
  import('../LoreEditor').then((module) => ({ default: module.LoreEditor })),
)

type Article = ReturnType<typeof useEntityArticle>
type Editing = ReturnType<typeof useArticleEditing>

/** The article being written: the conflict notice, the editor, and its save bar. */
export function ArticleEditing({
  universeId,
  entityId,
  statusId,
  tooLongId,
  status,
  failed,
  stored,
  editorKey,
  openingWith,
  setDraft,
  setBaseline,
  isSaving,
  failure,
  conflict,
  editor,
  isDirty,
  isTooLong,
  save,
  finishEditing,
  keepMine,
  takeLatest,
}: Pick<
  Article,
  | 'failed'
  | 'stored'
  | 'editorKey'
  | 'openingWith'
  | 'setDraft'
  | 'setBaseline'
  | 'isSaving'
  | 'failure'
  | 'conflict'
  | 'editor'
  | 'isDirty'
  | 'isTooLong'
  | 'save'
> &
  Pick<Editing, 'finishEditing' | 'keepMine' | 'takeLatest'> & {
    universeId: string
    entityId: string
    statusId: string
    tooLongId: string
    status: { state: string; text: string }
  }) {
  const { t } = useI18n()
  return (
    <div className="article__editing">
      {conflict ? (
        <EditConflict
          what={t('entity.article.conflictWhat')}
          read={() => getEntityArticle(universeId, entityId)}
          renderLatest={(latest) => (
            <LatestText label={t('entity.article.latestLabel')}>
              {isEmptyDocument(latest.content) ? (
                <p className="entry__blank">{t('entity.article.latestBlank')}</p>
              ) : (
                <LoreArticle content={latest.content} />
              )}
            </LatestText>
          )}
          onKeepMine={keepMine}
          onUseLatest={takeLatest}
          testId="article-conflict"
        />
      ) : null}

      {failure ? (
        <p className="form__message article__failure" role="alert" data-testid="article-error">
          {failure}
        </p>
      ) : null}

      <Suspense fallback={null}>
        <LoreEditor
          key={editorKey}
          value={openingWith ?? (stored.content || null)}
          autofocus
          onChange={setDraft}
          onReady={(created) => {
            editor.current = created
            const written = JSON.stringify(created.getJSON())
            // A recovered copy is measured against what is saved, so it opens as the unsaved changes it is.
            setBaseline(openingWith === null ? written : stored.content)
            setDraft(written)
          }}
          describedBy={`${statusId} ${tooLongId}`}
          keyShortcuts="Control+S Meta+S"
        />
      </Suspense>

      <div className="article__bar">
        <p
          className="article__status"
          id={statusId}
          role="status"
          data-state={status.state}
          data-testid="article-status"
        >
          {status.text}
        </p>
        {isTooLong ? (
          <p
            className="field__error article__toolong"
            id={tooLongId}
            data-testid="article-too-long"
          >
            {t('entity.article.tooLong')}
          </p>
        ) : null}
        {failed && isDirty ? (
          <p className="recovery__warning" role="status" data-testid="article-recovery-warning">
            {t('entity.article.recoveryWarning')}
          </p>
        ) : null}
        <div className="article__actions">
          <button
            className="button"
            type="button"
            disabled={!isDirty || isSaving || isTooLong}
            onClick={() => void save(stored.version)}
            aria-describedby={statusId}
            aria-keyshortcuts="Control+S Meta+S"
            data-testid="article-save"
          >
            <ActionIcon icon={Check} />
            {isSaving ? t('entity.article.saving') : t('entity.article.save')}
          </button>
          <button
            className="button button--secondary"
            type="button"
            onClick={finishEditing}
            disabled={isSaving}
            data-testid="article-done"
          >
            <ActionIcon icon={X} />
            {t('entity.article.done')}
          </button>
        </div>
      </div>
    </div>
  )
}

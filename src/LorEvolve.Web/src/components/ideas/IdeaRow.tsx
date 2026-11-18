import { Link } from 'react-router-dom'
import type { IdeaSummary } from '../../ideas/types'
import { formatDate, formatDateTime } from '../../lib/dates'
import { tn, useI18n } from '../../i18n'
import { Button } from '../Button'

function referenceCountLabel(total: number) {
  return tn('ideas.browser.references', total, { n: total })
}

/** One row of an ideas list: the idea opens, or in Recently deleted, restores. */
export function IdeaRow({
  idea,
  deleted,
  basePath,
  universe,
  restoring,
  restore,
}: {
  idea: IdeaSummary
  deleted: boolean
  basePath: string
  universe: { id: string; name: string } | null
  restoring: string | null
  restore: (idea: IdeaSummary) => Promise<void>
}) {
  const { t, tx } = useI18n()
  return (
    <li
      className={deleted ? 'idearow' : 'idearow rowlink'}
      data-testid="idea-row"
      data-title={idea.title}
      data-universe={idea.universe?.name ?? ''}
    >
      <div className="idearow__main">
        {deleted ? (
          <p className="idearow__title">
            <bdi>{idea.title}</bdi>
          </p>
        ) : (
          <Link
            className="idearow__title rowlink__target"
            to={`${basePath}/${idea.id}`}
            data-testid="idea-open"
          >
            <bdi>{idea.title}</bdi>
          </Link>
        )}
        {idea.excerpt ? (
          <p className="idearow__excerpt prose" data-testid="idea-excerpt">
            {idea.excerpt}
            {idea.isExcerptShortened ? '…' : null}
          </p>
        ) : null}
        <p className="idearow__meta">
          {universe ? null : idea.universe ? (
            <span className="idearow__universe" data-testid="idea-universe-label">
              <span
                className="idearow__seal"
                aria-hidden="true"
                style={
                  idea.universe.accentColor ? { background: idea.universe.accentColor } : undefined
                }
              />
              {idea.universe.name}
            </span>
          ) : (
            <span
              className="idearow__universe idearow__universe--none"
              data-testid="idea-universe-label"
            >
              {t('ideas.browser.noUniverse')}
            </span>
          )}
          {deleted && idea.deletedAt ? (
            <span>
              {tx('ideas.browser.deletedAt', {
                time: <time dateTime={idea.deletedAt}>{formatDateTime(idea.deletedAt)}</time>,
              })}
            </span>
          ) : (
            <span>
              {tx('ideas.browser.updatedAt', {
                time: <time dateTime={idea.updatedAt}>{formatDate(idea.updatedAt)}</time>,
              })}
            </span>
          )}
          {idea.referenceCount > 0 ? <span>{referenceCountLabel(idea.referenceCount)}</span> : null}
        </p>
      </div>
      {deleted ? (
        <Button
          tone="secondary"
          className="idearow__restore"
          disabled={restoring !== null}
          onClick={() => void restore(idea)}
          aria-label={t('ideas.browser.restoreAria', { title: idea.title })}
          data-testid="idea-restore"
        >
          {restoring === idea.id ? t('ideas.browser.restoring') : t('ideas.browser.restore')}
        </Button>
      ) : null}
    </li>
  )
}

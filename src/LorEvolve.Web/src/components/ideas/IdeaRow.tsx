import type { IdeaSummary } from '../../ideas/types'
import { tn, useI18n } from '../../i18n'
import { Button } from '../Button'
import { LinkRow } from '../LinkRow'
import { DateText } from '../DateText'

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
    <LinkRow
      look="idea"
      to={deleted ? undefined : `${basePath}/${idea.id}`}
      title={idea.title}
      titleTestId="idea-open"
      excerpt={
        idea.excerpt ? (
          <>
            {idea.excerpt}
            {idea.isExcerptShortened ? '…' : null}
          </>
        ) : null
      }
      excerptTestId="idea-excerpt"
      testId="idea-row"
      data-title={idea.title}
      data-universe={idea.universe?.name ?? ''}
      meta={
        <>
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
                time: <DateText value={idea.deletedAt} withTime />,
              })}
            </span>
          ) : (
            <span>
              {tx('ideas.browser.updatedAt', {
                time: <DateText value={idea.updatedAt} />,
              })}
            </span>
          )}
          {idea.referenceCount > 0 ? <span>{referenceCountLabel(idea.referenceCount)}</span> : null}
        </>
      }
      aside={
        deleted ? (
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
        ) : null
      }
    />
  )
}

import type { ReactNode } from 'react'
import type { RecordWords } from '../../ideas/useRecordList'
import { t, tx, useI18n } from '../../i18n'
import { Button } from '../Button'
import { DateText } from '../DateText'
import { LinkRow } from '../LinkRow'

interface RecordSummary {
  id: string
  title: string
  universe: { name: string; accentColor?: string | null } | null
  updatedAt: string
  deletedAt?: string | null
}

/**
 * One row of an ideas or boards list (LinkRow look `idea`): the record opens, or in Recently deleted, restores. The
 * meta is the universe (left out inside one), then the date and `count`, or `count` first with `countFirst`. `seal` is
 * the idea's look: the universe's coloured seal, the label's test id and `data-universe`. `testIdPrefix` gives
 * `idea-row`, `idea-open`, `idea-restore`. Catalogue: `docs/design/ui-components.md`.
 */
export function RecordRow<R extends RecordSummary>({
  record,
  testIdPrefix: id,
  words: w,
  deleted,
  basePath,
  universe,
  restoring,
  restore,
  seal,
  excerpt,
  count,
  countFirst,
}: {
  record: R
  testIdPrefix: string
  words: RecordWords
  deleted: boolean
  basePath: string
  universe: { id: string; name: string } | null
  restoring: string | null
  restore: (record: R) => Promise<void>
  seal?: boolean
  excerpt?: ReactNode
  count: ReactNode
  countFirst?: boolean
}) {
  useI18n() // Re-renders on a language change; the words are read through the module's t.
  const { universe: home } = record
  return (
    <LinkRow
      look="idea"
      to={deleted ? undefined : `${basePath}/${record.id}`}
      title={record.title}
      titleTestId={`${id}-open`}
      excerpt={excerpt}
      excerptTestId={excerpt === undefined ? undefined : `${id}-excerpt`}
      testId={`${id}-row`}
      data-title={record.title}
      data-universe={seal ? (home?.name ?? '') : undefined}
      meta={
        <>
          {universe ? null : (
            <span
              className={home ? 'idearow__universe' : 'idearow__universe idearow__universe--none'}
              data-testid={seal ? `${id}-universe-label` : undefined}
            >
              {home ? (
                <>
                  {seal ? (
                    <span
                      className="idearow__seal"
                      aria-hidden="true"
                      style={home.accentColor ? { background: home.accentColor } : undefined}
                    />
                  ) : null}
                  {home.name}
                </>
              ) : (
                t(`${w}.noUniverse`)
              )}
            </span>
          )}
          {countFirst ? count : null}
          {deleted && record.deletedAt ? (
            <span>
              {tx(`${w}.deletedAt`, { time: <DateText value={record.deletedAt} withTime /> })}
            </span>
          ) : (
            <span>{tx(`${w}.updatedAt`, { time: <DateText value={record.updatedAt} /> })}</span>
          )}
          {countFirst ? null : count}
        </>
      }
      aside={
        deleted ? (
          <Button
            tone="secondary"
            className="idearow__restore"
            disabled={restoring !== null}
            onClick={() => void restore(record)}
            aria-label={t(`${w}.restoreAria`, { title: record.title })}
            data-testid={`${id}-restore`}
          >
            {restoring === record.id ? t(`${w}.restoring`) : t(`${w}.restore`)}
          </Button>
        ) : null
      }
    />
  )
}

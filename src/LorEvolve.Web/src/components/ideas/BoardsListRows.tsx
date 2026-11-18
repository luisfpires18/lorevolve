import { Link } from 'react-router-dom'
import type { IdeaBoardPage, IdeaBoardSummary } from '../../ideas/boards'
import { formatDate, formatDateTime } from '../../lib/dates'
import { useI18n } from '../../i18n'
import { Button } from '../Button'

/** The rows of the boards list: each board opens, or in Recently deleted, restores. */
export function BoardsListRows({
  result,
  deleted,
  basePath,
  universe,
  restoring,
  restore,
}: {
  result: IdeaBoardPage
  deleted: boolean
  basePath: string
  universe: { id: string; name: string } | null
  restoring: string | null
  restore: (board: IdeaBoardSummary) => Promise<void>
}) {
  const { t, tn, tx } = useI18n()
  return (
    <ul className="idealist" data-testid="board-rows">
      {result.items.map((board) => (
        <li
          className={deleted ? 'idearow' : 'idearow rowlink'}
          key={board.id}
          data-testid="board-row"
          data-title={board.title}
        >
          <div className="idearow__main">
            {deleted ? (
              <p className="idearow__title">
                <bdi>{board.title}</bdi>
              </p>
            ) : (
              <Link
                className="idearow__title rowlink__target"
                to={`${basePath}/${board.id}`}
                data-testid="board-open"
              >
                <bdi>{board.title}</bdi>
              </Link>
            )}
            <p className="idearow__meta">
              {universe ? null : (
                <span
                  className={
                    board.universe
                      ? 'idearow__universe'
                      : 'idearow__universe idearow__universe--none'
                  }
                >
                  {board.universe ? board.universe.name : t('ideas.boards.noUniverse')}
                </span>
              )}
              <span>{tn('ideas.boards.cards', board.cardCount)}</span>
              {deleted && board.deletedAt ? (
                <span>
                  {tx('ideas.boards.deletedAt', {
                    time: <time dateTime={board.deletedAt}>{formatDateTime(board.deletedAt)}</time>,
                  })}
                </span>
              ) : (
                <span>
                  {tx('ideas.boards.updatedAt', {
                    time: <time dateTime={board.updatedAt}>{formatDate(board.updatedAt)}</time>,
                  })}
                </span>
              )}
            </p>
          </div>
          {deleted ? (
            <Button
              tone="secondary"
              className="idearow__restore"
              disabled={restoring !== null}
              onClick={() => void restore(board)}
              aria-label={t('ideas.boards.restoreAria', { title: board.title })}
              data-testid="board-restore"
            >
              {restoring === board.id ? t('ideas.boards.restoring') : t('ideas.boards.restore')}
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

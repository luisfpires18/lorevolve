import { Link } from 'react-router-dom'
import { EmptyState } from '../EmptyState'
import { Quoted } from '../NameList'
import type { LoadState } from '../../ideas/boardDraft'
import { useI18n } from '../../i18n'
import { LoadError } from '../LoadError'
import { LoadingNote } from '../LoadingNote'

/** What a board's editor shows instead of the board: loading, missing, in another universe, or failed to open. */
export function BoardUnavailable({
  load,
  listPath,
  contextUniverse,
  reread,
}: {
  load: LoadState
  listPath: string
  contextUniverse: { id: string; name: string } | null
  reread: () => void
}) {
  const { t, tx } = useI18n()
  if (load.kind === 'loading') {
    return <LoadingNote testId="board-loading">{t('ideas.board.loading')}</LoadingNote>
  }

  if (load.kind === 'missing') {
    return (
      <EmptyState
        testId="board-missing"
        title={t('ideas.board.missing.title')}
        hint={tx('ideas.board.missing.hint', {
          link: <Link to={`${listPath}?view=deleted`}>{t('ideas.board.missing.link')}</Link>,
        })}
      />
    )
  }

  if (load.kind === 'elsewhere') {
    return (
      <EmptyState
        testId="board-not-in-universe"
        title={tx('ideas.board.elsewhere.title', {
          universe: <Quoted text={contextUniverse?.name ?? ''} />,
        })}
        hint={tx('ideas.board.elsewhere.hint', {
          open: <Link to={listPath}>{t('ideas.board.elsewhere.open')}</Link>,
        })}
      />
    )
  }

  if (load.kind === 'error') {
    return (
      <LoadError
        message={load.message}
        onRetry={reread}
        retryLabel={t('ideas.board.retry')}
        testId="board-load-error"
      />
    )
  }
}

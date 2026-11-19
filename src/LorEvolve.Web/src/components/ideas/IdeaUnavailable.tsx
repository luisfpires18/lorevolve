import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '../EmptyState'
import { Quoted } from '../NameList'
import type { LoadState } from '../../ideas/ideaDraft'
import { useI18n } from '../../i18n'
import { LoadError } from '../LoadError'
import { LoadingNote } from '../LoadingNote'

/** What an idea's editor shows instead of the idea: loading, missing, in another universe, or failed to open. */
export function IdeaUnavailable({
  load,
  listPath,
  listLabel,
  contextUniverse,
  reread,
}: {
  load: LoadState
  listPath: string
  listLabel: ReactNode
  contextUniverse: { id: string; name: string } | null
  reread: () => void
}) {
  const { t, tx } = useI18n()
  if (load.kind === 'loading') {
    return <LoadingNote testId="idea-loading">{t('ideas.editor.loading')}</LoadingNote>
  }

  if (load.kind === 'missing') {
    return (
      <EmptyState
        testId="idea-missing"
        title={t('ideas.editor.missing.title')}
        hint={tx('ideas.editor.missing.hint', {
          link: <Link to={`${listPath}?view=deleted`}>{t('ideas.editor.missing.link')}</Link>,
        })}
      />
    )
  }

  if (load.kind === 'elsewhere') {
    return (
      <EmptyState
        testId="idea-not-in-universe"
        title={tx('ideas.editor.elsewhere.title', {
          universe: <Quoted text={contextUniverse?.name ?? ''} />,
        })}
        hint={tx('ideas.editor.elsewhere.hint', {
          open: <Link to={listPath}>{t('ideas.editor.openInAll')}</Link>,
          back: <Link to={listPath}>{listLabel}</Link>,
        })}
      />
    )
  }

  if (load.kind === 'error') {
    return (
      <LoadError
        message={load.message}
        onRetry={reread}
        retryLabel={t('ideas.editor.retry')}
        testId="idea-load-error"
      />
    )
  }
}

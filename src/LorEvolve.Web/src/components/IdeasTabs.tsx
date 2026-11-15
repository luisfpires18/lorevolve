import { Link } from 'react-router-dom'
import { useI18n } from '../i18n'

/** The two ways into one universe's - or the account's - ideas: the list, and the boards they are laid out on. */
export function IdeasTabs({
  basePath,
  current,
}: {
  basePath: string
  current: 'ideas' | 'boards'
}) {
  const { t } = useI18n()
  return (
    <nav className="views ideatabs" aria-label={t('ideas.tabs.ariaLabel')} data-testid="ideas-tabs">
      <Link
        className="views__link"
        to={basePath}
        aria-current={current === 'ideas' ? 'page' : undefined}
        data-testid="ideas-tab-list"
      >
        {t('ideas.tabs.ideas')}
      </Link>
      <Link
        className="views__link"
        to={`${basePath}/boards`}
        aria-current={current === 'boards' ? 'page' : undefined}
        data-testid="ideas-tab-boards"
      >
        {t('ideas.tabs.boards')}
      </Link>
    </nav>
  )
}

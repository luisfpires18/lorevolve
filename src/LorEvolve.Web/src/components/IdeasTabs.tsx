import { Link } from 'react-router-dom'

/** The two ways into one universe's - or the account's - ideas: the list, and the boards they are laid out on. */
export function IdeasTabs({
  basePath,
  current,
}: {
  basePath: string
  current: 'ideas' | 'boards'
}) {
  return (
    <nav className="ideatabs" aria-label="Ideas views" data-testid="ideas-tabs">
      <Link
        className="ideatabs__tab"
        to={basePath}
        aria-current={current === 'ideas' ? 'page' : undefined}
        data-testid="ideas-tab-list"
      >
        Ideas
      </Link>
      <Link
        className="ideatabs__tab"
        to={`${basePath}/boards`}
        aria-current={current === 'boards' ? 'page' : undefined}
        data-testid="ideas-tab-boards"
      >
        Boards
      </Link>
    </nav>
  )
}

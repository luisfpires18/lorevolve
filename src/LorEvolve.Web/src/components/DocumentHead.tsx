import type { ReactNode } from 'react'
import { Trash2 } from 'lucide-react'
import { useI18n } from '../i18n'
import type { TextKey } from '../i18n/core'
import type { Dictionary } from '../i18n/en'
import { Crumb } from './Crumb'
import { DateText } from './DateText'
import { QuietNote } from './QuietNote'
import { RowMenu } from './RowMenu'

interface PlainHead {
  back: { to: string; label: ReactNode; testId?: string }
  title: ReactNode
  /** For the editor that names itself by this heading (`aria-labelledby`). */
  titleId?: string
  titleTestId?: string
  actions?: ReactNode
  lede?: ReactNode
  children?: ReactNode
}

/** A saved record's editor (an idea, a board, a world rule): its ids, menu and saved moment come from these. */
interface RecordHead {
  /** `idea` gives `idea-back`, `idea-heading`, `idea-actions`, `idea-delete`. */
  testIdPrefix: string
  listPath: string
  listLabel: ReactNode
  isNew: boolean
  /** The stored title, isolated in `<bdi>`. */
  title: string
  /** The heading while the record is new. */
  newTitle: ReactNode
  /** The actions trigger's accessible name. */
  menuLabel: string
  deleteLabel: string
  onDelete: () => void
  /** Disables Delete while a save is under way. */
  busy: boolean
  titleId?: string
  lede: ReactNode
  /** Said after the lede once the record has a saved moment; `{time}` is the date. */
  lastSavedKey: TextKey<Dictionary>
  updatedAt: string | null | undefined
  children?: ReactNode
}

function Head({ back, title, titleId, titleTestId, actions, lede, children }: PlainHead) {
  return (
    <header className="dochead">
      <Crumb back items={[back]} className="dochead__back" />
      <div className="dochead__row">
        <h1 className="dochead__title" id={titleId} data-testid={titleTestId}>
          {title}
        </h1>
        {actions}
      </div>
      {lede ? <QuietNote className="dochead__lede">{lede}</QuietNote> : null}
      {children}
    </header>
  )
}

function RecordDocumentHead(head: RecordHead) {
  const { tx } = useI18n()
  const { testIdPrefix: id, isNew, updatedAt } = head
  return (
    <Head
      back={{ to: head.listPath, label: head.listLabel, testId: `${id}-back` }}
      title={isNew ? head.newTitle : <bdi>{head.title}</bdi>}
      titleId={head.titleId}
      titleTestId={`${id}-heading`}
      actions={
        !isNew ? (
          <RowMenu
            label={head.menuLabel}
            triggerTestId={`${id}-actions`}
            busy={head.busy}
            onRemove={head.onDelete}
            removeIcon={Trash2}
            removeLabel={head.deleteLabel}
            removeTestId={`${id}-delete`}
          />
        ) : null
      }
      lede={
        <>
          {head.lede}
          {!isNew && updatedAt ? (
            <>
              {' '}
              {tx(head.lastSavedKey, { time: <DateText value={updatedAt} withTime /> })}
            </>
          ) : null}
        </>
      }
    >
      {head.children}
    </Head>
  )
}

/**
 * The head of a document editor or reader: the way back, the title with its actions menu, and the lede.
 * The lede is a `QuietNote`. `children` sit under it (a note about where the document belongs).
 * With `testIdPrefix` it is a saved record's head: Back to the list, the stored title, a `...` menu with Delete,
 * and the lede with the last saved moment. Catalogue: `docs/design/ui-components.md`.
 */
export function DocumentHead(props: PlainHead | RecordHead) {
  return 'testIdPrefix' in props ? <RecordDocumentHead {...props} /> : <Head {...props} />
}

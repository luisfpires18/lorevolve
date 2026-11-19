import { Link } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { ActionIcon } from '../ActionIcon'
import { ActionMenu } from '../ActionMenu'
import { formatDateTime } from '../../lib/dates'
import { t, useI18n } from '../../i18n'
import type { Stored } from '../../worldRules/ruleDraft'
import { QuietNote } from '../QuietNote'

/** The world rule editor's head: Back, the title with the actions menu, and the lede with the saved moment. */
export function WorldRuleHead({
  listPath,
  headingId,
  isNew,
  stored,
  isSaving,
  remove,
}: {
  listPath: string
  headingId: string
  isNew: boolean
  stored: Stored
  isSaving: boolean
  remove: () => Promise<void>
}) {
  const { tx } = useI18n()

  return (
    <header className="rule__head">
      <Link className="rule__back" to={listPath} data-testid="world-rule-back">
        {t('canon.editor.back')}
      </Link>
      <div className="doc__titlerow">
        <h1 className="rule__heading" id={headingId} data-testid="world-rule-heading">
          {isNew ? t('canon.editor.newRule') : <bdi>{stored.title}</bdi>}
        </h1>
        {!isNew ? (
          <ActionMenu
            label={t('canon.editor.actions', { title: stored.title })}
            triggerTestId="world-rule-actions"
          >
            <button
              className="actionmenu__item actionmenu__item--danger"
              type="button"
              disabled={isSaving}
              onClick={() => void remove()}
              data-testid="world-rule-delete"
            >
              <ActionIcon icon={Trash2} />
              {t('canon.editor.delete')}
            </button>
          </ActionMenu>
        ) : null}
      </div>
      <QuietNote className="rule__lede">
        {t('canon.editor.lede')}
        {!isNew && stored.updatedAt ? (
          <>
            {' '}
            {tx('canon.editor.lastSaved', {
              time: <time dateTime={stored.updatedAt}>{formatDateTime(stored.updatedAt)}</time>,
            })}
          </>
        ) : null}
      </QuietNote>
    </header>
  )
}

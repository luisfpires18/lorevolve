import { Trash2 } from 'lucide-react'
import { ActionIcon } from '../ActionIcon'
import { ActionMenu } from '../ActionMenu'
import { t, useI18n } from '../../i18n'
import type { Stored } from '../../worldRules/ruleDraft'
import { DocumentHead } from '../DocumentHead'
import { DateText } from '../DateText'

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
    <DocumentHead
      back={{ to: listPath, label: t('canon.editor.back'), testId: 'world-rule-back' }}
      title={isNew ? t('canon.editor.newRule') : <bdi>{stored.title}</bdi>}
      titleId={headingId}
      titleTestId="world-rule-heading"
      actions={
        !isNew ? (
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
        ) : null
      }
      lede={
        <>
          {t('canon.editor.lede')}
          {!isNew && stored.updatedAt ? (
            <>
              {' '}
              {tx('canon.editor.lastSaved', {
                time: <DateText value={stored.updatedAt} withTime />,
              })}
            </>
          ) : null}
        </>
      }
    />
  )
}

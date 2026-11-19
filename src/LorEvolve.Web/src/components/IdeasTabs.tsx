import { useI18n } from '../i18n'
import { ViewLinks } from './ViewLinks'

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
    <ViewLinks
      className="ideatabs"
      label={t('ideas.tabs.ariaLabel')}
      testId="ideas-tabs"
      items={[
        {
          to: basePath,
          label: t('ideas.tabs.ideas'),
          current: current === 'ideas',
          testId: 'ideas-tab-list',
        },
        {
          to: `${basePath}/boards`,
          label: t('ideas.tabs.boards'),
          current: current === 'boards',
          testId: 'ideas-tab-boards',
        },
      ]}
    />
  )
}

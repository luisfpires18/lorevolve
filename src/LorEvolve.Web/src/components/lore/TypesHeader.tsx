import { Plus } from 'lucide-react'
import { Field } from '../Field'
import { PageHeader } from '../PageHeader'
import { QueryTabList } from '../QueryTabs'
import { useI18n } from '../../i18n'
import type { QueryTab } from '../../lib/queryTab'
import type { useTypesGames } from '../../lore/useTypesGames'
import { Button } from '../Button'

type TypesTab = 'lore' | 'groups' | 'relations' | 'events'

/** The Types screen's header: New type, the Lore, Gaming and Templates switch, the game, and the tabs. */
export function TypesHeader({
  access,
  tabs,
  ledes,
  tab,
  chooseTab,
  games,
  gaming,
  game,
  templates,
  showLore,
  current,
  chooseContext,
  chooseGame,
  setChildOf,
  setEditing,
}: Pick<
  ReturnType<typeof useTypesGames>,
  | 'games'
  | 'gaming'
  | 'game'
  | 'templates'
  | 'showLore'
  | 'current'
  | 'chooseContext'
  | 'chooseGame'
> & {
  access: { editContent: boolean }
  tabs: QueryTab<TypesTab>[]
  ledes: Record<TypesTab, string>
  tab: TypesTab
  chooseTab: (tab: TypesTab) => void
  setChildOf: (childOf: null) => void
  setEditing: (editing: 'new') => void
}) {
  const { t } = useI18n()
  return (
    <PageHeader
      title={t('entityTypes.page.title')}
      lede={
        templates
          ? t('entityTypes.page.ledes.templates')
          : gaming
            ? t('entityTypes.page.ledes.gaming', { game: game.name })
            : ledes[tab]
      }
      actions={
        showLore && tab === 'lore' && access.editContent ? (
          <Button
            icon={Plus}
            onClick={() => {
              setChildOf(null)
              setEditing('new')
            }}
            data-testid="new-type"
          >
            {t('entityTypes.page.newType')}
          </Button>
        ) : null
      }
    >
      <div className="types__context">
        <div
          className="segmented"
          role="group"
          aria-label={t('entityTypes.page.context.label')}
          data-testid="types-context"
        >
          {(['lore', ...(games.length > 0 ? (['gaming'] as const) : []), 'templates'] as const).map(
            (each) => (
              <button
                key={each}
                className="segmented__option"
                type="button"
                aria-pressed={current === each}
                onClick={() => chooseContext(each)}
                data-testid={`types-context-${each}`}
              >
                {t(`entityTypes.page.context.${each}`)}
              </button>
            ),
          )}
        </div>
        {gaming ? (
          <Field label={t('entityTypes.page.game.label')}>
            {(control) => (
              <select
                {...control}
                className="field__input field__input--select"
                value={game.id}
                onChange={(event) => chooseGame(event.target.value)}
                data-testid="types-game"
              >
                {games.map((each) => (
                  <option key={each.id} value={each.id}>
                    {each.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        ) : null}
      </div>
      {showLore ? (
        <QueryTabList
          label={t('entityTypes.page.title')}
          idPrefix="types"
          tabs={tabs}
          tab={tab}
          onChoose={chooseTab}
        />
      ) : null}
    </PageHeader>
  )
}

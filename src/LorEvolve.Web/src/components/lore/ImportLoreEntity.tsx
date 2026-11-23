import { useState } from 'react'
import { DatabaseZap } from 'lucide-react'
import { Button } from '../Button'
import { SearchPickDrawer } from '../SearchPickDrawer'
import { searchLore } from '../../lore/searchLore'
import { useI18n } from '../../i18n'

/**
 * "Import lore entity" on a project entry: pick a lore entity by name, and its values are copied onto the entry. The
 * picker only reads the lore, and the copy is the project's own, so editing it afterwards leaves the lore as it was.
 */
export function ImportLoreEntity({
  universeId,
  disabled,
  onImport,
}: {
  universeId: string
  disabled: boolean
  onImport: (loreEntityId: string, loreName: string) => Promise<void>
}) {
  const { t } = useI18n()
  const [isPicking, setIsPicking] = useState(false)

  return (
    <>
      <Button
        tone="secondary"
        icon={DatabaseZap}
        onClick={() => setIsPicking(true)}
        disabled={disabled}
        title={t('projects.entries.import.title')}
        data-testid="import-lore-entity"
      >
        <span className="entry__toollabel">{t('projects.entries.import.action')}</span>
      </Button>

      {isPicking ? (
        <SearchPickDrawer
          testId="import-lore-picker"
          testPrefix="import-lore"
          eyebrow={t('projects.entries.import.eyebrow')}
          title={t('projects.entries.import.action')}
          searchLabel={t('projects.entries.import.search')}
          search={(words, _choice, signal) => searchLore(universeId, words, signal)}
          option={(found) => ({
            key: found.id,
            name: found.name,
            context: found.entityTypeName,
          })}
          chosen={new Set()}
          onChoose={(found) => {
            setIsPicking(false)
            void onImport(found.id, found.name)
          }}
          onClose={() => setIsPicking(false)}
          words={{
            looking: t('projects.entries.import.looking'),
            failed: t('projects.entries.import.searchFailed'),
            empty: {
              named: t('projects.entries.import.emptyNamed'),
              none: t('projects.entries.import.emptyNone'),
            },
            add: t('projects.entries.import.add'),
            done: t('projects.entries.import.add'),
          }}
        />
      ) : null}
    </>
  )
}

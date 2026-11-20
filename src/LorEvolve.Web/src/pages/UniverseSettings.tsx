import type { ReactNode } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { useI18n } from '../i18n'
import { CollaboratorsPanel } from '../components/CollaboratorsPanel'
import { UniverseForm } from '../components/UniverseForm'
import { updateUniverse } from '../universes/api'
import { PageHeader } from '../components/PageHeader'
import { QueryTabList, TabPanel } from '../components/QueryTabs'
import { useQueryTab } from '../lib/queryTab'
import type { WorkspaceContext } from './UniverseWorkspace'
import { SettingsArchive } from '../components/universes/SettingsArchive'
import { SettingsData } from '../components/universes/SettingsData'
import { SettingsDelete } from '../components/universes/SettingsDelete'
import { universeSettingsActions } from '../universes/universeSettingsActions'
import { useUniverseSettingsState } from '../universes/useUniverseSettingsState'
import { Section } from '../components/Section'
import { FormMessage } from '../components/FormMessage'

const TAB_IDS = ['general', 'appearance', 'collaborators', 'data', 'advanced'] as const

type TabId = (typeof TAB_IDS)[number]

/**
 * A universe's Settings (UI refinement 014; Collaborators since 030): five tabs rather than one long page, in the workspace's one page shell - the
 * title where every section's is, the tabs under it - with only the forms kept to a readable column. Publishing has a
 * page of its own, Publish, and the chronology is worldbuilding, not configuration - it is its own section, Chronology.
 *
 * General is the universe's name and description; Appearance its colour (the author's own, no palette; LorEvolve's Light and
 * Dark theme is the account's, not a universe's); Data its backup and restore; Advanced its archive
 * and, once archived, delete - the one thing that cannot be taken back, set apart in the danger panel.
 *
 * Every panel stays mounted and is only hidden, so an unsaved form keeps its text and its leave guard across tab
 * changes, and switching tabs is never a departure. The chosen tab is in the address (`?tab=`) so it can be linked to,
 * but switching replaces rather than adds a history entry: Back leaves Settings, as it always has.
 */
export default function UniverseSettings() {
  const { universe, refresh } = useOutletContext<WorkspaceContext>()
  const { user } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const TABS = TAB_IDS.map((id) => ({ id, label: t(`universe.settings.tabs.${id}`) }))
  const [tab, choose] = useQueryTab(TABS)

  const state = useUniverseSettingsState({ universe })
  const { savedDetails, setSavedDetails, savedColour, setSavedColour, error } = state
  const { exportFile, toggleArchived, askToArchive, remove } = universeSettingsActions({
    ...state,
    universe,
    refresh,
    user,
    navigate,
    t,
  })

  const publishPath = `/app/universes/${universe.id}/publish`

  return (
    <article className="settings settings--tabbed">
      <PageHeader title={t('universe.settings.title')} lede={<p>{t('universe.settings.lede')}</p>}>
        <QueryTabList
          label={t('universe.settings.tabsLabel')}
          idPrefix="settings"
          tabs={TABS}
          tab={tab}
          onChoose={choose}
        />
      </PageHeader>

      {/* One outer shell for every workspace page; only the forms keep a readable column. */}
      <div className="settings__body">
        <Panel id="general" tab={tab}>
          <Section title={t('universe.settings.details')} narrow>
            {savedDetails ? (
              <p className="settings__saved" role="status" data-testid="settings-saved">
                {t('universe.settings.detailsSaved')}
              </p>
            ) : null}
            <UniverseForm
              key={`${universe.name}\u0000${universe.description ?? ''}`}
              fields="details"
              initial={{
                name: universe.name,
                description: universe.description,
                accentColor: universe.accentColor,
                aiHelp: universe.aiHelp,
              }}
              submitLabel={t('universe.settings.detailsSave')}
              busyLabel={t('universe.settings.detailsSaving')}
              onSubmit={async (input) => {
                // The colour is Appearance's: what is stored now, never what this form opened on.
                const updated = await updateUniverse(universe.id, {
                  ...input,
                  accentColor: universe.accentColor,
                })
                refresh(updated)
                setSavedDetails(true)
              }}
            />
          </Section>
        </Panel>

        <Panel id="appearance" tab={tab}>
          <Section title={t('universe.settings.colour')} narrow>
            <p className="settings__note">{t('universe.settings.colourNote')}</p>
            {savedColour ? (
              <p className="settings__saved" role="status" data-testid="settings-colour-saved">
                {t('universe.settings.colourSaved')}
              </p>
            ) : null}
            <UniverseForm
              key={universe.accentColor ?? ''}
              fields="colour"
              initial={{
                name: universe.name,
                description: universe.description,
                accentColor: universe.accentColor,
              }}
              submitLabel={t('universe.settings.colourSave')}
              busyLabel={t('universe.settings.colourSaving')}
              onSubmit={async (input) => {
                const updated = await updateUniverse(universe.id, {
                  name: universe.name,
                  description: universe.description,
                  accentColor: input.accentColor,
                })
                refresh(updated)
                setSavedColour(true)
              }}
            />
          </Section>
        </Panel>

        <Panel id="collaborators" tab={tab}>
          <CollaboratorsPanel universeId={universe.id} />
        </Panel>

        <Panel id="data" tab={tab}>
          <SettingsData {...state} exportFile={exportFile} />
        </Panel>

        <Panel id="advanced" tab={tab}>
          <SettingsArchive
            {...state}
            universe={universe}
            publishPath={publishPath}
            toggleArchived={toggleArchived}
            askToArchive={askToArchive}
          />

          <SettingsDelete {...state} universe={universe} remove={remove} />

          {error ? <FormMessage>{error}</FormMessage> : null}
        </Panel>
      </div>
    </article>
  )
}

/** One tab's panel: always mounted, hidden unless chosen, so what is typed in it is kept. */
function Panel({ id, tab, children }: { id: TabId; tab: TabId; children: ReactNode }) {
  return (
    <TabPanel idPrefix="settings" id={id} tab={tab}>
      {children}
    </TabPanel>
  )
}

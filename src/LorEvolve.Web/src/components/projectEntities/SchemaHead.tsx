import { Shapes } from 'lucide-react'
import type { ProjectEntityType } from '../../projectEntities/types'
import { Crumb, type CrumbItem } from '../Crumb'
import { PageHeader } from '../PageHeader'
import type { TypeTemplate } from '../../typeTemplates/types'
import { t, useI18n } from '../../i18n'
import type { Dispatch, SetStateAction } from 'react'
import { Button } from '../Button'
import { NewButton } from '../NewButton'

/**
 * The head of the panel: the page head of a project's Types view (`page`), the panel's own name, lede and buttons
 * (`panel`), or only the buttons (`actions`) where a title above already names the screen: the universe's Types page.
 */
export function SchemaHead({
  crumb,
  canEdit,
  head,
  projectName,
  setEditing,
  setChildOf,
  templates,
  setFromTemplate,
}: {
  crumb?: CrumbItem
  canEdit: boolean
  head: 'page' | 'panel' | 'actions'
  projectName?: string
  setEditing: Dispatch<SetStateAction<ProjectEntityType | 'new' | null>>
  setChildOf: Dispatch<SetStateAction<ProjectEntityType | null>>
  templates: TypeTemplate[]
  setFromTemplate: Dispatch<SetStateAction<boolean>>
}) {
  useI18n()

  // The panel's own primary action sits in its head, where `PageHeader` and the lore screens put one (#184).
  const actions = (
    <>
      <NewButton
        data-testid="project-type-add"
        onClick={() => {
          setChildOf(null)
          setEditing('new')
        }}
      >
        {t('entityTypes.page.newType')}
      </NewButton>
      {canEdit && templates.length > 0 ? (
        <Button
          tone="secondary"
          icon={Shapes}
          data-testid="project-type-from-template"
          onClick={() => setFromTemplate(true)}
        >
          {t('projects.schema.fromTemplate.button')}
        </Button>
      ) : null}
    </>
  )

  if (head === 'actions') return <div className="schema__actions">{actions}</div>

  if (head === 'page') {
    return (
      <PageHeader
        level={2}
        title={t('entityTypes.page.title')}
        titleTestId="project-types-title"
        lede={
          projectName
            ? t('entityTypes.page.ledes.gaming', { game: projectName })
            : t('projects.schema.lede')
        }
        actions={actions}
      />
    )
  }

  return (
    <PageHeader
      level={2}
      size="panel"
      crumb={crumb ? <Crumb items={[crumb]} /> : undefined}
      title={t('projects.schema.title')}
      lede={t('projects.schema.lede')}
      actions={actions}
    />
  )
}

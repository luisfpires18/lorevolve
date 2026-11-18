import type { ReactNode } from 'react'
import { Plus, Shapes } from 'lucide-react'
import type { ProjectEntityType } from '../../projectEntities/types'
import { PageHeader } from '../PageHeader'
import type { TypeTemplate } from '../../typeTemplates/types'
import { t, useI18n } from '../../i18n'
import type { Dispatch, SetStateAction } from 'react'
import { Button } from '../Button'

/** The head of the panel: the page header of a project's Types view, or the panel's own name and New type. */
export function SchemaHead({
  crumb,
  canEdit,
  asPage,
  projectName,
  setEditing,
  setChildOf,
  templates,
  setFromTemplate,
}: {
  crumb?: ReactNode
  canEdit: boolean
  asPage: boolean
  projectName?: string
  setEditing: Dispatch<SetStateAction<ProjectEntityType | 'new' | null>>
  setChildOf: Dispatch<SetStateAction<ProjectEntityType | null>>
  templates: TypeTemplate[]
  setFromTemplate: Dispatch<SetStateAction<boolean>>
}) {
  useI18n()

  return (
    <>
      {/* The panel's own primary action sits in its head, where `PageHeader` and the lore screens put one (#184). */}
      {asPage ? (
        <PageHeader
          title={t('entityTypes.page.title')}
          titleTestId="project-types-title"
          lede={
            projectName
              ? t('entityTypes.page.ledes.gaming', { game: projectName })
              : t('projects.schema.lede')
          }
          actions={
            <>
              <Button
                icon={Plus}
                data-testid="project-type-add"
                onClick={() => {
                  setChildOf(null)
                  setEditing('new')
                }}
              >
                {t('entityTypes.page.newType')}
              </Button>
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
          }
        />
      ) : (
        <header className="projects__head">
          {crumb ? <div className="pageheader__crumb projects__crumb">{crumb}</div> : null}
          <div className="projects__headtext">
            <h2 className="sectionrule">{t('projects.schema.title')}</h2>
            <p className="projects__lede">{t('projects.schema.lede')}</p>
          </div>
          <Button
            icon={Plus}
            data-testid="project-type-add"
            onClick={() => {
              setChildOf(null)
              setEditing('new')
            }}
          >
            {t('entityTypes.page.newType')}
          </Button>
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
        </header>
      )}
    </>
  )
}

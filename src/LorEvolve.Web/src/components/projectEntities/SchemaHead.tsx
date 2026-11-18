import type { ReactNode } from 'react'
import { Plus, Shapes } from 'lucide-react'
import type { ProjectEntityType } from '../../projectEntities/types'
import { ActionIcon } from '../ActionIcon'
import { PageHeader } from '../PageHeader'
import type { TypeTemplate } from '../../typeTemplates/types'
import { t, useI18n } from '../../i18n'
import type { Dispatch, SetStateAction } from 'react'

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
              <button
                className="button"
                type="button"
                data-testid="project-type-add"
                onClick={() => {
                  setChildOf(null)
                  setEditing('new')
                }}
              >
                <ActionIcon icon={Plus} />
                {t('entityTypes.page.newType')}
              </button>
              {canEdit && templates.length > 0 ? (
                <button
                  className="button button--secondary"
                  type="button"
                  data-testid="project-type-from-template"
                  onClick={() => setFromTemplate(true)}
                >
                  <ActionIcon icon={Shapes} />
                  {t('projects.schema.fromTemplate.button')}
                </button>
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
          <button
            className="button"
            type="button"
            data-testid="project-type-add"
            onClick={() => {
              setChildOf(null)
              setEditing('new')
            }}
          >
            <ActionIcon icon={Plus} />
            {t('entityTypes.page.newType')}
          </button>
          {canEdit && templates.length > 0 ? (
            <button
              className="button button--secondary"
              type="button"
              data-testid="project-type-from-template"
              onClick={() => setFromTemplate(true)}
            >
              <ActionIcon icon={Shapes} />
              {t('projects.schema.fromTemplate.button')}
            </button>
          ) : null}
        </header>
      )}
    </>
  )
}

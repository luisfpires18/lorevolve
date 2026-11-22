import { setLocale, useI18n } from '../i18n'
import { LOCALES } from '../i18n/locales'
import { SwitchGroup } from './ThemeSwitch'

/**
 * The language choice (ADR 0071), beside the theme switch and drawn by its `SwitchGroup`: each language by its
 * flag and its own name, the chosen one pressed. Shown only while there is a choice to make - more than one ready
 * language - or while a translation in progress is being previewed, so the way back to English is always there.
 * shortcut: a segmented control fits two or three languages; turn it into a menu when there are more.
 */
export function LanguageSwitch({ inMenu = false }: { inMenu?: boolean }) {
  const { locale, t } = useI18n()
  const offered = LOCALES.filter((entry) => entry.ready || entry.code === locale)
  if (offered.length < 2) return null

  return (
    <SwitchGroup
      label={t('language.label')}
      inMenu={inMenu}
      value={locale}
      onChange={(code) => void setLocale(code)}
      options={offered.map(({ code, label, flag: Flag }) => ({
        value: code,
        label,
        icon: (className: string) => <Flag className={className} />,
        testId: `language-${code}`,
        lang: code,
      }))}
    />
  )
}

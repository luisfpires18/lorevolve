import { useId } from 'react'
import { setLocale, useI18n } from '../i18n'
import { LOCALES } from '../i18n/locales'

/**
 * The language choice (ADR 0071), beside the theme switch and built from its segmented control: each language by its
 * flag and its own name, the chosen one pressed. Shown only while there is a choice to make - more than one ready
 * language - or while a translation in progress is being previewed, so the way back to English is always there.
 * shortcut: a segmented control fits two or three languages; turn it into a menu when there are more.
 */
export function LanguageSwitch({ inMenu = false }: { inMenu?: boolean }) {
  const { locale, t } = useI18n()
  const labelId = useId()
  const offered = LOCALES.filter((entry) => entry.ready || entry.code === locale)
  if (offered.length < 2) return null

  return (
    <div className={inMenu ? 'themeswitch themeswitch--menu' : 'themeswitch'}>
      <span className="themeswitch__label" id={labelId}>
        {t('language.label')}
      </span>
      <div className="themeswitch__track" role="group" aria-labelledby={labelId}>
        {offered.map(({ code, label, flag: Flag }) => (
          <button
            key={code}
            type="button"
            className="themeswitch__option"
            lang={code}
            aria-pressed={locale === code}
            onClick={() => void setLocale(code)}
            data-keep-open={inMenu ? '' : undefined}
            data-testid={`language-${code}`}
          >
            <Flag className="themeswitch__icon" />
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

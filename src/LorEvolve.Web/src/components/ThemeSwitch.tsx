import { useId, type ReactNode } from 'react'
import { Moon, Sun } from 'lucide-react'
import { useI18n } from '../i18n'
import { useTheme, type Theme } from '../lib/theme'

const OPTIONS: { value: Theme; icon: typeof Sun }[] = [
  { value: 'light', icon: Sun },
  { value: 'dark', icon: Moon },
]

/**
 * LorEvolve's one appearance choice (013), for the portal and the workspace together: one segmented control, two equal
 * halves, the chosen one lifted onto the surface and ringed - never colour alone - with `aria-pressed` saying the same.
 * The track is a faint tint of the ink over whatever it sits on, so it reads the same in a light or a dark menu rather
 * than as a dark well. The words carry the choice; the icons only help an eye. Inside a menu the buttons keep it open,
 * so the change is seen where it was made.
 */
export function ThemeSwitch({ inMenu = false }: { inMenu?: boolean }) {
  const { t } = useI18n()
  const [theme, setTheme] = useTheme()

  return (
    <SwitchGroup
      label={t('account.theme.label')}
      inMenu={inMenu}
      value={theme}
      onChange={setTheme}
      options={OPTIONS.map(({ value, icon: Icon }) => ({
        value,
        label: t(value === 'light' ? 'account.theme.light' : 'account.theme.dark'),
        icon: (className: string) => (
          <Icon className={className} aria-hidden="true" focusable="false" strokeWidth={1.75} />
        ),
        testId: `theme-${value}`,
      }))}
    />
  )
}

/**
 * The account menu's switch, drawn by the theme and the language choice (`.themeswitch*`, not `SegmentedControl`'s
 * `.segmented*`): a label, then one pressed button per option. `icon` gets the icon class, so each caller keeps its own
 * icon props. Inside a menu the buttons keep it open. Catalogue: docs/design/ui-components.md.
 */
export function SwitchGroup<T extends string>({
  label,
  inMenu,
  value: current,
  onChange,
  options,
}: {
  label: string
  inMenu: boolean
  value: T
  onChange: (value: T) => void
  options: readonly {
    value: T
    label: string
    icon: (className: string) => ReactNode
    testId: string
    lang?: string
  }[]
}) {
  const labelId = useId()

  return (
    <div className={inMenu ? 'themeswitch themeswitch--menu' : 'themeswitch'}>
      <span className="themeswitch__label" id={labelId}>
        {label}
      </span>
      <div className="themeswitch__track" role="group" aria-labelledby={labelId}>
        {options.map(({ value, label: shown, icon, testId, lang }) => (
          <button
            key={value}
            type="button"
            className="themeswitch__option"
            lang={lang}
            aria-pressed={current === value}
            onClick={() => onChange(value)}
            data-keep-open={inMenu ? '' : undefined}
            data-testid={testId}
          >
            {icon('themeswitch__icon')}
            {shown}
          </button>
        ))}
      </div>
    </div>
  )
}

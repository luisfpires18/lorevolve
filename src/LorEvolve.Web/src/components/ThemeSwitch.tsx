import { useId } from 'react'
import { Moon, Sun } from 'lucide-react'
import { useTheme, type Theme } from '../lib/theme'

const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
]

/**
 * LorEvolve's one appearance choice (013), for the portal and the workspace together: one segmented control, two equal
 * halves, the chosen one lifted onto the surface and ringed - never colour alone - with `aria-pressed` saying the same.
 * The track is a faint tint of the ink over whatever it sits on, so it reads the same in a light or a dark menu rather
 * than as a dark well. The words carry the choice; the icons only help an eye. Inside a menu the buttons keep it open,
 * so the change is seen where it was made.
 */
export function ThemeSwitch({ inMenu = false }: { inMenu?: boolean }) {
  const [theme, setTheme] = useTheme()
  const labelId = useId()

  return (
    <div className={inMenu ? 'themeswitch themeswitch--menu' : 'themeswitch'}>
      <span className="themeswitch__label" id={labelId}>
        Theme
      </span>
      <div className="themeswitch__track" role="group" aria-labelledby={labelId}>
        {OPTIONS.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            className="themeswitch__option"
            aria-pressed={theme === value}
            onClick={() => setTheme(value)}
            data-keep-open={inMenu ? '' : undefined}
            data-testid={`theme-${value}`}
          >
            <Icon
              className="themeswitch__icon"
              aria-hidden="true"
              focusable="false"
              strokeWidth={1.75}
            />
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

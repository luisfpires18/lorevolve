import { createContext, useContext, useEffect } from 'react'

/**
 * The shell owns the tab's title; a screen that knows a name the shell cannot (a game's, once it is read) hands it up here
 * and the shell puts it first: "Game | Projects | Hollowmere | LorEvolve". Outside a shell the setter does nothing.
 */
export const TitleDetailContext = createContext<(name: string | null) => void>(() => undefined)

/** Offer `name` as the title's first part while this screen is shown; null offers nothing. Cleared when the screen goes. */
export function useTitleDetail(name: string | null) {
  const setDetail = useContext(TitleDetailContext)
  useEffect(() => {
    setDetail(name)
    return () => setDetail(null)
  }, [name, setDetail])
}

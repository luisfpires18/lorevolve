import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { listAllProjects } from '../projects/api'
import { ProjectKind, type ProjectDetail } from '../projects/types'

/** The Types screen's context and game, from the address, with the universe's games read once. */
export function useTypesGames({ universe }: { universe: { id: string } }) {
  // Lore or Gaming (`?context=gaming&game=`): the game types are each game's own, so the switch only exists while this
  // universe has a game. An unknown context or game reads as Lore or the first game, without rewriting the address.
  const [params, setParams] = useSearchParams()
  const [gamesRead, setGamesRead] = useState<ProjectDetail[] | 'loading' | 'failed'>('loading')
  useEffect(() => {
    const controller = new AbortController()
    listAllProjects({ universeId: universe.id }, controller.signal)
      .then((all) => setGamesRead(all.filter((each) => each.kind === ProjectKind.Game)))
      .catch(() => {
        if (!controller.signal.aborted) setGamesRead('failed')
      })
    return () => controller.abort()
  }, [universe.id])
  const games = Array.isArray(gamesRead) ? gamesRead : []
  const waitingForGames = params.get('context') === 'gaming' && gamesRead === 'loading'
  const gaming = params.get('context') === 'gaming' && games.length > 0
  const game = games.find((each) => each.id === params.get('game')) ?? games[0]
  const templates = params.get('context') === 'templates'
  const showLore = !gaming && !waitingForGames && !templates
  const current = templates ? 'templates' : gaming ? 'gaming' : 'lore'

  function chooseContext(next: 'lore' | 'gaming' | 'templates') {
    if (next === current) return
    setParams((current) => {
      const copy = new URLSearchParams(current)
      if (next === 'lore') {
        copy.delete('context')
        copy.delete('game')
      } else if (next === 'templates') {
        copy.set('context', 'templates')
        copy.delete('game')
      } else {
        copy.set('context', 'gaming')
        copy.set('game', game.id)
      }
      return copy
    })
  }

  function chooseGame(id: string) {
    if (id === game?.id) return
    setParams((current) => {
      const copy = new URLSearchParams(current)
      copy.set('game', id)
      return copy
    })
  }

  return {
    games,
    waitingForGames,
    gaming,
    game,
    templates,
    showLore,
    current,
    chooseContext,
    chooseGame,
  }
}

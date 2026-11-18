import type { Dictionary } from '../../en'

const projectsSeasons: Dictionary['projects']['seasons'] = {
  title: 'Temporadas',
  lede: 'As temporadas em que esta série é contada, e os episódios que as compõem.',
  failed: 'Não foi possível ler as temporadas deste projeto.',
  empty: 'Ainda não há temporadas.',
  emptyHint:
    'Uma temporada agrupa episódios. Uma série que não funcione assim pode deixar isto vazio.',
  add: 'Adicionar temporada',
  name: 'Nome',
  summary: 'Descrição',
  saving: 'A adicionar…',
  rename: 'Mudar o nome',
  renameSave: 'Guardar',
  delete: 'Eliminar temporada',
  noEpisodes: 'Ainda não há episódios.',
  episodeCount: {
    one: '1 episódio',
    other: '{count} episódios',
  },
  addEpisode: 'Adicionar episódio',
  episodeTitle: 'Título',
  synopsis: 'Sinopse',
  deleteEpisode: 'Eliminar episódio',
  hasScript: 'Guião, {count} caracteres',
  noScript: 'Ainda não há guião',
  openScript: 'Abrir guião',
  closeScript: 'Fechar guião',
  script: 'Guião',
  saveScript: 'Guardar',
  savingScript: 'A guardar…',
  scriptStale:
    'Este episódio foi alterado noutro lugar. Nada foi substituído: abra-o outra vez para ver o que diz agora.',
  moveToSeason: 'Mover para',
}

export default projectsSeasons

import type { Dictionary } from '../en'

/** Projetos criativos: os romances, jogos, séries, filmes e bandas desenhadas que o autor está a fazer (#138, #139). */
const projects = {
  nav: {
    all: 'Todos os projetos',
    new: 'Novo projeto',
    expand: 'Mostrar este projeto',
    collapse: 'Esconder este projeto',
  },
  sections: {
    overview: 'Resumo',
  },
  kind: {
    writing: 'Escrita',
    game: 'Jogo',
    series: 'Série',
    film: 'Filme',
    comic: 'Banda desenhada',
  },
  lifecycle: {
    planning: 'A planear',
    active: 'Em curso',
    complete: 'Terminado',
    archived: 'Arquivado',
  },
  list: {
    title: 'Projetos',
    loading: 'A ler os seus projetos.',
    failed: 'Não foi possível ler os seus projetos.',
    empty: 'Ainda não há projetos.',
    emptyHint:
      'Um projeto é o que está a fazer: um romance, um jogo, uma série, um filme ou uma banda desenhada.',
    noUniverse: 'Sem universo',
  },
  one: {
    title: 'Projeto',
    loading: 'A ler este projeto.',
    failed: 'Não foi possível ler este projeto.',
    missing: 'Este projeto não está aqui.',
    missingHint: 'Pode ter sido removido, ou pertence a outra conta.',
    noSummary: 'Ainda não há descrição.',
  },
  new: {
    title: 'Novo projeto',
    name: 'Nome',
    namePlaceholder: 'Escreva um nome',
    kind: 'Que tipo de trabalho é?',
    summary: 'Descrição',
    summaryPlaceholder: 'Escreva uma descrição curta',
    save: 'Criar projeto',
    saving: 'A criar.',
    failed: 'Não foi possível criar o projeto.',
    needsUniverse: 'Um projeto pertence a um universo.',
    needsUniverseHint:
      'Abra o universo a que este trabalho pertence e crie o projeto aí. Um universo pode ter muito pouco conteúdo e continuar a ser o lugar onde um projeto vive.',
    chooseUniverse: 'Escolher um universo',
  },
} satisfies Dictionary['projects']

export default projects

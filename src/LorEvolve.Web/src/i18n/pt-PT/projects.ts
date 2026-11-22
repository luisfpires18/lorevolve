import type { Dictionary } from '../en'
import projectsComics from './projects/comics'
import projectsSagas from './projects/sagas'
import projectsSchema from './projects/schema'
import projectsSeasons from './projects/seasons'
import projectsScript from './projects/script'
import projectsStructure from './projects/structure'
import projectsPages from './projects/pages'
import projectsEntries from './projects/entries'

/** Projetos criativos: os romances, jogos, séries, filmes e bandas desenhadas que o autor está a fazer (#138, #139). */
const projects = {
  cover: {
    tooBig: 'As imagens têm de ter {mb} MB ou menos.',
    removeFailed: 'Não foi possível remover a capa.',
    cardAlt: 'A capa tal como o cartão do jogo a mostra',
    empty: 'Ainda sem capa',
    replace: 'Substituir capa',
    upload: 'Carregar capa',
    editFraming: 'Editar enquadramento',
    editFramingTitle: 'Editar enquadramento',
    frameTitle: 'Enquadrar a capa',
    saveFraming: 'Guardar',
    confirmUpload: 'Carregar',
    updatingCard: 'A atualizar a capa',
    processing: 'A processar a imagem',
    cropHint:
      'Arrasta a imagem para posicionar o enquadramento, ou seleciona-a e usa as setas do teclado. A imagem inteira é guardada; o enquadramento é o que o cartão mostra.',
    removing: 'A remover…',
    remove: 'Remover capa',
    hint: 'Uma imagem larga, enquadrada em 16:10 para o cartão do jogo. JPEG, PNG ou WebP, até 8 MB.',
    hintPublic:
      'Uma imagem larga, enquadrada em 16:10 para o cartão do jogo. JPEG, PNG ou WebP, até 8 MB.',
  },
  common: {
    loading: 'A ler',
    more: 'Mais ações para {name}',
    alreadyFirst: 'Já é o primeiro',
    alreadyLast: 'Já é o último',
    addPicture: 'Adicionar imagem',
    changePicture: 'Mudar imagem',
  },
  shelf: {
    moved: '“{name}” é agora o {n} de {total}.',
    moveFailed: 'Não foi possível mover esse projeto. Tenta de novo.',
  },
  comics: projectsComics,
  sagas: projectsSagas,
  nav: {
    all: 'Todos os projetos',
    new: 'Novo projeto',
  },
  sections: {
    structure: 'Estrutura',
    manuscript: 'Manuscrito',
    entities: 'Entidades',
    types: 'Tipos',
    systems: 'Sistemas',
    ideas: 'Ideias',
  },
  tabs: {
    label: 'Vistas do projeto',
  },
  view: {
    empty: 'Ainda não há nada nesta vista.',
    emptyHint: 'Esta vista vai encher-se à medida que o projeto ganhar o que pertence aqui.',
  },
  ideas: {
    ownerOnly: 'As ideias aqui são do dono do universo.',
    ownerOnlyHint:
      'Uma ideia pertence à conta que a guarda, por isso só o dono deste universo guarda ideias para os seus projetos.',
  },
  kind: {
    writing: 'Escrita',
    game: 'Jogo',
    series: 'Série',
    film: 'Filme',
    comic: 'Banda desenhada',
  },
  format: {
    'feature-film': 'Longa-metragem / Filme',
    'short-film': 'Curta-metragem',
    special: 'Especial',
    trailer: 'Trailer',
    'tv-show': 'Série de TV',
    'limited-series': 'Minissérie',
    'western-comic': 'Banda desenhada ocidental',
    manga: 'Manga',
    'graphic-novel': 'Novela gráfica',
    'one-shot': 'One-shot',
    webcomic: 'Webcomic / Webtoon',
    unset: 'Formato por definir',
  },
  lifecycle: {
    planning: 'A planear',
    active: 'Em curso',
    complete: 'Terminado',
    archived: 'Arquivado',
  },
  list: {
    title: 'Projetos',
    lede: 'O que está a fazer neste universo.',
    loading: 'A ler os seus projetos.',
    failed: 'Não foi possível ler os seus projetos.',
    empty: 'Ainda não há projetos.',
    emptyHint:
      'Um projeto é o que está a fazer: um romance, um jogo, uma série, um filme ou uma banda desenhada.',
    emptyWriting: 'Ainda não há projetos de escrita.',
    emptyGame: 'Ainda não há projetos de jogo.',
    emptyCinema: 'Ainda não há projetos de filme ou série.',
    emptyComic: 'Ainda não há projetos de banda desenhada.',
    emptyCategoryHint: 'Use Novo projeto para começar um neste universo.',
  },
  gameEntities: {
    lede: 'As categorias deste jogo, cada uma com as entradas que contém.',
    back: 'Entidades de jogo',
    notFound: 'Este jogo não está neste universo.',
    notFoundHint: 'Volte às Entidades de jogo e escolha um dos jogos.',
    entity: {
      loading: 'A ler esta entidade.',
      failed: 'Não foi possível ler esta entidade.',
      notFound: 'Não foi possível encontrar esta entidade.',
      notFoundHint: 'Pode ter sido apagada ou não faz parte deste jogo.',
      backToGame: 'Voltar ao jogo',
      noImage: 'Ainda sem imagem',
      noDescription: 'Ainda sem descrição.',
      imageAlt: 'Imagem de {name}',
      fields: 'Campos',
      edit: 'Editar',
      editTitle: 'Editar esta entidade',
      noValue: 'Ainda sem valor',
      noFields: 'Este tipo ainda não tem campos.',
      fieldImageAlt: 'Imagem de {name}',
    },
  },
  directory: {
    lede: 'Escolha um tipo de projeto para ver o que está a fazer neste universo.',
    none: 'Ainda sem projetos',
    count: { one: '1 projeto', other: '{n} projetos' },
    loadFailed: 'Não foi possível contar os seus projetos.',
  },
  one: {
    title: 'Projeto',
    loading: 'A ler este projeto.',
    failed: 'Não foi possível ler este projeto.',
    missing: 'Este projeto não está aqui.',
    missingHint: 'Pode ter sido removido, ou pertence a outra conta.',
  },
  schema: projectsSchema,
  seasons: projectsSeasons,
  sequences: {
    leaveEpisode: 'Esta cena tem alterações por guardar. Sair sem as guardar?',
    leave: 'Esta sequência tem alterações por guardar. Sair sem as guardar?',
    title: 'Sequências',
    lede: 'Os trechos em que este filme está dividido, e as cenas que os compõem.',
    empty: 'Ainda não há sequências.',
    emptyHint: 'Uma sequência agrupa cenas, como um ato ou uma cena de ação.',
    add: 'Adicionar sequência',
    delete: 'Eliminar sequência',
    noEpisodes: 'Ainda não há cenas.',
    episodeCount: {
      one: '1 cena',
      other: '{count} cenas',
    },
    addEpisode: 'Adicionar cena',
    deleteEpisode: 'Eliminar cena',
    moveToSeason: 'Mover para',
  },
  script: projectsScript,
  structure: projectsStructure,
  volumes: {
    leaveEpisode: 'Este capítulo tem alterações por guardar. Sair sem as guardar?',
    leave: 'Este volume tem alterações por guardar. Sair sem as guardar?',
    title: 'Volumes',
    lede: 'Os volumes em que esta banda desenhada é reunida, e os capítulos que os compõem.',
    empty: 'Ainda não há volumes.',
    emptyHint: 'Um volume reúne capítulos, como um livro ou um arco.',
    add: 'Adicionar volume',
    delete: 'Eliminar volume',
    noEpisodes: 'Ainda não há capítulos.',
    episodeCount: {
      one: '1 capítulo',
      other: '{count} capítulos',
    },
    addEpisode: 'Adicionar capítulo',
    deleteEpisode: 'Eliminar capítulo',
    moveToSeason: 'Mover para',
  },
  pages: projectsPages,
  entities: {
    title: 'Entidades',
    lede: 'O que este projeto contém, por tipo. Abre um tipo para ver os seus registos.',
    manage: 'Gerir tipos',
  },
  entries: projectsEntries,
  new: {
    leave: 'Este projeto ainda não foi criado. Sair sem o criar?',
    cinema: 'Cinema',
    title: 'Novo projeto',
    name: 'Nome',
    kind: 'Que tipo de trabalho é?',
    format: 'Formato',
    summary: 'Descrição',
    save: 'Criar projeto',
    saving: 'A criar…',
    failed: 'Não foi possível criar o projeto.',
    needsUniverse: 'Um projeto pertence a um universo.',
    needsUniverseHint:
      'Abra o universo a que este trabalho pertence e crie o projeto aí. Um universo pode ter muito pouco conteúdo e continuar a ser o lugar onde um projeto vive.',
    chooseUniverse: 'Escolher um universo',
  },
} satisfies Dictionary['projects']

export default projects

import type { Dictionary } from '../en'

/** O invólucro de um universo: a sua barra, os seus separadores e a vista geral (#102). */
const workspace: Dictionary['workspace'] = {
  rail: {
    brand: 'LorEvolve',
    universe: 'Universo',
    archived: 'Arquivado',
    opening: 'A abrir…',
    sections: 'Secções',
    close: 'Fechar',
    allUniverses: 'Todos os universos',
    sharedAs: 'Partilhado como {role}',
  },
  missing: {
    title: 'Esse universo não está aqui.',
    back: 'Voltar aos teus universos',
    failed: 'Não foi possível abrir este universo.',
    tryAgain: 'Tentar de novo',
  },
  overview: {
    noDescription: 'Ainda sem descrição.',
    noDescriptionOwn:
      'Ainda sem descrição. É em {settings} que dás a este mundo a sua primeira linha.',
    noDescriptionSettings: 'Definições',
    dates: 'Criado a {created}, alterado pela última vez a {changed}',
    shared: 'Partilhado contigo como {role}. {description}',
    empty:
      'Ainda não está nada escrito aqui. {lore}, onde cada personagem, lugar e coisa ganha a sua página.',
    emptyLore: 'Começa em Lore',
    groups: {
      world: 'Mundo',
      rules: 'Regras',
      writing: 'Escrita',
      review: 'Revisão',
    },
  },
  sections: {
    overview: {
      label: 'Vista geral',
      purpose: 'Este universo num relance.',
    },
    lore: {
      label: 'Lore',
      purpose: 'Todas as entradas: pessoas, lugares, coisas e ideias.',
    },
    types: {
      label: 'Tipos',
      purpose: 'Os tipos de entrada e de relação que este mundo usa.',
    },
    familyTree: {
      label: 'Árvore genealógica',
      purpose: 'Famílias deduzidas das ligações registadas.',
    },
    maps: {
      label: 'Mapas',
      purpose: 'Imagens do mundo, com marcadores que abrem a lore que representam.',
    },
    worldRules: {
      label: 'Regras do mundo',
      purpose: 'Como este universo funciona, dito com clareza.',
    },
    canon: {
      label: 'Cânone',
      purpose: 'Onde a lore quebra as suas próprias Regras do mundo. Ainda em construção.',
    },
    chronology: {
      label: 'Calendário',
      purpose:
        'Como as datas são escritas e ordenadas: anos simples, ou períodos de datas com nome.',
    },
    stories: {
      label: 'Histórias',
      purpose: 'Narrativas contadas com este mundo, cena a cena.',
    },
    timeline: {
      label: 'Linha do tempo',
      purpose: 'O que aconteceu, pela ordem em que aconteceu.',
    },
    ideas: {
      label: 'Ideias',
      purpose: 'Possibilidades, mantidas à parte da lore.',
    },
    aiChanges: {
      label: 'Alterações da IA',
      purpose: 'Alterações propostas por uma IA, à espera de aprovação ou recusa.',
    },
    trash: {
      label: 'Reciclagem',
      purpose: 'O que foi removido, à espera de ser restaurado.',
    },
    publish: {
      label: 'Publicação',
      purpose: 'Como este universo aparece no portal público.',
    },
    settings: {
      label: 'Definições',
      purpose: 'Nome, cor, colaboradores, cópias de segurança e arquivo.',
    },
  },
}

export default workspace

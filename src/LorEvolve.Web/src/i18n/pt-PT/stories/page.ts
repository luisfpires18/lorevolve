import type { Dictionary } from '../../en'

const storiesPage: Dictionary['stories']['page'] = {
  opening: 'A abrir a história…',
  missing: {
    title: 'Essa história não está aqui.',
    hint: 'Pode ter sido eliminada. {link}',
    back: 'Voltar às histórias',
  },
  loadError: 'Não foi possível abrir esta história.',
  retry: 'Tentar novamente',
  orderFailed: 'Não foi possível guardar a nova ordem.',
  loreReordered: 'O lore de “{title}” está numa nova ordem.',
  sceneMoved: '“{title}” é agora a cena {n} de {total}.',
  sceneMovedIn: '“{title}” é agora a cena {n} de {total} em {container}.',
  sceneMovedTo: '“{title}” foi movida para {container}, cena {n} de {total}.',
  sceneMoveFailed: 'Não foi possível mover essa cena.',
  chapterMoved: '“{title}” é agora o capítulo {n} de {total}.',
  chapterNoArc: '“{title}” já não está em nenhum arco.',
  chapterMovedToArc: '“{title}” foi movido para {label}, no fim.',
  chapterMoveFailed: 'Não foi possível mover esse capítulo.',
  arcMoved: '“{title}” é agora o arco {n} de {total}.',
  removeArc: {
    title: 'Eliminar {label}?',
    empty: 'Não tem capítulos. O arco vai para a reciclagem, e podes restaurá-lo a partir de lá.',
    message:
      'Os respetivos capítulos ({chapters}) ficam onde estão, sem arco, com todas as cenas que contêm. O arco vai para a reciclagem, e ao restaurá-lo os capítulos voltam a ficar nele.',
    confirm: 'Mover arco para a reciclagem',
    busy: 'A mover…',
    failure: 'Não foi possível eliminar esse arco.',
    done: 'Arco “{title}” movido para a reciclagem.',
  },
  removeScene: {
    title: 'Mover a cena “{title}” para a reciclagem?',
    message:
      'O manuscrito e as versões guardadas vão com ela. O lore que liga fica. Podes restaurá-la a partir da reciclagem.',
    messageWithBeats:
      'O manuscrito, as versões guardadas e os momentos da cena vão com ela. O lore que liga fica. Podes restaurá-la a partir da reciclagem.',
    confirm: 'Mover cena para a reciclagem',
    busy: 'A mover…',
    failure: 'Não foi possível eliminar essa cena.',
    done: '“{title}” movida para a reciclagem.',
  },
  removeChapter: {
    title: 'Eliminar {label}?',
    messageEmpty:
      'O capítulo será removido. Não tem cenas. O capítulo vai para a reciclagem, e ao restaurá-lo volta sem mover nenhuma cena.',
    message:
      'O capítulo será removido. Move {scenes} para Sem capítulo, com os respetivos manuscritos e momentos da cena. Nenhuma cena é eliminada. O capítulo vai para a reciclagem, e ao restaurá-lo volta sem mover nenhuma cena.',
    confirm: 'Mover capítulo para a reciclagem',
    busy: 'A mover…',
    failure: 'Não foi possível eliminar esse capítulo.',
    done: 'Capítulo “{title}” movido para a reciclagem.',
    doneOne: 'Capítulo “{title}” movido para a reciclagem. {scenes} passou para Sem capítulo.',
    doneMany: 'Capítulo “{title}” movido para a reciclagem. {scenes} passaram para Sem capítulo.',
  },
  removeStory: {
    title: 'Mover “{title}” para a reciclagem?',
    scenes: '{scenes}, com todos os manuscritos',
    message:
      'Tudo o que se segue vai com ela. Podes restaurar a história inteira a partir da reciclagem. O lore em que se baseia fica.',
    confirm: 'Mover história para a reciclagem',
    busy: 'A mover…',
    failure: 'Não foi possível eliminar essa história.',
  },
  newScene: 'Nova cena',
  newChapter: 'Novo capítulo',
  newArc: 'Novo arco',
  crumb: 'Histórias',
  timeline: 'Ver na linha do tempo',
  views: 'Vistas da história',
  viewIdeas: 'Ideias',
  storyActions: 'Ações da história {title}',
  menuTimeline: 'Ver na linha do tempo',
  suggest: 'Sugerir alterações',
  editStory: 'Editar história',
  deleteStory: 'Eliminar história',
  sent: 'Sugestão enviada. Está à espera em Revisão.',
  stale: 'Não foi possível voltar a ler a história, por isso o que se vê pode estar desatualizado.',
  staleRetry: 'Tentar novamente',
  unavailable: {
    title: 'Esta parte do universo não está disponível para ti.',
    hint: 'As ideias são privadas de cada conta. As ideias deste universo pertencem ao seu proprietário.',
  },
  structureHeading: 'Estrutura',
  asideStructured:
    'Arcos e capítulos por ordem, e as cenas de cada um pela ordem em que são contadas. O momento em que cada uma acontece no universo nunca a desloca.',
  aside:
    'Pela ordem em que são contadas. O momento em que cada uma acontece no universo nunca a desloca.',
  empty: {
    title: 'Ainda sem cenas.',
    hint: 'Começa por uma cena: o manuscrito escreve-se uma cena de cada vez. As cenas são contadas pela ordem que definires, seja qual for o momento em que cada uma acontece no universo, e podem ser agrupadas em capítulos e arcos quando quiseres, ou nunca.',
  },
  unchapteredHint: '{scenes} ainda sem capítulo.',
  savedScene: '“{title}” guardada.',
  savedChapter: 'Capítulo “{title}” guardado.',
  savedArc: 'Arco “{title}” guardado.',
  fold: {
    collapse: 'Recolher',
    expand: 'Expandir',
    collapseLabel: 'Recolher {label}',
    expandLabel: 'Expandir {label}',
  },
}

export default storiesPage

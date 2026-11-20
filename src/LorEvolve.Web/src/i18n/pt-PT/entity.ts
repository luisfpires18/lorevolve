import type { Dictionary } from '../en'
import entityHistory from './entity/history'
import entityArticle from './entity/article'
import entityPage from './entity/page'

/** Uma entrada: a sua página, artigo, histórico, cartões, imagens, gravação e recuperação (#102). */
const entity: Dictionary['entity'] = {
  wip: {
    title: 'Em desenvolvimento: ainda não funciona bem',
    label: 'WIP',
  },
  fact: {
    yes: 'Sim',
    no: 'Não',
    inTrash: '{name} (na Reciclagem)',
  },
  history: entityHistory,
  card: {
    select: 'Selecionar {name}',
    also: 'também {names}',
    inArticle: 'No artigo',
  },
  save: {
    status: {
      saving: 'A guardar…',
      unsaved: 'Alterações por guardar',
      saved: 'Guardado',
    },
    button: {
      saving: 'A guardar…',
      saved: 'Guardado',
    },
  },
  conflict: {
    replaceConfirm: {
      title: 'Substituir as tuas alterações por guardar pela versão mais recente?',
      message: 'As tuas alterações vão perder-se.',
      confirm: 'Usar a versão mais recente',
      cancel: 'Manter as minhas alterações',
    },
    suggestion: {
      title: 'Houve uma alteração enquanto escrevias a tua sugestão ({what}).',
      text: 'A tua sugestão continua aqui e não foi enviada. Vê primeiro a versão mais recente e depois decide o que manter.',
    },
    edit: {
      title: 'Houve uma alteração enquanto estavas a editar ({what}).',
      text: 'As tuas alterações continuam aqui e não foram guardadas. O LorEvolve não guarda por cima da versão mais recente. Vê-a primeiro e depois decide o que manter.',
    },
    review: 'Rever a versão mais recente',
    failed: 'O LorEvolve não conseguiu abrir a versão mais recente. Tenta de novo.',
    loading: 'A abrir a versão mais recente…',
    missing:
      'Isto já não está aqui ({what}). Pode ter ido parar à Reciclagem. As tuas alterações continuam no ecrã, por isso copia-as antes de saíres.',
    latestHeading: 'Última versão guardada',
    keepMine: 'Manter as minhas alterações',
    useLatest: 'Usar a versão mais recente',
    hint: {
      suggestion: 'A tua sugestão fica aqui, por enviar. Envia-a de novo quando quiseres.',
      edit: 'As tuas alterações ficam onde estão, por guardar. Guarda de novo quando quiseres.',
    },
    sides: {
      latest: 'Guardada agora',
      mine: 'A tua versão',
    },
    matches: 'A versão mais recente coincide com as tuas alterações.',
    latestTextHint: 'A tua versão continua no editor.',
  },
  recovered: {
    confirm: {
      title: 'Descartar o rascunho recuperado ({what})?',
      message: 'As alterações nele nunca foram guardadas e não podem ser recuperadas.',
      confirm: 'Descartar rascunho',
    },
    title: 'Rascunho recuperado',
    kept: 'Este dispositivo manteve uma cópia de alterações nunca guardadas ({what}), de {time}.',
    savedAgain:
      'O texto voltou a ser guardado desde que essa cópia foi feita, a última vez em {time}, por isso a cópia pode ser mais antiga do que o texto guardado.',
    savedChanged:
      'O texto guardado mudou desde que essa cópia foi feita, por isso a cópia pode estar desatualizada.',
    hint: 'Recuperar coloca a cópia no editor como alterações por guardar. Nada é guardado até guardares.',
    recover: 'Recuperar rascunho',
    discard: 'Descartar rascunho',
    hide: 'Ocultar o rascunho',
    show: 'Mostrar o rascunho',
  },
  privateNote: {
    what: 'nota',
    discardGuard: 'Esta nota tem alterações por guardar. Fechar sem as guardar?',
    gone: 'Esta entrada já não está aqui, por isso não foi possível guardar a nota. Pode ter sido movida para a Reciclagem noutra janela. O teu texto continua aqui: copia-o antes de fechares.',
    saveFailed: 'Não foi possível guardar a nota. O teu texto continua aqui. Tenta de novo.',
    privacy:
      'Só tu, o proprietário deste universo, podes ler isto. Nunca é publicado, pesquisado, mostrado a colaboradores nem lido por uma aplicação ligada.',
    opening: 'A abrir a nota…',
    openFailed: 'Não foi possível abrir esta nota.',
    retry: 'Tentar de novo',
    latestLabel: 'Última nota guardada',
    latestBlank: 'Sem texto na versão mais recente.',
    field: 'Nota',
    placeholder: 'Insira uma nota',
    tooLong: 'Demasiado longo para guardar: {used} de {max} caracteres.',
    save: 'Guardar',
    nothingSaved: 'Ainda nada guardado',
    savedAt: 'Guardado {when}',
    triggerTitle: 'Nota privada',
    triggerLabel: 'Nota privada',
    eyebrow: 'Nota privada',
  },
  image: {
    tooBig: 'As imagens têm de ter {mb} MB ou menos.',
    removeFailed: 'Não foi possível remover essa imagem.',
    heading: 'Imagem',
    replace: 'Substituir',
    add: 'Adicionar imagem',
    editThumbnail: 'Editar miniatura',
    removing: 'A remover…',
    remove: 'Remover',
    hint: {
      pending: 'Adicionada quando esta entrada for criada.',
      rules: 'Uma imagem. JPEG, PNG ou WebP, até 8 MB.',
    },
    crop: {
      editTitle: 'Editar miniatura',
      frameTitle: 'Enquadrar a miniatura',
      saveThumbnail: 'Guardar',
      upload: 'Carregar',
      usePicture: 'Usar esta imagem',
    },
  },
  fieldImage: {
    saveTypeFirst: 'Guarda o novo tipo de entrada antes de acrescentar ou alterar imagens.',
    reframe: 'Editar recorte',
    uploadFailed: 'Não foi possível guardar a imagem de "{name}".',
    crop: {
      editTitle: 'Editar recorte',
      frameTitle: 'Recortar a imagem',
      saveCrop: 'Guardar',
    },
  },
  picker: {
    placeholder: 'Pesquisar neste universo',
    change: 'Alterar',
    looking: 'A procurar…',
    none: 'Nada com esse nome.',
    create: 'Criar “{name}”',
    newEntry: 'Nova entrada',
    created: 'Entrada criada: {name}. {hint} {link}',
    openFull: 'Abrir entrada completa',
  },
  multiPicker: {
    placeholder: 'Pesquisar neste universo',
    remove: 'Remover {name}',
    looking: 'A procurar…',
    none: 'Nada com esse nome.',
  },
  article: entityArticle,
  articleHistory: {
    restored: 'Versão {number} restaurada',
    restoredEarlier: 'Versão anterior restaurada',
    cleared: 'Artigo limpo',
    first: 'Primeira versão',
    saved: 'Guardada',
    openFailed: 'Não foi possível abrir essa versão.',
    confirm: {
      title: 'Repor a versão {number} do artigo?',
      message: 'Passa a ser a versão mais recente, e nada no histórico se perde.',
      confirm: 'Repor esta versão',
    },
    stale:
      'O artigo foi guardado noutro local depois de esta página abrir, por isso nada foi reposto. O artigo acima é agora o mais recente.',
    entryGone: 'Esta entrada já não está aqui, por isso nada foi reposto.',
    restoreFailed: 'Não foi possível repor essa versão.',
    toggle: 'Histórico do artigo',
    readFailed: 'Não foi possível ler o histórico do artigo.',
    opening: 'A abrir…',
    none: 'Ainda sem versões guardadas.',
    nowShowing: 'a mostrar',
    version: 'Versão {number}',
    restoring: 'A restaurar…',
    restore: 'Restaurar',
    snapshotOpening: 'A abrir…',
    snapshotBlank: 'Sem texto nesta versão.',
  },
  page: entityPage,
  copy: {
    unavailable: 'Não foi possível abrir a entrada a copiar. Esta é uma nova entrada em branco.',
    title: 'A copiar de {name}',
    intro:
      'O seu tipo, resumo, etiquetas e campos estão no formulário abaixo. Altera o que quiseres antes de criares a entrada.',
    also: 'Copiar também',
    aliases: 'Outros nomes: {names}',
    references: 'Ligações a outras entradas: {names}',
    referencesSameType: 'Ligações a outras entradas: {names} (apenas dentro do mesmo tipo)',
    referenceItem: '{field}: {entry}',
    anotherEntry: 'Outra entrada',
    article: 'Artigo',
    noLinks: 'O artigo não tem ligações.',
    linksCopied: {
      one: 'O artigo é copiado com a sua ligação, tal como está escrita:',
      other: 'O artigo é copiado com as suas {n} ligações, tal como estão escritas:',
    },
    inside: '{href} (dentro do LorEvolve)',
    skipped:
      'Não copiado: a sua imagem, relações, ligações a histórias e cenas, eras, formas e aspetos, comentários, histórico e publicação. A cópia começa como Ideia e fica privada.',
  },
  sections: {
    fields: {
      one: '{n} campo',
      other: '{n} campos',
    },
    required: '{n} obrigatórios',
    attention: {
      one: '{n} precisa de atenção',
      other: '{n} precisam de atenção',
    },
  },
}

export default entity

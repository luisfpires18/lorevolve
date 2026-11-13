import type { Dictionary } from '../en'

/** Trash, backups and restore, exports, connected apps and feedback (#105). */
const data: Dictionary['data'] = {
  tokens: {
    remove: 'Remover {value}',
  },
  export: {
    backupFailed: 'Não foi possível preparar essa cópia de segurança. Tenta novamente.',
    exportFailed: 'Não foi possível preparar essa exportação. Tenta novamente.',
  },
  feedback: {
    open: 'Opinião',
    thanks: 'Obrigado. O teu relatório foi enviado.',
    leaveConfirm: 'Este relatório não foi enviado. Sair sem o enviar?',
    describe: 'Descreve em poucas palavras.',
    sendFailed: 'Não foi possível enviar. Tenta novamente.',
    title: 'Comunicar um erro ou pedir uma funcionalidade',
    kindLabel: 'Do que se trata?',
    kindGroup: 'Do que se trata?',
    kindBug: 'Erro',
    kindFeature: 'Pedido de funcionalidade',
    textBug: 'O que correu mal?',
    textFeature: 'O que gostarias que existisse?',
    hintBug:
      'O que fizeste, o que esperavas e o que aconteceu em vez disso. A página em que estás é enviada junto.',
    hintFeature:
      'O que te permitiria fazer e onde o usarias. A página em que estás é enviada junto.',
    sending: 'A enviar',
    send: 'Enviar',
    cancel: 'Cancelar',
  },
  connectedApps: {
    status: {
      active: 'Ligada',
      noAccess: 'Sem acesso: já não és membro deste universo',
      expired: 'Precisa de ser ligada de novo: liga-a outra vez a partir da aplicação para a usar',
    },
    disconnectedAnnouncement: '{client} foi desligada de {universe}.',
    title: 'Aplicações ligadas',
    note: 'Aplicações de IA a que permitiste ler um universo. Cada uma lê apenas esse universo, com o teu acesso, e não pode alterar nada.',
    loading: 'A carregar as tuas aplicações ligadas…',
    loadFailed: 'Não foi possível carregar as tuas aplicações ligadas.',
    retry: 'Tentar novamente',
    empty: 'Não há aplicações ligadas. Para ligar uma, abre um universo e escolhe Ligar à IA.',
    disconnectFailed: 'Não foi possível desligar a aplicação. Tenta novamente.',
    readerFailed: 'Não foi possível torná-la Leitor. Tenta novamente.',
    publishedBy: 'Publicada por {host}',
    unverified: 'Aplicação não verificada',
    creator: 'Criador: lê e propõe alterações para revisão',
    reader: 'Leitor: apenas lê',
    reads: 'Lê {universe}',
    connectedOn: 'Ligada em {date}',
    lastUsed: 'Última utilização em {date}',
    neverUsed: 'Ainda não utilizada',
    makeReaderLabel: 'Tornar {client} Leitor de {universe}',
    changing: 'A alterar',
    makeReader: 'Tornar Leitor',
    disconnectLabel: 'Desligar {client} de {universe}',
    disconnect: 'Desligar',
    confirmTitle: 'Desligar {client} de {universe}?',
    confirmNote:
      'A aplicação perde o acesso de imediato. Manténs a sessão iniciada no LorEvolve, e as tuas outras ligações continuam a funcionar. Podes ligá-la de novo mais tarde.',
    disconnecting: 'A desligar',
    keep: 'Manter',
    stopped:
      'Agora é Leitor: continua a poder ler, mas já não pode propor alterações. O que já propôs só pode ser rejeitado.',
  },
  trash: {
    title: 'Reciclagem',
    ledeOwner:
      'O que removeste do teu lore, das tuas histórias e das tuas regras do mundo. Tudo o que está aqui pode ser restaurado, com tudo o que continha, até decidires eliminar para sempre.',
    ledeMember:
      'O que foi removido do lore, das histórias e das regras do mundo deste universo. Tudo o que está aqui pode ser restaurado, com tudo o que continha. O que era público é restaurado como privado. Só o proprietário pode eliminar seja o que for para sempre.',
    ideasPointer:
      'As ideias eliminadas não estão aqui: pertencem à tua conta, e esperam em {link}.',
    ideasLink: 'Ideias, em Eliminadas recentemente',
    select: 'Selecionar',
    loading: 'A procurar na reciclagem…',
    loadFailed: 'Não foi possível abrir a reciclagem.',
    retry: 'Tentar novamente',
    kind: {
      entry: 'Entrada',
      story: 'História',
      chapter: 'Capítulo',
      scene: 'Cena',
      arc: 'Arco',
      worldRule: 'Regra do mundo',
      relationship: 'Relação',
      timelineEvent: 'Acontecimento',
    },
    where: {
      story: 'Uma história inteira, com tudo o que contém',
      worldRule: 'Em Regras do mundo',
      relationship: 'Uma relação entre duas entradas',
      timeline: 'Na linha do tempo',
      timelineStatus: 'Na linha do tempo · {status}',
      inStory: 'Em {story}',
    },
    blocked: {
      story:
        'A história a que pertence, {story}, também está na reciclagem. Restaura primeiro a história.',
      entry: 'Uma das entradas que liga também está na reciclagem. Restaura primeiro essa entrada.',
    },
    back: {
      entry: '{name} voltou ao teu lore.',
      story: '{name} voltou às tuas histórias.',
      chapter:
        'O capítulo {name} voltou a {story}, depois dos outros capítulos. Nenhuma cena foi movida para ele.',
      scene: 'A cena {name} voltou a {story}.',
      arc: 'O arco {name} voltou a {story}.',
      worldRule: 'A regra do mundo {name} voltou a Regras do mundo.',
      relationship: 'A relação {name} voltou às duas entradas.',
      timelineEvent: 'O acontecimento {name} voltou à linha do tempo.',
    },
    erasing: {
      entry:
        'O artigo, os campos, a imagem e as versões guardadas desaparecem com ela, e as ligações e referências a ela no teu lore, linha do tempo, histórias e ideias são removidas.',
      story:
        'Tudo o que contém desaparece com ela: os capítulos, as cenas com o texto, as versões guardadas e os momentos da cena, e os arcos, incluindo os que estejam na reciclagem por si.',
      chapter:
        'Só o capítulo desaparece: o título, o resumo e as notas. As cenas que continha passaram para Sem capítulo quando foi para a reciclagem, e ficam lá.',
      scene:
        'O texto, todas as versões guardadas e os momentos da cena desaparecem com ela, e as ligações ao lore e às ideias são removidas.',
      arc: 'Só o arco desaparece. Os capítulos que nele estavam ficam onde estão, sem arco.',
      worldRule: 'A sua verificação desaparece com ela, se tiver uma.',
      relationship: 'Só a relação desaparece. As duas entradas que liga ficam como estão.',
      timelineEvent:
        'Os participantes, as ligações a histórias e os detalhes desaparecem com ele. As entradas e histórias que indicava ficam como estão.',
    },
    outcome: {
      restoredPrivately: 'Foi restaurada como privada: só o proprietário a pode publicar de novo.',
      nowPrivate: 'Agora é privada.',
      privateFailed: 'Não foi possível torná-la privada: abre-a e escolhe Tornar privado.',
      open: 'Abrir {name}',
      restoreFailed: 'Não foi possível restaurar {name}.',
      gone: '{name} já não está na reciclagem, por isso nada foi eliminado.',
      deleteFailed: 'Não foi possível eliminar {name} agora. Tenta novamente.',
      deleted: 'Eliminado para sempre: {name}.',
      bulkDeleted: {
        one: '{n} item eliminado para sempre.',
        other: '{n} itens eliminados para sempre.',
      },
      bulkChanged:
        'A reciclagem mudou antes de estes itens poderem ser eliminados, por isso nada foi eliminado. Seleciona-os de novo.',
      bulkFailed:
        'Nada foi eliminado. Não foi possível eliminar os itens selecionados agora. Tenta novamente.',
    },
    row: {
      meta: '· {where} · na reciclagem desde {date}',
      selectLabel: 'Selecionar {kind} “{name}”',
      restoreLabel: 'Restaurar {kind} “{name}”',
      eraseLabel: 'Eliminar para sempre: {kind} “{name}”',
      restore: 'Restaurar',
      restoring: 'A restaurar…',
      erase: 'Eliminar para sempre…',
    },
    empty: {
      title: 'A reciclagem está vazia.',
      hint: 'Tudo o que removeres do teu lore, das tuas histórias ou das tuas regras do mundo fica aqui à espera.',
    },
    pager: {
      label: 'Paginação',
      previous: 'Anterior',
      position: 'Página {page} de {total}',
      next: 'Seguinte',
    },
    bar: {
      hint: 'Seleciona linhas nesta página para as eliminar para sempre.',
      selected: '{n} selecionados',
      delete: 'Eliminar para sempre ({n})',
      deleteNone: 'Eliminar para sempre',
      selectPage: 'Selecionar página',
      clear: 'Limpar seleção',
      done: 'Concluído',
    },
    publish: {
      titleVisible: 'Restaurar {name} volta a torná-la pública.',
      titleHidden: '{name} continua selecionada para publicação.',
      textVisibleEntry:
        'Esta entrada era pública antes de ser movida para a reciclagem. Restaurá-la volta a torná-la visível, de imediato, no teu universo público, para qualquer pessoa.',
      textVisibleStory:
        'Esta história era pública antes de ser movida para a reciclagem. Restaurá-la volta a torná-la visível, de imediato, no teu universo público, para qualquer pessoa.',
      textHidden:
        'Estava selecionada para publicação antes de ser movida para a reciclagem. Os leitores não a veem agora, e restaurá-la não muda isso: só aparecerá quando este universo for público.',
      textHiddenStory:
        'Estava selecionada para publicação antes de ser movida para a reciclagem. Os leitores não a veem agora, e restaurá-la não muda isso: só aparecerá quando este universo for público e a história tiver um resumo público.',
      restoreVisible: 'Restaurar e publicar',
      restoreHidden: 'Restaurar, manter selecionada',
      restorePrivate: 'Restaurar como privada',
      cancel: 'Cancelar',
    },
    erase: {
      title: 'Eliminar para sempre {kind} {name}?',
      cannotUndo: 'Isto não pode ser desfeito. Fica eliminado para sempre.',
      deleting: 'A eliminar…',
      delete: 'Eliminar para sempre',
      cancel: 'Cancelar',
    },
    bulk: {
      title: {
        one: 'Eliminar para sempre {n} item selecionado?',
        other: 'Eliminar para sempre {n} itens selecionados?',
      },
      listLabel: 'Selecionados',
      each: 'Cada {kind}:',
      cannotUndo: 'Isto não pode ser desfeito. Fica tudo eliminado para sempre.',
      deleting: 'A eliminar…',
      delete: 'Eliminar para sempre',
      cancel: 'Cancelar',
    },
  },
}

export default data

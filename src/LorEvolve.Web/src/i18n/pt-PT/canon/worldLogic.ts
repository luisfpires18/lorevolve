import type { Dictionary } from '../../en'
import canonWorldLogicSystems from './worldLogicSystems'

const canonWorldLogic: Dictionary['canon']['worldLogic'] = {
  title: 'Lógica do mundo',
  lede: 'As regras que este universo mantém, os Sistemas que as agrupam e o que a verificação encontrou. Uma regra só é lida onde a declaraste explicitamente; o LorEvolve nunca lê o que uma regra diz.',
  tabs: {
    rules: 'Regras',
    systems: 'Sistemas',
    integrity: 'Integridade',
  },
  kinds: {
    worldRule: 'Regra do mundo · ',
    definition: 'Definição de regra · ',
  },
  hasCondition: 'Tem uma condição · ',
  wordsOnly: 'Só palavras · ',
  scopes: {
    universe: 'Todo o universo · ',
    project: 'Um projeto · ',
  },
  systems: canonWorldLogicSystems,
  integrity: {
    loading: 'A reunir resultados…',
    readFailed: 'Não foi possível ler os resultados.',
    check: 'Verificar as regras agora',
    checking: 'A verificar…',
    checkFailed: 'Não foi possível correr a verificação. Tente outra vez.',
    checked: 'Verificado {time}',
    truncated:
      'Esta verificação encontrou mais do que uma passagem registra, por isso nada foi fechado. Trate do que está aqui e verifique outra vez.',
    outcomes: {
      violation: 'Contradição',
      unknown: 'Não foi possível responder',
      error: 'A regra está quebrada',
    },
    outcomeHints: {
      violation: 'A lore contradiz esta regra.',
      unknown:
        'Os factos guardados não respondem a esta regra, por isso nada fica provado num sentido ou noutro. Isto não é uma aprovação.',
      error: 'A própria regra não pôde ser avaliada, por isso não verificou nada.',
    },
    statuses: {
      open: 'Aberto',
      reviewing: 'Em análise',
      resolved: 'Resolvido',
      dismissed: 'Descartado',
    },
    errorCode: 'Código {code}',
    ruleVersion: 'Versão {version} da regra',
    evidenceCount: { one: '{count} registo', other: '{count} registos' },
    found: 'Encontrado {time}',
    loadingOne: 'A reunir este resultado…',
    readOneFailed: 'Não foi possível ler este resultado.',
    evidence: 'Em que se baseia',
    noEvidence: 'Este resultado não se baseia em nenhum registo guardado.',
    rationale: 'O que a verificação concluiu, nas suas próprias palavras',
    history: 'Histórico',
    byCheck: 'Pela própria verificação',
    actions: {
      detected: 'Encontrado',
      reopened: 'Encontrado outra vez',
      reviewed: 'Em análise',
      resolved: 'Marcado como corrigido',
      dismissed: 'Descartado',
      closed: 'Já não é encontrado',
    },
    dismiss: 'Descartar',
    undismiss: 'Voltar a analisar',
    resolve: 'Marcar como corrigido',
    machine: {
      title: '{system}, {state}',
      undeclaredTitle: '{system}, um valor sem estado',
      hints: {
        undeclaredState: 'Esta entrada guarda um valor que nenhum estado da máquina declara.',
        noTransitionHolds: 'Nenhuma transição para este estado se cumpre para esta entrada.',
      },
      entry: 'Entrada {name}',
      systemVersion: 'Versão {version} do Sistema',
    },
    deciding: 'A guardar…',
    decideFailed: 'Não foi possível guardar. Tente outra vez.',
    empty: {
      title: 'Não há resultados registados.',
      hint: 'Isso pode significar que nenhuma verificação correu ainda, ou que a última não encontrou nada. Corra a verificação para saber qual.',
    },
    passed: {
      title: 'Todas as regras que podiam ser respondidas passaram.',
      hint: 'A verificação correu e não encontrou nenhuma contradição, nenhuma regra sem resposta e nenhuma regra quebrada.',
    },
    canonLink: 'Abrir resultados do Canon',
  },
}

export default canonWorldLogic

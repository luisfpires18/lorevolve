import type { Dictionary } from '../../en'
import canonWorldLogicMachine from './worldLogicMachine'

const canonWorldLogicSystems: Dictionary['canon']['worldLogic']['systems'] = {
  loading: 'A reunir Sistemas…',
  readFailed: 'Não foi possível ler os Sistemas.',
  noRules: 'Este Sistema ainda não referencia regras.',
  ruleCount: { one: '{count} regra', other: '{count} regras' },
  sharedWith: { one: 'Em {count} Sistema', other: 'Em {count} Sistemas' },
  newSystem: 'Novo Sistema',
  edit: 'Editar',
  empty: {
    title: 'Ainda não há Sistemas.',
    hint: 'Um Sistema é um conjunto de regras com nome, como um sistema de magia ou uma linha de sucessão. A mesma regra pode pertencer a vários Sistemas sem ser copiada.',
  },
  editor: {
    newTitle: 'Novo Sistema',
    editTitle: 'Editar Sistema',
    lede: 'Um Sistema é um nome e um resumo. As regras que referencia são adicionadas por agora através de MCP ou da API.',
    back: 'Voltar aos Sistemas',
    name: 'Nome',
    namePlaceholder: 'Insira um nome',
    summary: 'Resumo',
    summaryPlaceholder: 'Insira um resumo',
    create: 'Criar Sistema',
    save: 'Guardar alterações',
    saving: 'A guardar…',
    saved: 'Guardado.',
    nameTaken: 'Já existe outro Sistema com este nome.',
    invalid: 'Verifique os campos abaixo.',
    saveFailed: 'Não foi possível guardar o Sistema. Tente novamente.',
    gone: 'Este Sistema já não existe.',
    conflict:
      'Este Sistema foi alterado desde que o abriu. Carregue a versão guardada para continuar.',
    loadSaved: 'Carregar a versão guardada',
    tabs: {
      details: 'Detalhes',
      machine: 'Máquina',
    },
    delete: {
      open: 'Eliminar',
      title: 'Eliminar este Sistema?',
      message:
        'O Sistema e as suas ligações são removidos de vez. As regras que referencia são mantidas.',
      confirm: 'Eliminar Sistema',
      busy: 'A eliminar…',
    },
  },
  machine: canonWorldLogicMachine,
}

export default canonWorldLogicSystems

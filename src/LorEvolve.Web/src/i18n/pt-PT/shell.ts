import type { Dictionary } from '../en'

/** O invólucro da aplicação: rotas e ecrãs de erro, barra do espaço de trabalho, marca, diálogos e menus partilhados (#101). */
const shell: Dictionary['shell'] = {
  app: {
    loadFailed: 'Não foi possível carregar isto.',
    tryAgain: 'Tentar novamente',
    screenPending: 'A carregar este ecrã',
    sectionPending: 'A abrir…',
    crashed: {
      stale:
        'O LorEvolve foi atualizado enquanto esta página estava aberta. Recarrega para continuar.',
      generic: 'Algo correu mal nesta página. Recarrega para tentar de novo.',
      reload: 'Recarregar',
    },
  },
  crumb: {
    label: 'Caminho de navegação',
  },
  pager: {
    label: 'Paginação',
    previous: 'Anterior',
    next: 'Seguinte',
    position: 'Página {page} de {total}',
  },
  showMore: {
    label: 'Mostrar mais',
    loading: 'A carregar…',
    error: 'Não foi possível carregar mais.',
    shown: 'A mostrar {shown} de {total}',
  },
  workspace: {
    screen: {
      ideas: 'Ideias',
      projects: 'Projetos',
      profile: 'Perfil',
      aiChanges: 'Alterações da IA pendentes',
      universes: 'Universos',
    },
    navLabel: 'O meu espaço',
    context: 'O meu espaço',
    universes: 'Universos',
    ideas: 'Ideias',
    projects: 'Projetos',
    explore: 'Explorar',
  },
  brand: {
    homeLabel: 'LorEvolve, início',
  },
  skipLink: {
    label: 'Saltar para o conteúdo principal',
  },
  roleGate: {
    title: 'Esta parte do universo não está disponível para ti.',
    hint: 'O teu papel neste universo partilhado não a inclui. {back}',
    back: 'Voltar à vista geral',
  },
  actions: {
    cancel: 'Cancelar',
    close: 'Fechar',
    done: 'Concluído',
    discard: 'Descartar alterações',
    save: 'Guardar',
    moveUp: 'Mover para cima',
    moveDown: 'Mover para baixo',
    moveEarlier: 'Mover para antes',
    moveLater: 'Mover para depois',
    moveUpNamed: 'Mover {name} para cima',
    moveDownNamed: 'Mover {name} para baixo',
    moveEarlierNamed: 'Mover {name} para antes',
    moveLaterNamed: 'Mover {name} para depois',
    earlier: 'Antes',
    later: 'Depois',
    view: 'Ver',
    hide: 'Ocultar',
  },
  zoom: {
    label: 'Zoom',
    in: 'Ampliar',
    out: 'Reduzir',
  },
  confirm: {
    cancel: 'Cancelar',
    failed: 'Não foi possível fazer isso. Tenta de novo.',
    discard: {
      title: 'Fechar sem guardar as alterações?',
      message: 'Serão perdidas.',
      confirm: 'Descartar alterações',
      cancel: 'Continuar a editar',
    },
    leave: {
      confirm: 'Sair sem guardar',
      cancel: 'Ficar',
    },
  },
  api: {
    fallbackError: 'Algo correu mal. Tenta de novo.',
    networkFailure: 'Não foi possível contactar o LorEvolve. Verifica a ligação e tenta de novo.',
  },
}

export default shell

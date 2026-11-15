import type { Dictionary } from '../en'

/** O invólucro da aplicação: rotas e ecrãs de erro, barra do espaço de trabalho, marca, diálogos e menus partilhados (#101). */
const shell: Dictionary['shell'] = {
  app: {
    screenPending: 'A carregar este ecrã',
    sectionPending: 'A abrir…',
    crashed: {
      stale:
        'O LorEvolve foi atualizado enquanto esta página estava aberta. Recarrega para continuar.',
      generic: 'Algo correu mal nesta página. Recarrega para tentar de novo.',
      reload: 'Recarregar',
    },
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

import type { Dictionary } from '../en'
import adminMain from './admin/main'
import adminUser from './admin/user'
import adminRestore from './admin/restore'

/** LorEvolve Admin: accounts, invitations, backups and the deploy log (#105). */
const admin: Dictionary['admin'] = {
  documentTitle: {
    admin: 'Administração',
    main: 'Principal',
    users: 'Utilizadores',
    tracing: 'Rastreio',
    feedback: 'Opiniões',
  },
  nav: {
    label: 'Administração do LorEvolve',
    context: 'Administração do LorEvolve',
    main: 'Principal',
    users: 'Utilizadores',
    feedback: 'Opiniões',
    tracing: 'Rastreio',
    myWorkspace: 'O meu espaço de trabalho',
  },
  untracked: {
    value: 'Ainda sem registo',
    heading: 'Ainda sem registo',
    note: 'O LorEvolve não regista estes dados, por isso não se mostra nada no seu lugar.',
    newAccounts: {
      label: 'Novas contas ao longo do tempo',
      source:
        'A data de criação de cada conta passa a ser registada a partir de agora, e ainda não é contada aqui.',
    },
    active: {
      label: 'Utilizadores ativos',
      source:
        'O último início de sessão de cada conta passa a ser registado a partir de agora, e ainda não é contado aqui.',
    },
    requests: {
      label: 'Pedidos e erros',
      source: 'Não se guarda telemetria de pedidos.',
    },
    ai: {
      label: 'Utilização e custo da IA',
      source:
        'Nada é contado aqui: a IA chega a um universo por MCP, e uma proposta não custa nada a este servidor.',
    },
  },
  role: {
    member: 'Membro',
    admin: 'Administrador',
  },
  main: adminMain,
  backups: {
    heading: 'Cópias de segurança da base de dados',
    reading: 'A ler…',
    startFailed: 'Não foi possível iniciar a cópia de segurança.',
    backingUp: 'A copiar…',
    runNow: 'Fazer cópia de segurança agora',
    off: 'Desativadas neste servidor. Ativam-se nas definições da implementação: docs/recovery/database-backups.md.',
    lastVerified: {
      label: 'Última cópia de segurança verificada',
      none: 'Ainda nenhuma',
      stale: 'Desatualizada: mais antiga do que o esperado (a cada {hours} horas).',
      fresh: 'Carregada e lida de volta. A cada {hours} horas.',
      freshManual: 'Carregada e lida de volta. A cada {hours} horas, só manualmente.',
    },
    kept: {
      label: 'Guardadas',
      value: '{verified} · {size}',
      pruningOn: '{environment}, {store}. Limpeza ativa.',
      pruningOff: '{environment}, {store}. Limpeza desativada.',
    },
    attempt: {
      label: 'Última tentativa',
      none: 'Nenhuma desde que este servidor arrancou',
      failures: '{error} ({count} seguidas)',
      schedule: 'A agenda verifica a cada 15 minutos.',
    },
    outcome: {
      running: 'Em curso',
      succeeded: 'Concluída',
      failed: 'Falhou',
    },
  },
  users: {
    title: 'Utilizadores',
    lede: 'Todas as contas do LorEvolve. O conteúdo dos universos nunca é mostrado aqui.',
    search: {
      label: 'Procurar uma conta',
      placeholder: 'Nome de utilizador ou nome público',
    },
    gathering: 'A reunir as contas…',
    count: {
      one: '{n} conta',
      other: '{n} contas',
    },
    blocked: 'Bloqueada',
    viewDetails: 'Ver detalhes',
    viewDetailsFor: 'Ver detalhes de {username}',
    empty: {
      noMatch: 'Nenhuma conta corresponde a isso.',
      none: 'Ainda não há contas.',
      hint: 'Experimenta outro nome ou limpa a pesquisa.',
    },
  },
  user: adminUser,
  history: {
    heading: 'Ações de administração',
    empty: 'Não foi tomada nenhuma ação de administração sobre esta conta.',
    line: '{action} por {actor} · {time}',
    removedActor: 'uma conta removida',
    blocked: 'Bloqueou',
    unblocked: 'Desbloqueou',
    passwordResetSent: 'Enviou uma ligação de reposição da palavra-passe',
  },
  signUp: {
    leave: 'Esta ligação de registo ainda não foi criada. Sair sem a criar?',
    heading: 'Ligação de registo',
    note: 'Para quem queira entrar no LorEvolve enquanto o registo é só por convite. A ligação permite a esse endereço de email, e apenas a esse, criar uma conta. Enviar por email envia-a a partir de noreply@lorevolve.com; Criar ligação mostra-a para a enviares tu.',
    emailLabel: 'O endereço de email da pessoa',
    emailFailed: 'Não foi possível enviar o email.',
    linkFailed: 'Não foi possível criar a ligação.',
    sending: 'A enviar…',
    emailLink: 'Enviar por email',
    makeLink: 'Criar ligação',
    sent: 'Enviada para {to}. A ligação funciona até {time}.',
    link: 'Envia-lhe esta ligação, válida até {time}: {url}',
  },
  password: {
    heading: 'Palavra-passe',
    confirmTitle: 'Enviar a {username} um email com a ligação de reposição da palavra-passe?',
    confirmMessage:
      'O LorEvolve envia a ligação para o email da conta. Funciona uma só vez, durante 1 hora, e ao escolher uma nova palavra-passe a sessão é terminada em todo o lado.',
    confirmLabel: 'Enviar a ligação',
    busy: 'A enviar…',
    noteBlocked: 'Uma conta bloqueada não pode repor a palavra-passe. Desbloqueia-a primeiro.',
    note: 'Para quem não consegue iniciar sessão. Também pode usar “Esqueceste-te da palavra-passe?” na página de início de sessão.',
    send: 'Enviar ligação de reposição',
    sent: 'Enviada. A ligação funciona durante 1 hora.',
  },
  block: {
    access: 'Acesso',
    unavailable:
      'As contas de administrador não podem ser bloqueadas, por isso nenhum administrador pode bloquear-se a si próprio nem ao último administrador.',
    unavailableSelf:
      'Esta é a tua conta. As contas de administrador não podem ser bloqueadas, por isso nenhum administrador pode bloquear-se a si próprio nem ao último administrador.',
    reasonRequired: 'Indica o motivo. O motivo fica guardado no registo de auditoria.',
    reasonLabel: 'Motivo (guardado no registo de auditoria)',
    reasonDetail: 'Motivo: {reason}',
    block: {
      heading: 'Bloquear esta conta',
      note: 'Bloquear termina a sessão em todo o lado, recusa o início de sessão e desliga as aplicações de IA da conta. Nada do que a pessoa escreveu é tocado.',
      submit: 'Bloquear conta',
      confirmTitle: 'Bloquear {username}?',
      confirmMessage:
        'A sessão é terminada em todo o lado de uma só vez, a pessoa não consegue iniciar sessão e todas as aplicações de IA que ligou ficam desligadas. Os universos e tudo o que têm dentro ficam como estão.',
      confirmLabel: 'Bloquear conta',
      busy: 'A bloquear…',
    },
    unblock: {
      heading: 'Desbloquear esta conta',
      note: 'Desbloquear permite à pessoa iniciar sessão outra vez.',
      submit: 'Desbloquear conta',
      confirmTitle: 'Desbloquear {username}?',
      confirmMessage:
        'A pessoa pode voltar a iniciar sessão. As sessões e as aplicações de IA terminadas pelo bloqueio não voltam: terá de iniciar sessão e ligá-las de novo por si.',
      confirmLabel: 'Desbloquear conta',
      busy: 'A desbloquear…',
    },
  },
  tracing: {
    title: 'Rastreio',
    lede: 'Rastreio de pedidos e erros do serviço.',
    emptyTitle: 'O rastreio ainda não está disponível.',
    emptyHint:
      'As ações de bloqueio e desbloqueio ficam registadas, com quem, porquê e quando, nos detalhes de cada conta.',
  },
  feedback: {
    title: 'Opiniões',
    lede: 'Relatórios de erros e pedidos de funcionalidades, os mais recentes primeiro, com a página de onde cada um foi enviado. As horas são UTC.',
    reading: 'A ler…',
    empty: 'Ainda não foi enviado nada.',
    bug: 'Erro',
    featureRequest: 'Pedido de funcionalidade',
    removedAccount: 'Uma conta removida',
  },
  restore: adminRestore,
}

export default admin

import type { Dictionary } from '../../en'

const adminMain: Dictionary['admin']['main'] = {
  title: 'Principal',
  lede: 'O que o LorEvolve regista sobre o serviço, contado quando esta página foi aberta. As horas são UTC.',
  counting: 'A contar…',
  measured: 'Medido',
  counted: 'Contado {time}.',
  stats: {
    accounts: {
      label: 'Contas',
      source: 'Todas as contas que existem.',
    },
    admins: {
      label: 'Administradores',
      source: 'Contas com a função de Administrador.',
    },
    blocked: {
      label: 'Contas bloqueadas',
      source: 'Bloqueadas neste momento.',
    },
    universes: {
      label: 'Universos',
      source: 'Todos os universos que existem, incluindo os arquivados.',
    },
    public: {
      label: 'Universos públicos',
      source: 'Publicados agora no portal.',
    },
    collaborations: {
      label: 'Colaborações',
      source: 'Lugares de colaborador em todos os universos.',
    },
    storage: {
      label: 'Imagens guardadas',
      source:
        'Originais das imagens do Lore, incluindo as da reciclagem, tal como as contam os limites de armazenamento.',
    },
    apps: {
      label: 'Aplicações de IA ligadas',
      source: 'Ligações MCP ativas.',
    },
  },
  trend: {
    heading: 'Universos criados por mês',
    note: 'Por data de criação, em UTC. Os universos entretanto eliminados não são contados.',
  },
}

export default adminMain

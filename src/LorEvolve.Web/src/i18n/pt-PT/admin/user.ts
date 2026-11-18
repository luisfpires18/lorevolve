import type { Dictionary } from '../../en'

const adminUser: Dictionary['admin']['user'] = {
  notFound: 'Não existe nenhuma conta com este identificador.',
  all: 'Todos os utilizadores',
  opening: 'A abrir a conta…',
  publicName: 'Nome público: {name}',
  beforeRecords: 'Antes de haver registos',
  account: {
    heading: 'Conta',
    id: 'ID do utilizador',
    email: 'Email',
    role: 'Função na plataforma',
    status: 'Estado',
    blockedSince: 'Bloqueada desde {time}',
    blockedSinceUnknown: 'Bloqueada desde um momento desconhecido',
    active: 'Ativa',
    owned: 'Universos próprios',
    shared: 'Universos partilhados com a conta',
    storage: 'Armazenamento',
    storageValue: '{used} usados de {quota}',
    created: 'Conta criada',
    subscription: 'Subscrição',
  },
  signIn: {
    heading: 'Início de sessão e acesso',
    last: 'Último início de sessão',
    failed: 'Palavras-passe erradas desde então',
    lockout: 'Bloqueio de início de sessão',
    lockedUntil: 'Bloqueado até {time}',
    lockoutNone: 'Nenhum',
    apps: 'Aplicações de IA ligadas',
    appsUsed: 'Última utilização das aplicações de IA',
    appsNever: 'Nunca',
  },
}

export default adminUser

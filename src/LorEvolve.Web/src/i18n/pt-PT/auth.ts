import type { Dictionary } from '../en'

/** Iniciar sessão, criar conta, repor a palavra-passe, convites (#101). */
const auth: Dictionary['auth'] = {
  layout: {
    pitch:
      'Uma oficina para os mundos que guardas: a sua gente, os seus lugares, a sua história e as regras que os sustentam.',
  },
  routes: {
    checkingSession: 'A verificar a tua sessão',
    retry: 'Tentar de novo',
  },
  login: {
    heading: 'Iniciar sessão',
    intro: 'Retoma o teu mundo onde ele ficou.',
    unavailable: 'Não é possível iniciar sessão neste momento.',
    noAccount: 'Ainda não tens conta? {link}',
    createAccount: 'Criar conta',
    usernameOrEmail: 'Nome de utilizador ou email',
    password: 'Palavra-passe',
    forgot: 'Esqueceste-te da palavra-passe?',
    submit: 'Iniciar sessão',
    submitting: 'A iniciar sessão',
  },
  register: {
    heading: 'Criar conta',
    intro: 'Escolhe um nome, e a oficina é tua.',
    passwordsMatch: 'As duas palavras-passe têm de coincidir.',
    unavailable: 'Não é possível criar contas neste momento.',
    haveAccount: 'Já tens conta? {link}',
    signIn: 'Iniciar sessão',
    inviteOnly:
      'Por agora, o LorEvolve é só por convite. Abre o link do convite que recebeste para criar a tua conta.',
    username: 'Nome de utilizador',
    email: 'Email',
    password: 'Palavra-passe',
    confirmPassword: 'Confirmar a palavra-passe',
    submit: 'Criar conta',
    submitting: 'A criar a conta',
  },
  forgot: {
    heading: 'Esqueceste-te da palavra-passe?',
    intro: 'Escreve o email da tua conta e enviamos um link para escolheres uma nova.',
    back: 'Voltar a iniciar sessão',
    failed: 'Não é possível enviar o link neste momento.',
    sent: 'Se {email} tiver uma conta no LorEvolve, está um link a caminho. Funciona uma vez, durante 1 hora. Não chegou nada? Vê a pasta de spam, ou escreve para support@lorevolve.com.',
    email: 'Email',
    submit: 'Enviar o link',
    submitting: 'A enviar',
  },
  reset: {
    heading: 'Escolhe uma nova palavra-passe',
    intro: 'A nova palavra-passe termina a tua sessão em todo o lado.',
    back: 'Voltar a iniciar sessão',
    passwordsMatch: 'As duas palavras-passe têm de coincidir.',
    failed: 'Não é possível mudar a palavra-passe neste momento.',
    done: 'A tua palavra-passe foi mudada. {link} com a nova.',
    doneSignIn: 'Inicia sessão',
    linkMissing: 'Esta página precisa do link do teu email. {link}.',
    linkMissingAsk: 'Pede um novo',
    askAgain: 'Pedir de novo',
    newPassword: 'Nova palavra-passe',
    confirmPassword: 'Confirmar a nova palavra-passe',
    submit: 'Guardar a nova palavra-passe',
    submitting: 'A guardar',
  },
  invitation: {
    title: 'Convite',
    actionFailed: 'Não foi possível fazer isso. Tenta de novo.',
    retryLater: 'Tenta de novo daqui a pouco.',
    workspace: 'Ir para O meu espaço',
    checkingSession: 'A verificar a tua sessão',
    signedOut: {
      heading: 'Foste convidado para colaborar no LorEvolve.',
      intro: 'Inicia sessão ou cria uma conta para continuar.',
      footer: 'Usa o email para onde o convite foi enviado. {link}',
      explore: 'Explorar o LorEvolve',
      signIn: 'Iniciar sessão',
      createAccount: 'Criar conta',
    },
    loading: {
      heading: 'Convite',
      intro: 'A abrir o convite…',
      status: 'A abrir o convite',
    },
    ready: {
      intro: 'Foste convidado como {role}.',
      working: 'A processar',
      accept: 'Aceitar o convite',
      decline: 'Recusar',
    },
    declined: {
      heading: 'Convite recusado.',
      intro: 'Nada foi partilhado contigo, e o convite desapareceu.',
    },
    otherAccount: {
      heading: 'Este convite é para outra conta.',
      intro: 'Inicia sessão com a conta para onde foi enviado, ou fala com quem te convidou.',
    },
    expired: {
      heading: 'Este convite expirou.',
      intro: 'Pede um novo a quem te convidou.',
    },
    gone: {
      heading: 'Este convite já não está disponível.',
      intro: 'Pode ter sido retirado, ou já respondido.',
    },
    error: {
      heading: 'Não foi possível abrir este convite.',
    },
  },
}

export default auth

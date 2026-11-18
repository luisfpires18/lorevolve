import type { Dictionary } from '../../en'

const universeConnect: Dictionary['universe']['connect'] = {
  title: 'Ligar uma aplicação de IA',
  heading: 'Ligar uma aplicação de IA',
  connecting: 'A ligar…',
  approve: 'Aprovar',
  deny: 'Recusar',
  goBack: 'Voltar à aplicação',
  noAccount: 'Não tens acesso ao universo que esta aplicação pediu.',
  noAccountNote: 'Nada foi ligado. Voltar diz à aplicação que o pedido não foi aprovado.',
  introReadOnly: 'só de leitura',
  intro:
    'Esta aplicação quer acesso {readOnly} a um dos teus universos: as entradas do lore, as relações, as histórias, os manuscritos das cenas e a linha do tempo. O que ler vai para o serviço de IA por trás dela. Confirma quem está a pedir antes de aprovares.',
  introProposals:
    'Esta aplicação quer acesso {readOnly} a um dos teus universos: as entradas do lore, as relações, as histórias, os manuscritos das cenas e a linha do tempo. O que ler vai para o serviço de IA por trás dela. Confirma quem está a pedir antes de aprovares. Pede também para propor alterações que revês, o que podes permitir abaixo.',
  signedIn: 'Sessão iniciada como {name}. {link}',
  connectedApps: 'Ver aplicações ligadas',
  checking: 'A verificar este pedido…',
  invalid: 'Este pedido de ligação não é válido, por isso nada foi ligado.',
  invalidNote: 'Recomeça a partir da tua aplicação de IA.',
  checkFailed:
    'O LorEvolve não conseguiu verificar este pedido. Recarrega a página para tentar novamente.',
  appSection: 'A aplicação',
  appLabel: 'Aplicação',
  verified:
    'Os detalhes são publicados por {host}, e o LorEvolve obteve-os de lá. O nome é o que esse site indica.',
  unverified:
    'O LorEvolve não consegue confirmar quem fez esta aplicação. Registou-se sozinha e escolheu o próprio nome. Aprova apenas se acabaste de adicionar o LorEvolve a uma aplicação em que confias.',
  returnTo: 'Depois de decidires, o navegador volta a {host}.',
  loopback:
    'Esta aplicação corre no teu próprio dispositivo. Qualquer programa neste computador podia usar esse endereço, por isso aprova apenas se iniciaste isto a partir de uma aplicação neste computador.',
  universeSection: 'O universo',
  universeLabel: 'Universo',
  youAre: {
    owner:
      'O teu papel aqui é Proprietário. A aplicação recebe o teu acesso a este universo e a nenhum outro.',
    editor:
      'O teu papel aqui é Editor. A aplicação recebe o teu acesso a este universo e a nenhum outro.',
    reviewer:
      'O teu papel aqui é Revisor. A aplicação recebe o teu acesso a este universo e a nenhum outro.',
    viewer:
      'O teu papel aqui é Leitor. A aplicação recebe o teu acesso a este universo e a nenhum outro.',
  },
  canDoSection: 'O que pode fazer',
  readOnlyAccess: 'Acesso só de leitura a',
  cannotWrite: 'Não pode criar, editar nem eliminar nada.',
  notesSection: 'Antes de aprovares',
  noteService:
    'O que a aplicação lê vai para o serviço de IA por trás dela, que o trata segundo os seus próprios termos. Manuscritos longos podem ocupar muito do contexto da aplicação, por isso ela lê-os uma secção de cada vez.',
  noteStays:
    'A aplicação continua ligada até a desligares em Perfil, Aplicações ligadas, ou até deixares de ter acesso a este universo.',
  levelSection: 'Nível de acesso',
  proposeUnavailable:
    'A aplicação pediu também para propor alterações. O teu papel aqui só permite ler, por isso recebe acesso de Leitor.',
  level: 'Nível de acesso',
  levelReaderName: 'Leitor',
  levelReader: '{level}: {app} apenas lê este universo',
  levelCreatorName: 'Criador',
  levelCreator: '{level}: propõe também conteúdo novo e alterado para reveres',
  creatorCan:
    'Um Criador pode enviar entradas do lore, artigos, relações, histórias, cenas, texto, enredo, acontecimentos da linha do tempo, regras do mundo e, se fores o proprietário deste universo, as tuas ideias para as Alterações da IA pendentes no LorEvolve, em teu nome. As remoções vão apenas para a reciclagem, e um campo é sempre apenas arquivado. Nada muda até tu, ou o proprietário do universo ou um Editor, o aprovar aí. Podes voltar a torná-lo Leitor em Aplicações ligadas.',
  creatorCanSchema:
    'Um Criador pode enviar entradas do lore, artigos, relações, histórias, cenas, texto, enredo, acontecimentos da linha do tempo, regras do mundo, tipos de entrada, campos e grupos e, se fores o proprietário deste universo, as tuas ideias para as Alterações da IA pendentes no LorEvolve, em teu nome. As remoções vão apenas para a reciclagem, e um campo é sempre apenas arquivado. Nada muda até tu, ou o proprietário do universo ou um Editor, o aprovar aí. Podes voltar a torná-lo Leitor em Aplicações ligadas.',
}

export default universeConnect

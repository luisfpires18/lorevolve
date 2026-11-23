import type { Dictionary } from '../../en'

const placesFamilyPage: Dictionary['places']['familyPage'] = {
  title: 'Árvore genealógica',
  lede: 'Progenitores, avós, irmãos, tios, primos, sobrinhos, filhos e netos, deduzidos das ligações que registaste. Só conta um tipo de relação a que tenhas dado um significado familiar.',
  browse: 'Explorar famílias',
  shownFor: 'Família mostrada para',
  whose: 'De quem é a família?',
  noTypes:
    'Nenhum tipo de lore está ativado para a árvore genealógica. Podes ativar um tipo ao criá-lo, em {link}, ou ativar um grupo de tipos em Tipos na árvore genealógica, abaixo.',
  noTypesLink: 'Tipos → Tipos de lore',
  noKinds:
    'A árvore genealógica precisa de um tipo de relação familiar: “progenitor de”, “tio de”, “casado com”. Um tipo não significa nada para a árvore até lhe dares um significado familiar, seja qual for o nome. Cria um aqui, ou dá um significado a um tipo existente em {link}.',
  noKindsLink: 'Tipos → Tipos de relação',
  newKind: 'Novo tipo de relação familiar',
  loading: 'A deduzir esta família…',
  missingTitle: 'Essa entrada não está aqui.',
  missingHint:
    'Pode ter sido movida para a reciclagem, eliminada, ou pertencer a outro universo. {link}',
  missingLink: 'Voltar ao lore',
  error: 'Não foi possível ler esta árvore genealógica.',
  retry: 'Tentar novamente',
  typeNotEnabled:
    'O tipo desta entrada, {type}, não está atualmente ativado para a árvore genealógica. A família registada continua a ser mostrada aqui.',
  loopTitle: 'Estas ligações andam em círculo',
  loopBody:
    'Ninguém aqui pode ser colocado acima dos outros, por isso a árvore abaixo mostra-os onde pode. Nada foi alterado: abre as entradas e corrige ou remove uma das ligações.',
  note: 'Os familiares são deduzidos das próprias ligações de progenitor, sempre que esta página é aberta. Nada nela é guardado como ligação própria, e ser irmão ou irmã aqui significa apenas partilhar um progenitor que alguém registou, e nada mais. A outra família que registaste, como um cônjuge ou um tutor, aparece nos detalhes de cada pessoa e é mostrada enquanto apontas ou focas essa pessoa; um cônjuge fica ao lado. Não coloca ninguém numa geração.',
  othersHeading: 'Outras relações',
  othersNote: 'Relações de {name} que não são familiares. Não fazem parte da árvore acima. {link}',
  othersLink: 'Todas as relações',
  relationshipStatus: 'Relação: {status}',
  add: 'Adicionar ligação familiar',
}

export default placesFamilyPage

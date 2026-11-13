import type { Dictionary } from '../en'

/** Papéis num universo: o nome de cada um e a sua linha, partilhados pelos convites e pelo painel de colaboradores (#101). */
const roles: Dictionary['roles'] = {
  owner: {
    label: 'Proprietário',
    description: 'É dono deste universo.',
  },
  editor: {
    label: 'Editor',
    description:
      'Pode criar e editar conteúdo, usar a Reciclagem e restaurar itens. Não pode eliminar definitivamente, publicar nem gerir o universo.',
  },
  reviewer: {
    label: 'Revisor',
    description: 'Pode ler, comentar e sugerir alterações. Não pode editar conteúdo diretamente.',
  },
  viewer: {
    label: 'Leitor',
    description: 'Pode ler o universo partilhado.',
  },
}

export default roles

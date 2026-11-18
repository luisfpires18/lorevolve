import type { Dictionary } from '../../en'

const projectsScript: Dictionary['projects']['script'] = {
  heading: 'Guião',
  outline: 'Partes deste projeto',
  parts: 'Partes',
  closeParts: 'Fechar partes',
  choose: 'Escolha uma parte',
  position: '{level} {number} de {total}',
  empty: 'Ainda não há onde escrever.',
  emptyHint: 'Acrescente primeiro partes em {link} e depois escreva cada uma aqui.',
  structureLink: 'Estrutura',
  noFormat: 'Este projeto ainda não tem formato.',
  noFormatHint: 'Escolha um formato e depois construa as suas partes em {link}.',
  writeLabel: 'Texto de {name}',
  readLabel: 'Texto de {name}',
  placeholder: 'Escreva esta parte. Escreva @ para mencionar Lore.',
  nothingYet: 'Ainda não há nada escrito aqui.',
  hasText: 'Tem texto',
  save: 'Guardar alterações',
  saved: 'Guardado',
  nothingSaved: 'Ainda não foi guardado',
  unsaved: '{name} tem alterações por guardar.',
  reload: 'Recarregar',
  retry: 'Tentar de novo',
  tooLong: 'Demasiado longo para guardar: {used} de {max} caracteres.',
}

export default projectsScript

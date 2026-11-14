import type { Dictionary } from '../en'

/**
 * O que uma recusa da API diz, pelo `code` que traz (#108). Um code que falte aqui usa o `detail` em inglês do
 * servidor, por isso uma recusa nunca desaparece. As chaves são os codes tal como a API os envia, e cada frase
 * traduz exatamente a frase inglesa que o servidor já enviava: nada foi reescrito, só traduzido.
 */
const apiErrors: Dictionary['apiErrors'] = {
  // ---------- Escrito por cima de algo que mudou (ADR 0043) ----------
  entity_changed: 'Esta entrada foi alterada depois de ser aberta aqui. Nada foi substituído.',
  entity_article_changed:
    'O artigo desta entrada foi guardado noutro lado depois de ser aberto aqui. Nada foi substituído.',
  entity_private_note_changed:
    'Esta nota foi guardada noutro lado desde que a abriste. Lê a versão mais recente antes de escreveres por cima.',
  entity_progression_changed:
    'As eras desta entrada foram alteradas noutro lado depois de serem abertas aqui. Nada foi substituído.',
  entity_field_changed: 'Este campo foi alterado depois de ser aberto aqui. Nada foi guardado.',
  entity_field_layout_changed:
    'As secções deste tipo foram alteradas depois de serem abertas aqui. Nada foi guardado.',
  entity_type_parent_changed:
    'Já não está onde esta lista o mostrava. Recarrega os tipos e tenta de novo.',
  story_changed: 'Esta história foi alterada depois de ser aberta aqui. Nada foi substituído.',
  story_chapter_order_changed:
    'Os capítulos desta história mudaram enquanto isto era guardado. Recarrega a história e tenta de novo.',
  story_plot_order_changed:
    'Os arcos desta história mudaram enquanto isto era guardado. Recarrega a história e tenta de novo.',
  story_scene_order_changed:
    'As cenas desta história mudaram enquanto isto era guardado. Recarrega a história e tenta de novo.',
  scene_changed: 'Esta cena foi alterada depois de ser aberta aqui. Nada foi substituído.',
  scene_manuscript_changed:
    'O manuscrito desta cena foi guardado noutro lado depois de ser aberto aqui. Nada foi substituído.',
  idea_changed:
    'Esta ideia foi guardada noutro lado depois de ser aberta aqui. Nada foi substituído.',
  idea_board_changed:
    'Este painel foi guardado noutro lado depois de ser aberto aqui. Nada foi substituído.',
  map_changed:
    'Este mapa foi alterado noutro lado. Abre-o de novo para veres a versão mais recente.',
  world_rule_changed:
    'Esta regra foi guardada noutro lado depois de ser aberta aqui. Nada foi substituído.',
  chronology_calendar_changed:
    'Algo mudou neste calendário ou nas suas datas enquanto isto era guardado. Recarrega a cronologia e tenta de novo.',
  trash_selection_changed:
    'A Reciclagem mudou antes de estes itens poderem ser eliminados. Atualiza e seleciona-os de novo.',
  suggestion_target_changed:
    'Alguém guardou isto depois de a sugestão ser feita, por isso não pode ser aceite. Nada foi alterado.',

  // ---------- Quem pode fazer o quê ----------
  universe_permission_denied: 'O teu papel neste universo não permite isto.',
  admin_target:
    'Só contas Membro podem ser bloqueadas, para que nenhum Admin se tranque fora nem tranque o último Admin.',
  account_blocked: 'Esta conta foi bloqueada por um administrador do LorEvolve.',
  sign_in_failed:
    'Essa combinação de nome de utilizador ou email e palavra-passe não está correta, ou houve demasiadas tentativas. Tenta de novo dentro de alguns minutos, ou repõe a tua palavra-passe.',
  registration_invite_only:
    'O LorEvolve é por convite para já. Abre o link do convite que recebeste para criares a tua conta.',
  cross_origin_write: 'Esta alteração tem de ser feita a partir do próprio LorEvolve.',

  // ---------- Na Reciclagem ----------
  entity_in_trash: 'Restaura a entrada da Reciclagem para mudares as suas imagens.',
  relationship_end_in_trash:
    'Uma das entradas que esta relação liga está na Reciclagem. Restaura essa entrada primeiro.',

  // ---------- Imagens ----------
  image_storage_unavailable: 'O armazenamento de imagens não está disponível.',
  artwork_changed:
    'A arte deste universo foi substituída noutro lado. Abre de novo para escolheres o enquadramento.',
  artwork_original_unavailable:
    'O cartão não pode ser cortado de novo. Carrega a imagem outra vez para a substituir.',
  map_image_changed:
    'A sua imagem foi substituída noutro lado, por isso esta não foi guardada. Abre o mapa de novo e escolhe a imagem.',

  // ---------- Convites e colaboradores ----------
  invitation_pending: 'Este endereço já tem um convite pendente para este universo.',
  invitation_not_found: 'Este convite já não está disponível.',
  invitation_expired: 'Este convite expirou.',
  invitation_other_account: 'Este convite é para outra conta.',
  invitation_own_universe: 'Este universo já é teu.',

  // ---------- Comentários e sugestões ----------
  comment_thread_resolved:
    'Esta conversa está resolvida. O proprietário ou um Editor pode reabri-la.',
  suggestion_resolved: 'Alguém já aceitou ou rejeitou esta sugestão.',
  suggestion_unchanged: 'Esta sugestão ainda não altera nada. Altera algo primeiro.',

  // ---------- Universos e publicação ----------
  universe_not_archived: 'Arquiva o universo antes de o eliminares.',
  artwork_required_while_public:
    'Substitui a arte, ou torna o universo privado antes de a remover.',
  publication_required_while_public:
    'Um universo público precisa disto. Preenche-o, ou despublica o universo primeiro.',

  // ---------- O assistente ----------
  assistant_unavailable: 'O assistente ainda não está configurado neste LorEvolve.',
  assistant_busy: 'O assistente está ocupado neste momento. Tenta de novo dentro de um minuto.',
  assistant_timeout:
    'Isso demorou demasiado a responder. Tenta de novo, ou pergunta algo mais específico.',
  assistant_failed: 'O assistente não conseguiu responder a isso. Tenta de novo.',

  // ---------- Cópias de segurança e restauros ----------
  backup_restore_busy:
    'Estão demasiadas cópias de segurança à espera de serem restauradas ao mesmo tempo. Tenta de novo dentro de alguns minutos.',
  backup_restore_in_progress: 'Espera que o restauro em curso termine.',
  backup_restore_expired:
    'Expirou, já foi restaurada, ou foi substituída por outro ficheiro. Escolhe o ficheiro da cópia de segurança de novo.',
  backup_restore_failed:
    'Algo falhou enquanto o universo estava a ser criado, por isso nada foi guardado. A cópia de segurança continua à espera: tenta de novo.',

  // ---------- Relações ----------
  relationship_already_exists:
    'Esta relação já existe. Edita a que já lá está, ou escolhe uma ligação diferente.',
  relationship_period_era_moved:
    'Esta relação vigora durante uma era de uma entrada que já não ligaria. Altera esse período primeiro, e depois move a relação.',

  // ---------- Versões que não podem voltar ----------
  entity_progression_revision_unrestorable:
    'Esta versão nomeia algo que já não está como estava: um campo arquivado ou removido desde então, uma opção retirada de um campo, ou uma história, cena ou entrada eliminada ou movida para a Reciclagem. Nada foi alterado.',

  // ---------- Tudo o resto ----------
  feedback_too_many_reports: 'Isso é muito relato numa hora. Tenta de novo mais tarde.',
  unexpected_failure:
    'O LorEvolve não conseguiu concluir isso. Tenta de novo dentro de um momento.',
}

export default apiErrors

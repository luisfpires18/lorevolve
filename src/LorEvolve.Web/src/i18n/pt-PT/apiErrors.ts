import type { Dictionary } from '../en'

/**
 * O que uma recusa da API diz, pelo `code` que traz (#108). Um code que falte aqui usa o `detail` em inglês do
 * servidor, por isso uma recusa nunca desaparece. As chaves são os codes tal como a API os envia.
 */
const apiErrors: Dictionary['apiErrors'] = {
  // ---------- Escrito por cima de algo que mudou (ADR 0043) ----------
  entity_changed: 'Esta entrada mudou depois de a abrires. Nada foi substituído.',
  entity_article_changed:
    'O artigo desta entrada foi guardado noutro lado depois de o abrires. Nada foi substituído.',
  entity_private_note_changed:
    'Esta nota foi guardada noutro lado desde que a abriste. Lê a versão mais recente antes de escreveres por cima.',
  entity_progression_changed:
    'As eras desta entrada foram alteradas noutro lado depois de as abrires. Nada foi substituído.',
  entity_field_changed: 'Este campo mudou depois de o abrires. Nada foi guardado.',
  entity_field_layout_changed:
    'As secções deste tipo mudaram depois de as abrires. Nada foi guardado.',
  entity_type_parent_changed:
    'Este tipo já não está onde esta lista o mostrava. Recarrega os tipos e tenta de novo.',
  story_changed: 'Esta história mudou depois de a abrires. Nada foi substituído.',
  story_chapter_order_changed:
    'Os capítulos desta história mudaram enquanto isto era guardado. Recarrega a história e tenta de novo.',
  story_plot_order_changed:
    'Os arcos desta história mudaram enquanto isto era guardado. Recarrega a história e tenta de novo.',
  story_scene_order_changed:
    'As cenas desta história mudaram enquanto isto era guardado. Recarrega a história e tenta de novo.',
  scene_changed: 'Esta cena mudou depois de a abrires. Nada foi substituído.',
  scene_manuscript_changed:
    'O manuscrito desta cena foi guardado noutro lado depois de o abrires. Nada foi substituído.',
  idea_changed: 'Esta ideia foi guardada noutro lado depois de a abrires. Nada foi substituído.',
  idea_board_changed:
    'Este painel foi guardado noutro lado depois de o abrires. Nada foi substituído.',
  map_changed: 'Este mapa mudou noutro lado. Abre-o de novo para veres a versão mais recente.',
  world_rule_changed:
    'Esta regra foi guardada noutro lado depois de a abrires. Nada foi substituído.',
  chronology_calendar_changed:
    'Algo mudou neste calendário ou nas suas datas enquanto isto era guardado. Recarrega a cronologia e tenta de novo.',
  admin_state_changed: 'Esta conta mudou enquanto isto era guardado. Recarrega e tenta de novo.',
  trash_selection_changed:
    'A Reciclagem mudou antes de estes itens poderem ser eliminados. Atualiza e seleciona-os de novo.',
  suggestion_target_changed:
    'Alguém guardou isto depois de a sugestão ser feita, por isso não pode ser aceite. Nada foi alterado.',

  // ---------- Quem pode fazer o quê ----------
  universe_permission_denied: 'O teu papel neste universo não permite isto.',
  admin_target: 'Isso não pode ser feito a esta conta.',
  account_blocked: 'Esta conta foi bloqueada por um administrador do LorEvolve.',
  sign_in_failed: 'Esse nome de utilizador ou palavra-passe não está correto.',
  registration_invite_only:
    'O LorEvolve é por convite para já. Abre o link do convite que recebeste para criares a tua conta.',
  cross_origin_write: 'Esta alteração tem de ser feita a partir do próprio LorEvolve.',

  // ---------- Na Reciclagem ----------
  entity_in_trash: 'Restaura a entrada da Reciclagem para mudares as suas imagens.',
  relationship_end_in_trash:
    'Uma das entradas que esta relação liga está na Reciclagem. Restaura essa entrada primeiro.',

  // ---------- Imagens e espaço ----------
  image_storage_unavailable:
    'O armazenamento de imagens não está disponível neste momento. Tenta de novo dentro de um momento.',
  image_changed:
    'Esta imagem foi substituída ou removida noutro lado, por isso esta não foi guardada. Abre de novo e escolhe a imagem.',
  image_original_unavailable:
    'Não foi possível ler a imagem guardada. Carrega-a de novo para a substituir.',
  artwork_changed:
    'A arte deste universo foi substituída noutro lado. Abre de novo para escolheres o enquadramento.',
  artwork_original_unavailable:
    'Não foi possível ler a arte guardada. Carrega-a de novo para a substituir.',
  map_image_changed:
    'A imagem do mapa foi substituída noutro lado, por isso esta não foi guardada. Abre o mapa de novo e escolhe a imagem.',

  // ---------- Email ----------
  email_not_configured:
    'Este LorEvolve ainda não consegue enviar email. Cria o link e envia-o tu mesmo.',
  email_failed:
    'O serviço de email não o aceitou. Tenta de novo, ou cria o link e envia-o tu mesmo.',

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
  publication_incomplete: 'Isto ainda não está pronto para ser publicado.',
  publication_required_while_public:
    'Um universo público precisa disto. Preenche-o, ou despublica o universo primeiro.',
  artwork_required_while_public:
    'Um universo público precisa da sua arte. Carrega uma, ou despublica o universo primeiro.',

  // ---------- O assistente ----------
  assistant_unavailable: 'O assistente ainda não está configurado neste LorEvolve.',
  assistant_busy: 'O assistente está ocupado neste momento. Tenta de novo dentro de um minuto.',
  assistant_timeout:
    'Isso demorou demasiado a responder. Tenta de novo, ou pergunta algo mais específico.',
  assistant_failed: 'O assistente não conseguiu responder a isso. Tenta de novo.',
  assistant_rate_limited:
    'Já perguntaste tudo o que esta hora permite. Espera um pouco e tenta de novo.',

  // ---------- Cópias de segurança e restauros ----------
  backup_restore_busy:
    'Estão demasiadas cópias de segurança à espera de serem restauradas ao mesmo tempo. Tenta de novo dentro de alguns minutos.',
  backup_restore_in_progress:
    'Esta cópia de segurança já está a ser restaurada. Espera que essa termine.',
  backup_restore_expired:
    'Essa cópia de segurança já não está à espera de ser restaurada. Escolhe o ficheiro de novo.',
  backup_restore_failed:
    'Não foi possível restaurar a cópia de segurança, por isso nada foi guardado. Continua à espera: tenta de novo.',
  database_backup_running:
    'Já está a correr uma cópia de segurança da base de dados. Espera que termine.',

  // ---------- Canon, regras e relações ----------
  relationship_already_exists: 'Esta relação já existe. Edita a que já lá está.',
  relationship_period_era_moved:
    'Esta relação vigora durante uma era de uma entrada que já não ligaria. Altera esse período primeiro.',

  // ---------- Tipos e campos, quando a recusa não nomeia nada teu ----------
  entity_progression_revision_unrestorable:
    'Esta versão nomeia algo que já não está como estava, por isso não pode voltar como estava.',

  // ---------- Tudo o resto ----------
  feedback_too_many_reports: 'Isso é muito relato numa hora. Tenta de novo mais tarde.',
  unexpected_failure:
    'O LorEvolve não conseguiu concluir isso. Tenta de novo dentro de um momento.',
}

export default apiErrors

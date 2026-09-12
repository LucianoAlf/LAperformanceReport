// =============================================================================
// TIPOS DA CAIXA DE ENTRADA ADMINISTRATIVA
// =============================================================================

// Aluno simplificado para a inbox
export interface AlunoInbox {
  id: number;
  nome: string;
  responsavel_nome: string | null;
  telefone: string | null;
  whatsapp: string | null;
  email: string | null;
  curso_id: number | null;
  professor_atual_id: number | null;
  unidade_id: string;
  status: string;
  classificacao: string | null;
  status_pagamento: string | null;
  cursos?: { nome: string } | null;
  professores?: { nome: string } | null;
  unidades?: { nome: string; codigo: string } | null;
}

// Conversa administrativa (1 por aluno/contato por unidade)
export interface AdminConversa {
  id: string;
  aluno_id: number | null;
  unidade_id: string;
  caixa_id: number | null;
  whatsapp_jid: string | null;
  telefone_externo: string | null;
  nome_externo: string | null;
  foto_perfil_url: string | null;
  nao_lidas: number;
  ultima_mensagem_at: string | null;
  ultima_mensagem_preview: string | null;
  status: 'aberta' | 'encerrada';
  created_at: string;
  updated_at: string;
  // Joins
  aluno?: AlunoInbox | null;
  caixa?: { id: number; nome: string; numero: string | null } | null;
}

// Mensagem administrativa
export type TipoMensagemAdmin = 'texto' | 'imagem' | 'audio' | 'video' | 'documento' | 'sticker' | 'sistema' | 'interativo' | 'contato' | 'localizacao' | 'carrossel';
export type DirecaoMensagem = 'entrada' | 'saida';
export type RemetenteAdmin = 'aluno' | 'admin' | 'sistema' | 'externo';
export type StatusEntrega = 'enviando' | 'enviada' | 'entregue' | 'lida' | 'erro';

export interface AdminMensagem {
  id: string;
  conversa_id: string;
  /**
   * Dono da MENSAGEM, que pode diferir do dono da conversa: um responsável com dois filhos
   * recebe as pesquisas dos dois no mesmo número, e a conversa é uma só (índice
   * `uq_admin_conversas_jid_depto`). É o que permite dizer sobre qual aluno a mensagem fala.
   */
  aluno_id: number | null;
  /** Nome do aluno da mensagem (join `aluno:aluno_id(nome)`), só para exibição. */
  aluno?: { nome: string } | null;
  direcao: DirecaoMensagem;
  tipo: TipoMensagemAdmin;
  conteudo: string | null;
  midia_url: string | null;
  midia_mimetype: string | null;
  midia_nome: string | null;
  remetente: RemetenteAdmin;
  remetente_nome: string | null;
  status_entrega: StatusEntrega;
  erro_motivo?: string;
  whatsapp_message_id: string | null;
  reacoes?: { emoji: string; de: string; timestamp?: number }[];
  deletada?: boolean;
  editada?: boolean;
  created_at: string;
}

// Filtros do inbox admin
export type FiltroAdminInbox = 'todas' | 'nao_lidas';

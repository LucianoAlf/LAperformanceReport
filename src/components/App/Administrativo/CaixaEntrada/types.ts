// =============================================================================
// TIPOS DA CAIXA DE ENTRADA ADMINISTRATIVA
// =============================================================================

// Aluno simplificado para a inbox
export interface AlunoInbox {
  id: number;
  nome: string;
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
export type TipoMensagemAdmin = 'texto' | 'imagem' | 'audio' | 'video' | 'documento' | 'sticker' | 'sistema';
export type DirecaoMensagem = 'entrada' | 'saida';
export type RemetenteAdmin = 'aluno' | 'admin' | 'sistema' | 'externo';
export type StatusEntrega = 'enviando' | 'enviada' | 'entregue' | 'lida' | 'erro';

export interface AdminMensagem {
  id: string;
  conversa_id: string;
  aluno_id: number | null;
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
  created_at: string;
}

// Filtros do inbox admin
export type FiltroAdminInbox = 'todas' | 'nao_lidas';

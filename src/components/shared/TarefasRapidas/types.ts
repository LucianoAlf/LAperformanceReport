// =============================================================================
// TIPOS COMPARTILHADOS — TAREFAS RÁPIDAS (multi-página)
// =============================================================================

export type TarefaContexto = 'farmer' | 'comercial' | 'pre_atendimento';

export interface TarefaRapida {
  id: string;
  colaborador_id: number;
  unidade_id: string;
  contexto: TarefaContexto;
  descricao: string;
  data_prazo?: string;
  prioridade: 'alta' | 'media' | 'baixa';
  observacoes?: string;
  concluida: boolean;
  concluida_em?: string;
  created_at: string;
  // Joins
  colaboradores?: { nome: string; apelido: string | null };
}

export interface CreateTarefaRapidaInput {
  descricao: string;
  data_prazo?: string;
  prioridade?: 'alta' | 'media' | 'baixa';
  observacoes?: string;
}

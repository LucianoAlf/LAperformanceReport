// ============================================
// TIPOS DO PAINEL FARMER
// ============================================

export interface FarmerRotina {
  id: string;
  colaborador_id: number;
  unidade_id: string;
  descricao: string;
  frequencia: 'diario' | 'semanal' | 'mensal';
  dias_semana?: number[];
  dia_mes?: number;
  prioridade: 'normal' | 'alta';
  lembrete_whatsapp: boolean;
  ativo: boolean;
  created_at: string;
  // Joins
  colaboradores?: { nome: string; apelido: string | null };
}

export interface FarmerRotinaDoDia {
  rotina_id: string;
  descricao: string;
  frequencia: 'diario' | 'semanal' | 'mensal';
  prioridade: 'normal' | 'alta';
  concluida: boolean;
  execucao_id?: string;
  responsavel_nome?: string;
  responsavel_apelido?: string;
}

export interface FarmerTarefa {
  id: string;
  colaborador_id: number;
  unidade_id: string;
  descricao: string;
  data_prazo?: string;
  prioridade: 'alta' | 'media' | 'baixa';
  aluno_id?: number;
  aluno_nome?: string;
  observacoes?: string;
  concluida: boolean;
  concluida_em?: string;
  created_at: string;
  // Joins
  alunos?: { nome: string };
  colaboradores?: { nome: string; apelido: string | null };
}

export interface FarmerRecado {
  id: string;
  colaborador_id: number;
  unidade_id: string;
  professor_id: number;
  professor_nome?: string;
  aluno_id?: number;
  aluno_nome?: string;
  assunto?: string;
  mensagem: string;
  status: 'enviado' | 'entregue' | 'lido' | 'erro';
  enviado_em: string;
  entregue_em?: string;
  lido_em?: string;
  // Joins
  professores?: { nome: string };
  alunos?: { nome: string };
}

export interface FarmerTemplate {
  id: string;
  unidade_id?: string;
  categoria: 'aniversario' | 'boas_vindas' | 'renovacao' | 'cobranca' | 'experimental';
  nome: string;
  mensagem: string;
  variaveis?: string[];
  ativo: boolean;
  ordem: number;
}

export interface ProgressoRotinas {
  total: number;
  concluidas: number;
  percentual: number;
}

export interface HistoricoRotinas {
  data: string;
  total_rotinas: number;
  rotinas_concluidas: number;
  percentual: number;
  tarefas_concluidas: number;
}

// Alertas
export interface AlertaAniversariante {
  aluno_id: number;
  aluno_nome: string;
  whatsapp: string | null;
  data_nascimento: string;
  unidade_id: string;
  idade: number;
  professor_id: number | null;
  professor_nome: string | null;
  instrumento: string | null;
}

export interface AlertaInadimplente {
  aluno_id: number;
  aluno_nome: string;
  whatsapp: string | null;
  unidade_id: string;
  valor_parcela: number;
  status_pagamento: string;
  dia_vencimento: number | null;
  professor_id: number | null;
  professor_nome: string | null;
  instrumento: string | null;
  dias_atraso: number;
}

export interface AlertaNovoMatriculado {
  aluno_id: number;
  aluno_nome: string;
  whatsapp: string | null;
  unidade_id: string;
  data_matricula: string;
  valor_parcela: number;
  professor_id: number | null;
  professor_nome: string | null;
  instrumento: string | null;
  dia_aula: string | null;
  horario_aula: string | null;
}

export interface AlertaRenovacao {
  aluno_id: number;
  aluno_nome: string;
  whatsapp: string | null;
  unidade_id: string;
  data_vencimento: string;
  dias_para_vencer: number;
  valor_parcela: number;
  professor_id: number | null;
  professor_nome: string | null;
  instrumento: string | null;
  urgencia: 'vencido' | 'urgente' | 'atencao' | 'normal';
}

export interface ResumoAlertas {
  unidade_id: string;
  unidade_nome: string;
  aniversariantes_hoje: number;
  inadimplentes: number;
  novos_matriculados: number;
  renovacoes_vencidas: number;
  renovacoes_urgentes: number;
  renovacoes_atencao: number;
}

// Input types para criação/edição
export interface CreateRotinaInput {
  descricao: string;
  frequencia: 'diario' | 'semanal' | 'mensal';
  dias_semana?: number[];
  dia_mes?: number;
  prioridade?: 'normal' | 'alta';
  lembrete_whatsapp?: boolean;
}

export interface CreateTarefaInput {
  descricao: string;
  data_prazo?: string;
  prioridade?: 'alta' | 'media' | 'baixa';
  aluno_id?: number;
  observacoes?: string;
}

export interface CreateRecadoInput {
  professor_id: number;
  aluno_id?: number;
  assunto?: string;
  mensagem: string;
}

// Colaborador atual
export interface Colaborador {
  id: number;
  nome: string;
  apelido: string | null;
  tipo: 'farmer' | 'hunter' | 'gerente' | 'admin';
  unidade_id: string | null;
  whatsapp: string | null;
  email: string | null;
  usuario_id: string | null;
  ativo: boolean;
}

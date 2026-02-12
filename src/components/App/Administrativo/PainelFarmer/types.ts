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
  checklists_concluidos: number;
}

// ============================================
// TIPOS DE CHECKLISTS
// ============================================

export interface FarmerChecklist {
  id: string;
  titulo: string;
  descricao: string | null;
  tipo: 'manual' | 'template' | 'recorrente';
  periodicidade: 'pontual' | 'diario' | 'semanal' | 'mensal';
  departamento: 'administrativo' | 'comercial' | 'pedagogico' | 'geral';
  tipo_vinculo: 'nenhum' | 'todos_alunos' | 'por_curso' | 'por_professor' | 'manual';
  filtro_vinculo: Record<string, unknown> | null;
  data_inicio: string | null;
  data_prazo: string | null;
  prioridade: 'alta' | 'media' | 'baixa';
  status: 'ativo' | 'concluido' | 'arquivado';
  lembrete_whatsapp: boolean;
  alerta_dias_antes: number;
  alerta_hora: string | null;
  total_items: number;
  items_concluidos: number;
  percentual_progresso: number;
  total_contatos: number;
  contatos_responderam: number;
  taxa_sucesso: number;
  canais_resumo: Array<{ canal: string; total: number; responderam: number; pct: number }>;
  created_at: string;
  colaborador_nome: string;
  colaborador_apelido: string | null;
  responsavel_id: number | null;
  responsavel_nome: string | null;
  responsavel_apelido: string | null;
}

export interface FarmerChecklistItem {
  id: string;
  checklist_id: string;
  descricao: string;
  ordem: number;
  canal: string | null;
  info: string | null;
  parent_id: string | null;
  concluida: boolean;
  concluida_em: string | null;
  concluida_por: number | null;
  created_at: string;
  responsavel_id: number | null;
  responsavel_nome: string | null;
  responsavel_apelido: string | null;
  // Sub-itens carregados no frontend
  sub_items?: FarmerChecklistItem[];
}

export interface FarmerChecklistContato {
  id: string;
  checklist_id: string;
  aluno_id: number;
  farmer_id: number;
  status: 'pendente' | 'respondeu' | 'visualizou' | 'sem_resposta' | 'nao_recebeu';
  canal_contato: string | null;
  observacoes: string | null;
  contatado_em: string | null;
  created_at: string;
  // Joins
  alunos?: {
    nome: string;
    whatsapp?: string | null;
    health_score?: string | null;
    cursos?: { nome: string } | null;
    professores?: { nome: string } | null;
  };
  colaboradores?: { nome: string; apelido: string | null };
}

export interface FarmerChecklistTemplate {
  id: string;
  nome: string;
  descricao: string | null;
  categoria: 'onboarding' | 'recesso' | 'evento' | 'comunicacao' | 'administrativo';
  itens: ChecklistTemplateItem[];
  unidade_id: string | null;
  ativo: boolean;
  ordem: number;
}

export interface ChecklistTemplateItem {
  descricao: string;
  canal: string | null;
  ordem: number;
  subs: { descricao: string; canal: string | null; ordem: number }[];
}

export interface ChecklistAlerta {
  checklist_id: string;
  titulo: string;
  descricao: string | null;
  data_prazo: string;
  prioridade: string;
  alerta_dias_antes: number;
  lembrete_whatsapp: boolean;
  colaborador_id: number;
  unidade_id: string;
  colaborador_nome: string;
  colaborador_apelido: string | null;
  total_items: number;
  items_concluidos: number;
  percentual_progresso: number;
  dias_restantes: number;
  urgencia: 'vencido' | 'urgente' | 'atencao' | 'normal';
}

export interface CreateChecklistInput {
  titulo: string;
  descricao?: string;
  tipo?: 'manual' | 'template' | 'recorrente';
  template_id?: string;
  periodicidade?: 'pontual' | 'diario' | 'semanal' | 'mensal';
  departamento?: 'administrativo' | 'comercial' | 'pedagogico' | 'geral';
  tipo_vinculo?: 'nenhum' | 'todos_alunos' | 'por_curso' | 'por_professor' | 'manual';
  filtro_vinculo?: Record<string, unknown>;
  data_inicio?: string;
  data_prazo?: string;
  prioridade?: 'alta' | 'media' | 'baixa';
  alerta_dias_antes?: number;
  alerta_hora?: string;
  lembrete_whatsapp?: boolean;
  responsavel_id?: number;
}

// Item do Task Builder (usado no modal de criação)
export interface TaskBuilderItem {
  id: string;
  descricao: string;
  canal: string | null;
  subtarefas: { id: string; descricao: string; canal: string | null }[];
}

export interface CreateChecklistItemInput {
  descricao: string;
  ordem?: number;
  canal?: string;
  info?: string;
  parent_id?: string;
  responsavel_id?: number;
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

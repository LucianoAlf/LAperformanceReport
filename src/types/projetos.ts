// Tipos para Gestão de Projetos Pedagógicos

export type ProjetoStatus = 'planejamento' | 'em_andamento' | 'em_revisao' | 'concluido' | 'cancelado' | 'pausado';
export type ProjetoPrioridade = 'baixa' | 'normal' | 'alta' | 'urgente';
export type TarefaStatus = 'pendente' | 'em_andamento' | 'concluida' | 'cancelada';
export type PessoaTipo = 'usuario' | 'professor';

export interface ProjetoTipo {
  id: number;
  nome: string;
  descricao: string | null;
  icone: string;
  cor: string;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export interface Projeto {
  id: number;
  tipo_id: number;
  nome: string; // Campo real do banco (não "titulo")
  descricao: string | null;
  responsavel_tipo: PessoaTipo | null;
  responsavel_id: number | null;
  unidade_id: string | null;
  data_inicio: string;
  data_fim: string; // Campo real do banco (não "data_fim_prevista")
  status: ProjetoStatus;
  prioridade: ProjetoPrioridade;
  orcamento: number | null;
  arquivado: boolean;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  // Relacionamentos
  tipo?: ProjetoTipo;
  unidade?: { id: string; nome: string };
  fases?: ProjetoFase[];
  equipe?: ProjetoEquipeMembro[];
  // Calculados
  progresso?: number;
  total_tarefas?: number;
  tarefas_concluidas?: number;
}

export interface ProjetoFase {
  id: number;
  projeto_id: number;
  nome: string;
  ordem: number;
  data_inicio: string | null; // Campo real do banco
  data_fim: string | null; // Campo real do banco
  status: TarefaStatus;
  created_at: string;
  updated_at: string;
  // Relacionamentos
  tarefas?: ProjetoTarefa[];
  // Calculados
  progresso?: number;
  total_tarefas?: number;
  tarefas_concluidas?: number;
}

export interface ProjetoTarefa {
  id: number;
  projeto_id: number; // Campo real do banco
  fase_id: number | null; // Pode ser null
  tarefa_pai_id: number | null;
  titulo: string;
  descricao: string | null;
  responsavel_tipo: PessoaTipo | null;
  responsavel_id: number | null;
  prazo: string | null; // Campo real do banco (não "data_fim_prevista")
  status: TarefaStatus;
  prioridade: ProjetoPrioridade;
  dependencia_id: number | null;
  ordem: number;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null; // Campo real do banco
  // Relacionamentos
  responsavel?: { nome: string; tipo: PessoaTipo };
  subtarefas?: ProjetoTarefa[];
}

export interface ProjetoEquipeMembro {
  id: number;
  projeto_id: number;
  pessoa_tipo: PessoaTipo;
  pessoa_id: number;
  papel: string | null; // Campo real do banco (não "funcao")
  created_at: string;
  // Dados da pessoa
  pessoa?: {
    id: number;
    nome: string;
    email?: string;
    cargo?: string;
  };
}

export interface ProjetoTipoFaseTemplate {
  id: number;
  tipo_id: number;
  nome: string;
  ordem: number;
  duracao_sugerida_dias: number | null; // Campo real do banco
  descricao: string | null;
  created_at: string;
}

export interface ProjetoTipoTarefaTemplate {
  id: number;
  fase_template_id: number;
  titulo: string;
  descricao: string | null;
  ordem: number;
  created_at: string;
}

// Tipos para formulários
export interface NovoProjetoForm {
  tipo_id: number;
  nome: string; // Campo real do banco
  descricao?: string;
  data_inicio: string;
  data_fim: string; // Campo real do banco
  unidade_id?: string;
  prioridade: ProjetoPrioridade;
  orcamento?: number;
  equipe_ids?: { tipo: PessoaTipo; id: number }[];
}

export interface NovaTarefaForm {
  projeto_id: number; // Campo real do banco
  fase_id?: number; // Opcional
  titulo: string;
  descricao?: string;
  prioridade: ProjetoPrioridade;
  prazo?: string; // Campo real do banco
  responsavel_tipo?: PessoaTipo;
  responsavel_id?: number;
}

// Tipos para estatísticas do Dashboard
export interface ProjetosStats {
  total_ativos: number;
  total_atrasados: number;
  total_tarefas_pendentes: number;
  taxa_conclusao: number;
  por_status: {
    planejamento: number;
    em_andamento: number;
    em_revisao: number;
    concluido: number;
  };
}

export interface ProximoPrazo {
  id: number;
  tipo: 'projeto' | 'tarefa';
  titulo: string;
  projeto_titulo?: string;
  data_prazo: string;
  responsavel_nome?: string;
  responsavel_iniciais?: string;
  urgencia: 'normal' | 'alerta' | 'urgente';
}

export interface Alerta {
  id: string;
  tipo: 'danger' | 'warning' | 'info';
  titulo: string;
  descricao: string;
  tempo: string;
  projeto_id?: number;
}

// Cores dos status
export const STATUS_COLORS: Record<ProjetoStatus, { bg: string; text: string; dot: string }> = {
  planejamento: { bg: 'bg-violet-500/20', text: 'text-violet-400', dot: 'bg-violet-500' },
  em_andamento: { bg: 'bg-blue-500/20', text: 'text-blue-400', dot: 'bg-blue-500' },
  em_revisao: { bg: 'bg-amber-500/20', text: 'text-amber-400', dot: 'bg-amber-500' },
  concluido: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', dot: 'bg-emerald-500' },
  cancelado: { bg: 'bg-slate-500/20', text: 'text-slate-400', dot: 'bg-slate-500' },
  pausado: { bg: 'bg-orange-500/20', text: 'text-orange-400', dot: 'bg-orange-500' },
};

export const STATUS_LABELS: Record<ProjetoStatus, string> = {
  planejamento: 'Planejamento',
  em_andamento: 'Em Andamento',
  em_revisao: 'Em Revisão',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
  pausado: 'Pausado',
};

export const PRIORIDADE_COLORS: Record<ProjetoPrioridade, { bg: string; text: string }> = {
  baixa: { bg: 'bg-slate-500/20', text: 'text-slate-400' },
  normal: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
  alta: { bg: 'bg-amber-500/20', text: 'text-amber-400' },
  urgente: { bg: 'bg-rose-500/20', text: 'text-rose-400' },
};

export const PRIORIDADE_LABELS: Record<ProjetoPrioridade, string> = {
  baixa: 'Baixa',
  normal: 'Normal',
  alta: 'Alta',
  urgente: 'Urgente',
};

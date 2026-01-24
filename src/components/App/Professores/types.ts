// Tipos para a página de Professores

export interface Professor {
  id: number;
  nome: string;
  nome_normalizado?: string;
  ativo: boolean;
  data_admissao: string | null;
  comissao_percentual: number;
  observacoes: string | null;
  foto_url: string | null;
  nps_medio: number | null;
  media_alunos_turma: number | null;
  created_at: string;
  updated_at: string;
  // Relacionamentos (carregados via join)
  unidades?: ProfessorUnidade[];
  cursos?: ProfessorCurso[];
  // Campos calculados
  total_turmas?: number;
  total_alunos?: number;
  tempo_casa_meses?: number;
}

export interface ProfessorUnidade {
  id: number;
  professor_id: number;
  unidade_id: string;
  unidade_nome?: string;
  unidade_codigo?: string;
  created_at: string;
}

export interface ProfessorCurso {
  id: number;
  professor_id: number;
  curso_id: number;
  curso_nome?: string;
  created_at: string;
}

export interface Unidade {
  id: string;
  nome: string;
  codigo: string;
  cor_primaria: string;
  ativo: boolean;
}

export interface Curso {
  id: number;
  nome: string;
  ativo?: boolean;
}

export interface KPIsProfessores {
  totalAtivos: number;
  totalInativos: number;
  mediaAlunosPorProfessor: number;
  professoresMultiUnidade: number;
  totalTurmas: number;
  mediaTurmasPorProfessor: number;
  veteranos: number; // > 5 anos
  superVeteranos: number; // > 10 anos
  mediaAlunosTurmaGeral: number;
  npsMedio: number;
}

export interface FiltrosProfessores {
  nome: string;
  unidade_id: string;
  curso_id: string;
  status: string; // 'todos' | 'ativo' | 'inativo'
  multiUnidade: string; // 'todos' | 'sim' | 'nao'
}

export interface ProfessorFormData {
  nome: string;
  data_admissao: Date | null;
  comissao_percentual: number;
  observacoes: string;
  foto_url: string;
  unidades_ids: string[];
  cursos_ids: number[];
}

export type TabAtivaProfessores = 'todos' | 'por-unidade' | 'por-curso';

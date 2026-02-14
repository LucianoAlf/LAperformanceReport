// Tipos para o componente de Grade Horária

export interface TurmaGrade {
  id: number;
  nome?: string;
  unidade_id: string;
  unidade_nome?: string;
  professor_id: number;
  professor_nome: string;
  sala_id: number | null;
  sala_nome: string;
  sala_capacidade: number;
  curso_id: number | null;
  curso_nome?: string;
  dia_semana: string;
  horario_inicio: string;
  horario_fim: string;
  duracao_minutos: number;
  capacidade_maxima: number;
  num_alunos: number;
  alunos?: number[];
  ativo: boolean;
  turma_explicita_id?: number | null;
}

export interface FiltrosGrade {
  unidadeId: string;
  salaId?: number;
  professorId?: number;
  cursoId?: number;
  diaSemana?: string;
}

export interface SlotHorario {
  hora: string;
  turmas: TurmaGrade[];
}

export interface DiaGrade {
  nome: string;
  abreviado: string;
  slots: SlotHorario[];
}

export type VisualizacaoGrade = 'semana' | 'dia' | 'sala' | 'professor';

// Tipos para o módulo de Indicadores de Matrículas (Comercial)

export interface DadosComerciais {
  id: number;
  competencia: string;
  unidade: string;
  total_leads: number;
  aulas_experimentais: number;
  novas_matriculas_total: number;
  novas_matriculas_lamk: number;
  novas_matriculas_emla: number;
  ticket_medio_parcelas: number | null;
  ticket_medio_passaporte: number | null;
  faturamento_passaporte: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface ProfessorExperimental {
  id: number;
  competencia: string;
  unidade: string;
  professor: string;
  quantidade: number;
  created_at?: string;
}

export interface CursoMatriculado {
  id: number;
  competencia: string;
  unidade: string;
  curso: string;
  quantidade: number;
  created_at?: string;
}

export interface OrigemLead {
  id: number;
  competencia: string;
  unidade: string;
  canal: string;
  tipo: 'lead' | 'experimental' | 'matricula';
  quantidade: number;
  created_at?: string;
}

export interface MetaComercial {
  id: number;
  ano: number;
  unidade: string;
  meta_leads: number;
  meta_experimentais: number;
  meta_matriculas: number;
  meta_taxa_conversao: number;
  meta_ticket_medio: number;
  created_at?: string;
  updated_at?: string;
}

export interface KPIsComerciais {
  totalLeads: number;
  aulasExperimentais: number;
  novasMatriculas: number;
  matriculasLAMK: number;
  matriculasEMLA: number;
  taxaLeadExp: number;
  taxaExpMat: number;
  taxaConversaoTotal: number;
  ticketMedioParcelas: number;
  ticketMedioPassaporte: number;
  faturamentoPassaporte: number;
}

export interface DadosMensais {
  mes: string;
  mesAbrev: string;
  leads: number;
  experimentais: number;
  matriculas: number;
  matriculasLAMK: number;
  matriculasEMLA: number;
  ticketParcelas: number | null;
  ticketPassaporte: number | null;
  faturamentoPassaporte: number | null;
}

export interface DadosUnidade {
  unidade: string;
  totalLeads: number;
  aulasExperimentais: number;
  novasMatriculas: number;
  matriculasLAMK: number;
  matriculasEMLA: number;
  taxaLeadExp: number;
  taxaExpMat: number;
  taxaConversaoTotal: number;
  ticketMedioParcelas: number;
  faturamentoPassaporte: number;
}

export type UnidadeComercial = 'Consolidado' | 'Campo Grande' | 'Recreio' | 'Barra';

export type SecaoComercial = 
  | 'inicio'
  | 'visao-geral'
  | 'funil'
  | 'professores'
  | 'cursos'
  | 'origem'
  | 'ranking'
  | 'sazonalidade'
  | 'financeiro'
  | 'alertas'
  | 'metas';

export const MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export const CORES_UNIDADES = {
  'Campo Grande': '#06b6d4', // cyan-500
  'Recreio': '#10b981',      // emerald-500
  'Barra': '#8b5cf6',        // violet-500
  'Grupo': '#f59e0b',        // amber-500
} as const;

export const CORES_COMERCIAL = {
  primary: '#10b981',        // emerald-500
  secondary: '#14b8a6',      // teal-500
  accent: '#06b6d4',         // cyan-500
  success: '#22c55e',        // green-500
  warning: '#f59e0b',        // amber-500
  danger: '#ef4444',         // red-500
} as const;

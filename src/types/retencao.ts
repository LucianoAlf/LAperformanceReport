// =============================================
// TIPOS DO MÓDULO RETENÇÃO
// =============================================

export interface Evasao {
  id: number;
  competencia: string;
  unidade: string;
  aluno: string;
  professor: string | null;
  parcela: number;
  motivo_categoria: string;
  motivo_detalhe: string | null;
  tipo: 'Interrompido' | 'Não Renovação';
  created_at: string;
}

export interface EvasaoResumo {
  competencia: string;
  unidade: string;
  total_evasoes: number;
  interrompidos: number;
  nao_renovacoes: number;
  mrr_perdido: number;
  ticket_medio_evasao: number;
  motivo_financeiro: number;
  motivo_horario: number;
  motivo_mudanca: number;
  motivo_desinteresse: number;
  motivo_inadimplencia: number;
}

export interface ProfessorEvasao {
  professor: string;
  unidade: string;
  total_evasoes: number;
  mrr_perdido: number;
  ticket_medio: number;
  motivo_principal: string;
  percentual: number;
  risco: 'crítico' | 'alto' | 'médio' | 'normal';
}

export interface MotivoEvasao {
  motivo_categoria: string;
  quantidade: number;
  mrr_perdido: number;
  percentual: number;
  cor: string;
  icone: string;
}

export interface KPIsRetencao {
  totalEvasoes: number;
  totalInterrompidos: number;
  totalNaoRenovacoes: number;
  mrrPerdidoTotal: number;
  mrrPerdidoMensal: number;
  ticketMedioEvasao: number;
  churnMedio: number;
  motivoPrincipal: string;
  professorCritico: string;
  taxaRenovacao: number;
}

export interface DadosMensaisRetencao {
  mes: string;
  mesAbrev: string;
  evasoes: number;
  churn: number;
  mrrPerdido: number;
  renovacoes: number;
  taxaRenovacao: number;
}

export interface DadosUnidadeRetencao {
  unidade: string;
  totalEvasoes: number;
  churnMedio: number;
  mrrPerdido: number;
  motivoPrincipal: string;
  professorCritico: string;
  cor: string;
}

// Tipos de seção do módulo
export type SecaoRetencao = 
  | 'inicio' 
  | 'visao-geral' 
  | 'tendencias' 
  | 'motivos' 
  | 'professores' 
  | 'sazonalidade' 
  | 'comparativo'
  | 'alertas' 
  | 'acoes';

// Tipo de unidade
export type UnidadeRetencao = 'Consolidado' | 'Campo Grande' | 'Recreio' | 'Barra';

// Constantes
export const MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export const CORES_RETENCAO = {
  primary: '#f43f5e',      // rose-500
  secondary: '#e11d48',    // rose-600
  accent: '#fb7185',       // rose-400
  background: '#1e1b2e',
  card: 'rgba(244, 63, 94, 0.1)',
  border: 'rgba(244, 63, 94, 0.3)',
};

export const CORES_MOTIVOS: Record<string, string> = {
  'Financeiro': '#ef4444',     // red-500
  'Horário': '#f97316',        // orange-500
  'Mudança': '#8b5cf6',        // violet-500
  'Desinteresse': '#eab308',   // yellow-500
  'Inadimplência': '#dc2626',  // red-600
  'Insatisfação': '#ec4899',   // pink-500
  'Saúde': '#06b6d4',          // cyan-500
  'Abandono': '#6b7280',       // gray-500
  'Pessoal': '#a855f7',        // purple-500
  'Transferência': '#22c55e',  // green-500
  'Viagem': '#3b82f6',         // blue-500
  'Concorrência': '#f43f5e',   // rose-500
};

export const ICONES_MOTIVOS: Record<string, string> = {
  'Financeiro': 'DollarSign',
  'Horário': 'Clock',
  'Mudança': 'Home',
  'Desinteresse': 'ThumbsDown',
  'Inadimplência': 'AlertTriangle',
  'Insatisfação': 'Frown',
  'Saúde': 'Heart',
  'Abandono': 'UserX',
  'Pessoal': 'User',
  'Transferência': 'ArrowRightLeft',
  'Viagem': 'Plane',
  'Concorrência': 'Building',
};

// =============================================
// TIPOS DE PERFORMANCE DE PROFESSORES
// =============================================

export interface ProfessorPerformance {
  id: number;
  professor: string;
  unidade: string;
  ano: number;
  experimentais: number;
  matriculas: number;
  taxa_conversao: number;
  evasoes: number;
  contratos_vencer: number;
  renovacoes: number;
  taxa_renovacao: number;
  score_saude?: number;
  nivel_risco?: 'crítico' | 'alto' | 'médio' | 'normal';
}

export interface KPIsRenovacao {
  totalContratos: number;
  totalRenovados: number;
  totalNaoRenovados: number;
  taxaRenovacao: number;
}

export interface TotaisPerformance {
  experimentais: number;
  matriculas: number;
  evasoes: number;
  contratos_vencer: number;
  renovacoes: number;
  taxa_conversao: number;
  taxa_renovacao: number;
  nao_renovados: number;
  totalProfessores: number;
}

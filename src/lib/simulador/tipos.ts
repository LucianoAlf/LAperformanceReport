// Tipos para o Simulador de Metas

// Tipo de objetivo do simulador
export type TipoObjetivo = 'alunos' | 'mrr';

// Tipo de meta financeira (para modo MRR)
export type TipoMetaFinanceira = 'mensal' | 'anual';

export interface DadosAtuais {
  alunosAtivos: number;
  alunosPagantes: number;
  ticketMedio: number;
  churnRate: number;
  taxaRenovacao: number;
  mrr: number;
  inadimplencia: number;
}

export interface DadosHistoricos {
  mediaMatriculas: number;
  mediaEvasoes: number;
  mediaLeads: number;
  mediaExperimentais: number;
  taxaConversaoLeadExp: number;
  taxaConversaoExpMat: number;
  taxaConversaoTotal: number;
  churnHistorico: number; // Churn médio histórico em %
  mesesAnalisados: number;
}

export interface InputsSimulacao {
  // Identificação
  unidadeId: string;
  ano: number;
  nome: string;
  descricao?: string;
  
  // Tipo de objetivo
  tipoObjetivo: TipoObjetivo;
  tipoMetaFinanceira: TipoMetaFinanceira;
  
  // Inputs editáveis - Modo Alunos
  alunosAtual: number;
  alunosObjetivo: number;
  mesObjetivo: number;
  
  // Inputs editáveis - Modo MRR
  mrrObjetivo: number;
  
  // Parâmetros comuns
  churnProjetado: number;
  ticketMedio: number;
  taxaLeadExp: number;
  taxaExpMat: number;
  
  // Inadimplência (relevante principalmente no modo MRR)
  inadimplenciaPct: number;
}

export interface ResultadoSimulacao {
  // Inputs (copiados para referência)
  inputs: InputsSimulacao;
  
  // Crescimento
  crescimentoNecessario: number;
  crescimentoPercentual: number;
  mesesRestantes: number;
  
  // Projeções mensais (calculados - somente leitura)
  evasoesMensais: number;
  matriculasMensais: number;
  experimentaisMensais: number;
  leadsMensais: number;
  
  // Totais no período
  evasoesTotais: number;
  matriculasTotais: number;
  
  // Financeiro
  mrrAtual: number;
  mrrProjetado: number;
  faturamentoAnualProjetado: number;
  ltvProjetado: number;
  
  // Viabilidade
  scoreViabilidade: number;
  alertas: Alerta[];
}

export interface Alerta {
  id: string;
  tipo: 'sucesso' | 'aviso' | 'erro' | 'info';
  categoria: 'churn' | 'matriculas' | 'leads' | 'conversao' | 'ticket' | 'renovacao' | 'geral';
  icone: string;
  titulo: string;
  mensagem: string;
  sugestao?: string;
  valorAtual?: number;
  valorNecessario?: number;
  diferencaPercent?: number;
}

export interface ProjecaoMensal {
  mes: number;
  ano: number;
  label: string;
  alunosInicio: number;
  matriculas: number;
  evasoes: number;
  alunosFim: number;
  mrr: number;
  acumuladoMatriculas: number;
  acumuladoEvasoes: number;
}

export interface Cenario {
  id: string;
  unidadeId: string;
  ano: number;
  nome: string;
  descricao?: string;
  inputs: InputsSimulacao;
  resultado: ResultadoSimulacao;
  criadoEm: Date;
  atualizadoEm: Date;
  aplicadoEm?: Date;
}

// Valores padrão para inputs
export const DEFAULTS_SIMULACAO: Partial<InputsSimulacao> = {
  tipoObjetivo: 'alunos',
  tipoMetaFinanceira: 'mensal',
  mesObjetivo: 12,
  churnProjetado: 4.0,
  taxaLeadExp: 60,
  taxaExpMat: 50,
  mrrObjetivo: 0,
  inadimplenciaPct: 3.0,
};

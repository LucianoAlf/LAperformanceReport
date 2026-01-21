// Tipos para o Simulador de Média de Alunos por Turma (Lucratividade)

// Cenários de escalonamento de pagamento
export interface CenarioEscalonamento {
  id: 'agressivo' | 'equilibrado' | 'moderado' | 'personalizado';
  nome: string;
  descricao: string;
  cor: string;
  icone: string;
  valorBase: number; // Valor base hora-aula (1 aluno)
  incremento: number; // Incremento por aluno adicional
}

// Dados de um professor
export interface ProfessorTurma {
  id: number;
  nome: string;
  unidadeId: string;
  unidadeNome: string;
  totalAlunos: number;
  totalTurmas: number;
  mediaAlunosTurma: number;
  mrrCarteira: number;
  ticketMedio: number;
  // Calculados
  percentualFolhaAtual: number;
  margemAtual: number;
  percentualFolhaMeta: number;
  margemMeta: number;
  economiaMensal: number;
  // Status
  status: 'critico' | 'atencao' | 'bom' | 'excelente';
  metaIndividual?: number;
}

// Dados consolidados da unidade
export interface DadosUnidadeTurma {
  unidadeId: string;
  unidadeNome: string;
  totalAlunos: number;
  totalTurmas: number;
  mediaAlunosTurmaAtual: number;
  ticketMedio: number;
  mrrTotal: number;
  // Calculados com base no cenário
  folhaAtual: number;
  percentualFolhaAtual: number;
  margemAtual: number;
}

// Inputs do simulador
export interface InputsSimuladorTurma {
  // Parâmetros editáveis da simulação
  mediaAtual: number; // Média atual de alunos/turma (editável para simulação)
  ticketMedio: number; // Ticket médio por aluno
  totalAlunos: number; // Número total de alunos
  custosFixos: number; // Custos fixos mensais (aluguel, admin, etc)
  
  // Meta
  mediaMeta: number; // Meta de média de alunos/turma (1.0 a 3.0)
  
  // Cenário de escalonamento
  cenarioId: 'agressivo' | 'equilibrado' | 'moderado' | 'personalizado';
  valorBase: number;
  incremento: number;
  
  // Semanas por mês (padrão 4)
  semanasMes: number;
}

// Resultado do simulador
export interface ResultadoSimuladorTurma {
  // Situação Atual
  mediaAtual: number;
  folhaAtual: number;
  percentualFolhaAtual: number;
  margemAtual: number;
  custoAlunoAtual: number;
  
  // Meta Projetada
  mediaMeta: number;
  folhaMeta: number;
  percentualFolhaMeta: number;
  margemMeta: number;
  custoAlunoMeta: number;
  
  // Ganhos
  ganhoMargem: number; // Diferença em pontos percentuais
  economiaMensal: number;
  economiaAnual: number;
  
  // Dados base
  totalAlunos: number;
  ticketMedio: number;
  mrrTotal: number;
  
  // Projeção de Lucro
  custosFixos: number;
  lucroBrutoAtual: number; // MRR - Folha
  lucroLiquidoAtual: number; // Lucro Bruto - Custos Fixos
  lucroBrutoMeta: number;
  lucroLiquidoMeta: number;
  ganhoLucroBruto: number;
  ganhoLucroLiquido: number;
  
  // Score de viabilidade
  scoreViabilidade: number;
  alertas: AlertaViabilidade[];
}

// Alerta de viabilidade
export interface AlertaViabilidade {
  tipo: 'sucesso' | 'aviso' | 'erro';
  titulo: string;
  mensagem: string;
}

// Bonificação sugerida
export interface BonificacaoSugerida {
  metaAtingida: number; // Média (1.5, 1.8, 2.0, etc)
  economiaProfessor: number;
  bonusSugerido: number;
  lucroEscola: number;
  percentualRepasse: number;
}

// Plano de ação para turmas
export interface PlanoAcaoTurma {
  diagnostico: string;
  acoes_curto_prazo: AcaoTurma[];
  acoes_medio_prazo: AcaoTurma[];
  acoes_longo_prazo: AcaoTurma[];
  insights_adicionais: string[];
}

export interface AcaoTurma {
  titulo: string;
  impacto: string;
  esforco: 'Baixo' | 'Médio' | 'Alto';
  passos: string[];
  meta_sucesso: string;
  responsavel: 'Coordenação' | 'Professor' | 'Gestor';
}

// Cenários pré-definidos
export const CENARIOS_ESCALONAMENTO: CenarioEscalonamento[] = [
  {
    id: 'agressivo',
    nome: 'Agressivo',
    descricao: 'Incremento alto para atrair professores',
    cor: 'purple',
    icone: '🚀',
    valorBase: 35,
    incremento: 10,
  },
  {
    id: 'equilibrado',
    nome: 'Equilibrado',
    descricao: 'Melhor custo-benefício para a escola',
    cor: 'emerald',
    icone: '✨',
    valorBase: 30,
    incremento: 5,
  },
  {
    id: 'moderado',
    nome: 'Moderado',
    descricao: 'Meio termo entre escola e professor',
    cor: 'amber',
    icone: '⚖️',
    valorBase: 30,
    incremento: 7,
  },
];

// Constantes
export const SEMANAS_MES = 4;
export const META_PADRAO = 2.0;

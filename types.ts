
export interface UnitData {
  id: string;
  name: string;
  alunosDez: number;
  matriculasAno: number;
  evasoesAno: number;
  churnMedio: number;
  renovacaoMedia: number;
  ticketMedio: number;
  permanenciaMeses: number;
  inadimplencia: number;
  faturamentoMes: number;
  color: string;
  bgColor: string;
  evolution: {
    month: string;
    alunos: number;
    matriculas: number;
    evasoes: number;
  }[];
  [key: string]: any; // Index signature para compatibilidade com Recharts
}

export interface Meta2026 {
  alunos: number;
  churn: string;
  renovacao: string;
  ticket: string;
  matriculas: number;
  inadimplencia: string;
  faturamento: string;
}

export type Theme = 'dark' | 'light';

export type MetricType = 'alunos' | 'matriculas' | 'evasoes' | 'churn' | 'ticket';


import { UnitData } from './types';

export const THEME_COLORS = {
  cyan: '#00d4ff',
  pink: '#ff3366',
  green: '#00cc66',
  yellow: '#ffaa00',
  purple: '#8b5cf6',
  slate: {
    400: '#94a3b8',
    700: '#334155',
    800: '#1e293b',
    900: '#0f172a'
  }
};

export const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export const UNITS: UnitData[] = [
  {
    id: 'cg',
    name: 'Campo Grande',
    alunosDez: 417,
    matriculasAno: 271,
    evasoesAno: 288,
    churnMedio: 5.21,
    renovacaoMedia: 76.58,
    ticketMedio: 371.52,
    permanenciaMeses: 19,
    inadimplencia: 0.85,
    faturamentoMes: 151000,
    color: THEME_COLORS.cyan,
    bgColor: 'rgba(0, 212, 255, 0.1)',
    evolution: [
      { month: 'Jan', alunos: 498, matriculas: 42, evasoes: 12 },
      { month: 'Fev', alunos: 464, matriculas: 29, evasoes: 49 },
      { month: 'Mar', alunos: 473, matriculas: 20, evasoes: 9 },
      { month: 'Abr', alunos: 468, matriculas: 21, evasoes: 26 },
      { month: 'Mai', alunos: 458, matriculas: 37, evasoes: 47 },
      { month: 'Jun', alunos: 458, matriculas: 12, evasoes: 5 },
      { month: 'Jul', alunos: 441, matriculas: 17, evasoes: 37 },
      { month: 'Ago', alunos: 454, matriculas: 29, evasoes: 11 },
      { month: 'Set', alunos: 448, matriculas: 23, evasoes: 29 },
      { month: 'Out', alunos: 415, matriculas: 11, evasoes: 40 },
      { month: 'Nov', alunos: 419, matriculas: 24, evasoes: 14 },
      { month: 'Dez', alunos: 417, matriculas: 6, evasoes: 9 },
    ]
  },
  {
    id: 'recreio',
    name: 'Recreio',
    alunosDez: 297,
    matriculasAno: 189,
    evasoesAno: 189,
    churnMedio: 5.01,
    renovacaoMedia: 87.04,
    ticketMedio: 429.57,
    permanenciaMeses: 16,
    inadimplencia: 1.10,
    faturamentoMes: 121000,
    color: THEME_COLORS.purple,
    bgColor: 'rgba(139, 92, 246, 0.1)',
    evolution: [
      { month: 'Jan', alunos: 311, matriculas: 30, evasoes: 13 },
      { month: 'Fev', alunos: 305, matriculas: 17, evasoes: 23 },
      { month: 'Mar', alunos: 315, matriculas: 18, evasoes: 8 },
      { month: 'Abr', alunos: 308, matriculas: 17, evasoes: 24 },
      { month: 'Mai', alunos: 311, matriculas: 10, evasoes: 7 },
      { month: 'Jun', alunos: 310, matriculas: 10, evasoes: 11 },
      { month: 'Jul', alunos: 300, matriculas: 9, evasoes: 21 },
      { month: 'Ago', alunos: 329, matriculas: 40, evasoes: 9 },
      { month: 'Set', alunos: 321, matriculas: 15, evasoes: 24 },
      { month: 'Out', alunos: 315, matriculas: 6, evasoes: 14 },
      { month: 'Nov', alunos: 317, matriculas: 13, evasoes: 11 },
      { month: 'Dez', alunos: 297, matriculas: 4, evasoes: 24 },
    ]
  },
  {
    id: 'barra',
    name: 'Barra',
    alunosDez: 221,
    matriculasAno: 142,
    evasoesAno: 135,
    churnMedio: 4.90,
    renovacaoMedia: 87.18,
    ticketMedio: 440.24,
    permanenciaMeses: 14,
    inadimplencia: 0.48,
    faturamentoMes: 86500,
    color: THEME_COLORS.green,
    bgColor: 'rgba(0, 204, 102, 0.1)',
    evolution: [
      { month: 'Jan', alunos: 217, matriculas: 16, evasoes: 11 },
      { month: 'Fev', alunos: 225, matriculas: 18, evasoes: 9 },
      { month: 'Mar', alunos: 228, matriculas: 13, evasoes: 10 },
      { month: 'Abr', alunos: 224, matriculas: 6, evasoes: 13 },
      { month: 'Mai', alunos: 218, matriculas: 12, evasoes: 19 },
      { month: 'Jun', alunos: 213, matriculas: 12, evasoes: 17 },
      { month: 'Jul', alunos: 216, matriculas: 13, evasoes: 10 },
      { month: 'Ago', alunos: 227, matriculas: 17, evasoes: 6 },
      { month: 'Set', alunos: 231, matriculas: 13, evasoes: 10 },
      { month: 'Out', alunos: 232, matriculas: 10, evasoes: 9 },
      { month: 'Nov', alunos: 236, matriculas: 9, evasoes: 5 },
      { month: 'Dez', alunos: 221, matriculas: 3, evasoes: 16 },
    ]
  }
];

export const HISTORY_DATA = {
  alunos: [
    { year: '2023', cg: 321, recreio: 219, barra: 147 },
    { year: '2024', cg: 463, recreio: 295, barra: 212 },
    { year: '2025', cg: 417, recreio: 297, barra: 221 },
  ],
  matriculas: [
    { year: '2023', cg: 194, recreio: 118, barra: 124 },
    { year: '2024', cg: 323, recreio: 187, barra: 178 },
    { year: '2025', cg: 271, recreio: 189, barra: 142 },
  ],
  evasoes: [
    { year: '2023', cg: 208, recreio: 127, barra: 74 },
    { year: '2024', cg: 213, recreio: 117, barra: 119 },
    { year: '2025', cg: 288, recreio: 189, barra: 135 },
  ],
  churn: [
    { year: '2023', cg: 5.1, recreio: 4.5, barra: 6.7 },
    { year: '2024', cg: 4.6, recreio: 3.9, barra: 6.0 },
    { year: '2025', cg: 5.21, recreio: 5.01, barra: 4.9 },
  ],
  ticket: [
    { year: '2023', cg: 312, recreio: 388, barra: 407 },
    { year: '2024', cg: 345, recreio: 418, barra: 435 },
    { year: '2025', cg: 371, recreio: 430, barra: 440 },
  ],
};

export const DISTRIBUTION_DATA = {
  '2023': {
    alunos: { cg: 321, recreio: 219, barra: 147, total: 687 },
    matriculas: { cg: 194, recreio: 118, barra: 124, total: 436 },
    evasoes: { cg: 208, recreio: 127, barra: 74, total: 409 },
    faturamento: { cg: 100152, recreio: 84972, barra: 59829, total: 253000 },
  },
  '2024': {
    alunos: { cg: 463, recreio: 295, barra: 212, total: 970 },
    matriculas: { cg: 323, recreio: 187, barra: 178, total: 688 },
    evasoes: { cg: 213, recreio: 117, barra: 119, total: 449 },
    faturamento: { cg: 159735, recreio: 123310, barra: 92220, total: 387000 },
  },
  '2025': {
    alunos: { cg: 417, recreio: 297, barra: 221, total: 935 },
    matriculas: { cg: 271, recreio: 189, barra: 142, total: 602 },
    evasoes: { cg: 288, recreio: 189, barra: 135, total: 612 },
    faturamento: { cg: 156375, recreio: 127641, barra: 97293, total: 389000 },
  },
};

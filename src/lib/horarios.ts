// Utilitários para manipulação de horários e detecção de conflitos

export interface HorarioFuncionamento {
  segunda_sexta: { inicio: string; fim: string };
  sabado: { inicio: string; fim: string };
  domingo: { fechado: boolean; inicio?: string; fim?: string };
}

export interface Turma {
  id: number;
  nome?: string;
  unidade_id: string;
  professor_id: number;
  professor_nome?: string;
  sala_id: number | null;
  sala_nome?: string;
  sala_capacidade?: number;
  curso_id: number | null;
  curso_nome?: string;
  dia_semana: string;
  horario_inicio: string;
  horario_fim: string;
  duracao_minutos: number;
  capacidade_maxima: number;
  alunos?: number[];
  ativo: boolean;
}

export interface TurmaDados {
  id?: number;
  unidade_id: string;
  professor_id: number;
  sala_id: number | null;
  curso_id: number | null;
  dia_semana: string;
  horario_inicio: string;
  horario_fim?: string;
  duracao_minutos?: number;
  capacidade_maxima?: number;
  alunos?: number[];
}

export interface Sala {
  id: number;
  nome: string;
  unidade_id: string;
  capacidade_maxima: number;
  tipo_sala?: string;
  sala_coringa?: boolean;
}

export interface Conflito {
  tipo: 'sala' | 'professor' | 'aluno' | 'horario_funcionamento' | 'capacidade';
  severidade: 'erro' | 'aviso';
  mensagem: string;
  turmasConflitantes?: number[];
  detalhes?: string;
}

export const DIAS_SEMANA = [
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado',
  'Domingo'
] as const;

export const DIAS_SEMANA_CURTO = {
  'Segunda': 'Seg',
  'Terça': 'Ter',
  'Quarta': 'Qua',
  'Quinta': 'Qui',
  'Sexta': 'Sex',
  'Sábado': 'Sáb',
  'Domingo': 'Dom'
} as const;

export const HORARIOS_PADRAO = {
  inicio: '08:00',
  fim: '21:00',
  intervalo: 60 // minutos
};

/**
 * Converte string de horário (HH:MM) para minutos desde meia-noite
 */
export function horarioParaMinutos(horario: string): number {
  const [horas, minutos] = horario.split(':').map(Number);
  return horas * 60 + minutos;
}

/**
 * Converte minutos desde meia-noite para string de horário (HH:MM)
 */
export function minutosParaHorario(minutos: number): string {
  const horas = Math.floor(minutos / 60);
  const mins = minutos % 60;
  return `${horas.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

/**
 * Gera lista de horários disponíveis (08:00 até 21:00, de hora em hora)
 */
export function gerarHorariosDisponiveis(
  inicio: string = '08:00',
  fim: string = '21:00',
  intervalo: number = 60
): string[] {
  const horarios: string[] = [];
  let atual = horarioParaMinutos(inicio);
  const fimMinutos = horarioParaMinutos(fim);

  while (atual < fimMinutos) {
    horarios.push(minutosParaHorario(atual));
    atual += intervalo;
  }

  return horarios;
}

/**
 * Verifica se dois intervalos de horário se sobrepõem
 */
export function horariosSeOverpoem(
  inicio1: string,
  fim1: string,
  inicio2: string,
  fim2: string
): boolean {
  const i1 = horarioParaMinutos(inicio1);
  const f1 = horarioParaMinutos(fim1);
  const i2 = horarioParaMinutos(inicio2);
  const f2 = horarioParaMinutos(fim2);

  // Dois intervalos se sobrepõem se um começa antes do outro terminar
  return i1 < f2 && i2 < f1;
}

/**
 * Calcula horário de fim baseado no início e duração
 */
export function calcularHorarioFim(horarioInicio: string, duracaoMinutos: number = 60): string {
  const inicioMinutos = horarioParaMinutos(horarioInicio);
  return minutosParaHorario(inicioMinutos + duracaoMinutos);
}

/**
 * Verifica se um horário está dentro do horário de funcionamento
 */
export function dentroDoHorarioFuncionamento(
  diaSemana: string,
  horarioInicio: string,
  horarioFim: string,
  horarioFuncionamento: HorarioFuncionamento
): boolean {
  let config: { inicio: string; fim: string } | null = null;

  if (diaSemana === 'Domingo') {
    if (horarioFuncionamento.domingo?.fechado) {
      return false;
    }
    config = horarioFuncionamento.domingo as { inicio: string; fim: string };
  } else if (diaSemana === 'Sábado') {
    config = horarioFuncionamento.sabado;
  } else {
    config = horarioFuncionamento.segunda_sexta;
  }

  if (!config) return false;

  const inicioFuncionamento = horarioParaMinutos(config.inicio);
  const fimFuncionamento = horarioParaMinutos(config.fim);
  const inicioTurma = horarioParaMinutos(horarioInicio);
  const fimTurma = horarioParaMinutos(horarioFim);

  return inicioTurma >= inicioFuncionamento && fimTurma <= fimFuncionamento;
}

/**
 * Gera cor consistente baseada em um ID
 */
export function gerarCorPorId(id: number): string {
  const cores = [
    'bg-violet-500/20 border-violet-500/50 text-violet-300',
    'bg-blue-500/20 border-blue-500/50 text-blue-300',
    'bg-emerald-500/20 border-emerald-500/50 text-emerald-300',
    'bg-amber-500/20 border-amber-500/50 text-amber-300',
    'bg-rose-500/20 border-rose-500/50 text-rose-300',
    'bg-cyan-500/20 border-cyan-500/50 text-cyan-300',
    'bg-pink-500/20 border-pink-500/50 text-pink-300',
    'bg-indigo-500/20 border-indigo-500/50 text-indigo-300',
    'bg-teal-500/20 border-teal-500/50 text-teal-300',
    'bg-orange-500/20 border-orange-500/50 text-orange-300',
  ];
  return cores[id % cores.length];
}

/**
 * Gera cor sólida baseada em um ID (para backgrounds)
 */
export function gerarCorSolidaPorId(id: number): string {
  const cores = [
    'bg-violet-500',
    'bg-blue-500',
    'bg-emerald-500',
    'bg-amber-500',
    'bg-rose-500',
    'bg-cyan-500',
    'bg-pink-500',
    'bg-indigo-500',
    'bg-teal-500',
    'bg-orange-500',
  ];
  return cores[id % cores.length];
}

// Sistema de sugestões inteligentes de horários

import {
  Turma,
  Sala,
  HorarioFuncionamento,
  DIAS_SEMANA,
  gerarHorariosDisponiveis,
  horariosSeOverpoem,
  calcularHorarioFim,
  dentroDoHorarioFuncionamento
} from './horarios';

export interface Sugestao {
  diaSemana: string;
  horarioInicio: string;
  horarioFim: string;
  salaId: number;
  salaNome: string;
  score: number; // 0-100
  motivos: string[];
  conflitos: string[];
}

interface DadosSugestao {
  professorId: number;
  cursoId?: number;
  duracaoMinutos: number;
  unidadeId: string;
  turmasExistentes: Turma[];
  salas: Sala[];
  horarioFuncionamento: HorarioFuncionamento;
  tipoSalaPreferido?: string;
  alunosIds?: number[];
}

/**
 * Gera sugestões de horários disponíveis para uma nova turma
 */
export function gerarSugestoes(dados: DadosSugestao, limite: number = 5): Sugestao[] {
  const sugestoes: Sugestao[] = [];
  const horarios = gerarHorariosDisponiveis('08:00', '21:00', 60);

  // Filtrar salas da unidade
  const salasUnidade = dados.salas.filter(s => s.unidade_id === dados.unidadeId);

  // Para cada combinação de dia/horário/sala
  for (const dia of DIAS_SEMANA) {
    // Pular domingo se fechado
    if (dia === 'Domingo' && dados.horarioFuncionamento.domingo?.fechado) {
      continue;
    }

    for (const horario of horarios) {
      const horarioFim = calcularHorarioFim(horario, dados.duracaoMinutos);

      // Verificar se está dentro do horário de funcionamento
      if (!dentroDoHorarioFuncionamento(dia, horario, horarioFim, dados.horarioFuncionamento)) {
        continue;
      }

      // Verificar se o professor está disponível neste horário
      const professorOcupado = dados.turmasExistentes.some(t => 
        t.professor_id === dados.professorId &&
        t.dia_semana === dia &&
        t.ativo &&
        horariosSeOverpoem(horario, horarioFim, t.horario_inicio, t.horario_fim)
      );

      if (professorOcupado) continue;

      // Para cada sala disponível
      for (const sala of salasUnidade) {
        const sugestao = avaliarSlot(
          dia,
          horario,
          horarioFim,
          sala,
          dados
        );

        if (sugestao && sugestao.score > 0) {
          sugestoes.push(sugestao);
        }
      }
    }
  }

  // Ordenar por score (maior primeiro) e limitar
  return sugestoes
    .sort((a, b) => b.score - a.score)
    .slice(0, limite);
}

/**
 * Avalia um slot específico (dia/horário/sala)
 */
function avaliarSlot(
  diaSemana: string,
  horarioInicio: string,
  horarioFim: string,
  sala: Sala,
  dados: DadosSugestao
): Sugestao | null {
  let score = 100;
  const motivos: string[] = [];
  const conflitos: string[] = [];

  // 1. Verificar se a sala está ocupada
  const salaOcupada = dados.turmasExistentes.some(t =>
    t.sala_id === sala.id &&
    t.dia_semana === diaSemana &&
    t.ativo &&
    horariosSeOverpoem(horarioInicio, horarioFim, t.horario_inicio, t.horario_fim)
  );

  if (salaOcupada) {
    return null; // Slot não disponível
  }

  // 2. Verificar compatibilidade de tipo de sala
  if (dados.tipoSalaPreferido && sala.tipo_sala) {
    if (sala.tipo_sala === dados.tipoSalaPreferido) {
      score += 20;
      motivos.push('Tipo de sala compatível');
    } else if (sala.sala_coringa) {
      score += 10;
      motivos.push('Sala coringa disponível');
    } else {
      score -= 15;
      conflitos.push('Tipo de sala diferente do preferido');
    }
  }

  // 3. Verificar capacidade da sala
  const numAlunos = dados.alunosIds?.length || 0;
  if (numAlunos > 0) {
    if (numAlunos > sala.capacidade_maxima) {
      return null; // Sala muito pequena
    }
    
    const ocupacao = numAlunos / sala.capacidade_maxima;
    if (ocupacao >= 0.5 && ocupacao <= 0.8) {
      score += 10;
      motivos.push('Capacidade adequada');
    } else if (ocupacao > 0.8) {
      score -= 5;
      conflitos.push('Sala quase cheia');
    }
  }

  // 4. Preferir horários comerciais (9h-18h)
  const horaInicio = parseInt(horarioInicio.split(':')[0]);
  if (horaInicio >= 9 && horaInicio <= 17) {
    score += 5;
    motivos.push('Horário comercial');
  } else if (horaInicio >= 19) {
    score += 3;
    motivos.push('Horário noturno');
  }

  // 5. Verificar distribuição do professor (evitar muitas turmas seguidas)
  const turmasProfessorNoDia = dados.turmasExistentes.filter(t =>
    t.professor_id === dados.professorId &&
    t.dia_semana === diaSemana &&
    t.ativo
  );

  if (turmasProfessorNoDia.length === 0) {
    score += 10;
    motivos.push('Novo dia para o professor');
  } else if (turmasProfessorNoDia.length >= 4) {
    score -= 10;
    conflitos.push('Professor com muitas turmas neste dia');
  }

  // 6. Verificar se há turmas adjacentes (bom para continuidade)
  const temTurmaAntes = turmasProfessorNoDia.some(t => {
    const fimAnterior = t.horario_fim;
    return fimAnterior === horarioInicio;
  });

  const temTurmaDepois = turmasProfessorNoDia.some(t => {
    return t.horario_inicio === horarioFim;
  });

  if (temTurmaAntes || temTurmaDepois) {
    score += 5;
    motivos.push('Horário adjacente a outra turma');
  }

  // 7. Preferir dias de semana a sábado
  if (diaSemana === 'Sábado') {
    score -= 5;
  }

  // Garantir score mínimo
  score = Math.max(0, Math.min(100, score));

  return {
    diaSemana,
    horarioInicio,
    horarioFim,
    salaId: sala.id,
    salaNome: sala.nome,
    score,
    motivos,
    conflitos
  };
}

/**
 * Converte score em estrelas (1-5)
 */
export function scoreParaEstrelas(score: number): number {
  if (score >= 90) return 5;
  if (score >= 75) return 4;
  if (score >= 60) return 3;
  if (score >= 40) return 2;
  return 1;
}

/**
 * Converte score em texto descritivo
 */
export function scoreParaTexto(score: number): string {
  if (score >= 90) return 'Ótimo';
  if (score >= 75) return 'Muito bom';
  if (score >= 60) return 'Bom';
  if (score >= 40) return 'Razoável';
  return 'Limitado';
}

/**
 * Gera cor baseada no score
 */
export function scoreParaCor(score: number): string {
  if (score >= 90) return 'text-emerald-400';
  if (score >= 75) return 'text-green-400';
  if (score >= 60) return 'text-amber-400';
  if (score >= 40) return 'text-orange-400';
  return 'text-red-400';
}

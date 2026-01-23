// Sistema de detecção de conflitos para turmas

import { 
  Turma, 
  TurmaDados, 
  Sala, 
  Conflito, 
  HorarioFuncionamento,
  horariosSeOverpoem,
  dentroDoHorarioFuncionamento,
  calcularHorarioFim
} from './horarios';

interface DadosConflito {
  turmasExistentes: Turma[];
  salas: Sala[];
  horarioFuncionamento?: HorarioFuncionamento;
  alunosTurmas?: Map<number, number[]>; // turma_id -> aluno_ids
}

/**
 * Detecta todos os conflitos para uma nova turma ou edição
 */
export function detectarConflitos(
  novaTurma: TurmaDados,
  dados: DadosConflito
): Conflito[] {
  const conflitos: Conflito[] = [];
  
  const horarioFim = novaTurma.horario_fim || 
    calcularHorarioFim(novaTurma.horario_inicio, novaTurma.duracao_minutos || 60);

  // 1. Verificar conflito de sala ocupada
  if (novaTurma.sala_id) {
    const conflitosSala = detectarConflitoSala(
      novaTurma,
      horarioFim,
      dados.turmasExistentes
    );
    conflitos.push(...conflitosSala);
  }

  // 2. Verificar conflito de professor ocupado
  const conflitosProfessor = detectarConflitoProfessor(
    novaTurma,
    horarioFim,
    dados.turmasExistentes
  );
  conflitos.push(...conflitosProfessor);

  // 3. Verificar conflito de alunos ocupados
  if (novaTurma.alunos && novaTurma.alunos.length > 0 && dados.alunosTurmas) {
    const conflitosAlunos = detectarConflitoAlunos(
      novaTurma,
      horarioFim,
      dados.turmasExistentes,
      dados.alunosTurmas
    );
    conflitos.push(...conflitosAlunos);
  }

  // 4. Verificar horário de funcionamento
  if (dados.horarioFuncionamento) {
    const conflitoHorario = detectarConflitoHorarioFuncionamento(
      novaTurma,
      horarioFim,
      dados.horarioFuncionamento
    );
    if (conflitoHorario) {
      conflitos.push(conflitoHorario);
    }
  }

  // 5. Verificar capacidade da sala
  if (novaTurma.sala_id && novaTurma.alunos) {
    const conflitoCapacidade = detectarConflitoCapacidade(
      novaTurma,
      dados.salas
    );
    if (conflitoCapacidade) {
      conflitos.push(conflitoCapacidade);
    }
  }

  return conflitos;
}

/**
 * Detecta conflito de sala ocupada
 */
function detectarConflitoSala(
  novaTurma: TurmaDados,
  horarioFim: string,
  turmasExistentes: Turma[]
): Conflito[] {
  const conflitos: Conflito[] = [];

  const turmasConflitantes = turmasExistentes.filter(turma => {
    // Ignorar a própria turma (caso de edição)
    if (novaTurma.id && turma.id === novaTurma.id) return false;
    
    // Verificar se é a mesma sala e mesmo dia
    if (turma.sala_id !== novaTurma.sala_id) return false;
    if (turma.dia_semana !== novaTurma.dia_semana) return false;
    if (!turma.ativo) return false;

    // Verificar sobreposição de horários
    return horariosSeOverpoem(
      novaTurma.horario_inicio,
      horarioFim,
      turma.horario_inicio,
      turma.horario_fim
    );
  });

  if (turmasConflitantes.length > 0) {
    conflitos.push({
      tipo: 'sala',
      severidade: 'erro',
      mensagem: `Sala ocupada: ${turmasConflitantes.length} turma(s) no mesmo horário`,
      turmasConflitantes: turmasConflitantes.map(t => t.id),
      detalhes: turmasConflitantes.map(t => 
        `${t.nome || 'Turma'} (${t.horario_inicio} - ${t.horario_fim})`
      ).join(', ')
    });
  }

  return conflitos;
}

/**
 * Detecta conflito de professor ocupado
 */
function detectarConflitoProfessor(
  novaTurma: TurmaDados,
  horarioFim: string,
  turmasExistentes: Turma[]
): Conflito[] {
  const conflitos: Conflito[] = [];

  const turmasConflitantes = turmasExistentes.filter(turma => {
    // Ignorar a própria turma (caso de edição)
    if (novaTurma.id && turma.id === novaTurma.id) return false;
    
    // Verificar se é o mesmo professor e mesmo dia
    if (turma.professor_id !== novaTurma.professor_id) return false;
    if (turma.dia_semana !== novaTurma.dia_semana) return false;
    if (!turma.ativo) return false;

    // Verificar sobreposição de horários
    return horariosSeOverpoem(
      novaTurma.horario_inicio,
      horarioFim,
      turma.horario_inicio,
      turma.horario_fim
    );
  });

  if (turmasConflitantes.length > 0) {
    conflitos.push({
      tipo: 'professor',
      severidade: 'erro',
      mensagem: `Professor ocupado: ${turmasConflitantes.length} turma(s) no mesmo horário`,
      turmasConflitantes: turmasConflitantes.map(t => t.id),
      detalhes: turmasConflitantes.map(t => 
        `${t.nome || 'Turma'} em ${t.sala_nome || 'sala'} (${t.horario_inicio} - ${t.horario_fim})`
      ).join(', ')
    });
  }

  return conflitos;
}

/**
 * Detecta conflito de alunos ocupados
 */
function detectarConflitoAlunos(
  novaTurma: TurmaDados,
  horarioFim: string,
  turmasExistentes: Turma[],
  alunosTurmas: Map<number, number[]>
): Conflito[] {
  const conflitos: Conflito[] = [];
  const alunosConflitantes: number[] = [];

  if (!novaTurma.alunos) return conflitos;

  // Para cada aluno da nova turma
  for (const alunoId of novaTurma.alunos) {
    // Verificar em quais turmas esse aluno está
    for (const [turmaId, alunos] of alunosTurmas.entries()) {
      // Ignorar a própria turma
      if (novaTurma.id && turmaId === novaTurma.id) continue;
      
      // Verificar se o aluno está nessa turma
      if (!alunos.includes(alunoId)) continue;

      // Buscar dados da turma
      const turma = turmasExistentes.find(t => t.id === turmaId);
      if (!turma || !turma.ativo) continue;

      // Verificar se é o mesmo dia
      if (turma.dia_semana !== novaTurma.dia_semana) continue;

      // Verificar sobreposição de horários
      if (horariosSeOverpoem(
        novaTurma.horario_inicio,
        horarioFim,
        turma.horario_inicio,
        turma.horario_fim
      )) {
        if (!alunosConflitantes.includes(alunoId)) {
          alunosConflitantes.push(alunoId);
        }
      }
    }
  }

  if (alunosConflitantes.length > 0) {
    conflitos.push({
      tipo: 'aluno',
      severidade: 'aviso',
      mensagem: `${alunosConflitantes.length} aluno(s) com conflito de horário`,
      detalhes: `Alunos já matriculados em outras turmas no mesmo horário`
    });
  }

  return conflitos;
}

/**
 * Detecta conflito com horário de funcionamento
 */
function detectarConflitoHorarioFuncionamento(
  novaTurma: TurmaDados,
  horarioFim: string,
  horarioFuncionamento: HorarioFuncionamento
): Conflito | null {
  const dentroDoHorario = dentroDoHorarioFuncionamento(
    novaTurma.dia_semana,
    novaTurma.horario_inicio,
    horarioFim,
    horarioFuncionamento
  );

  if (!dentroDoHorario) {
    if (novaTurma.dia_semana === 'Domingo' && horarioFuncionamento.domingo?.fechado) {
      return {
        tipo: 'horario_funcionamento',
        severidade: 'erro',
        mensagem: 'Unidade fechada aos domingos',
        detalhes: 'A unidade não funciona neste dia'
      };
    }

    return {
      tipo: 'horario_funcionamento',
      severidade: 'aviso',
      mensagem: 'Fora do horário de funcionamento',
      detalhes: `A turma está fora do horário de funcionamento da unidade`
    };
  }

  return null;
}

/**
 * Detecta conflito de capacidade da sala
 */
function detectarConflitoCapacidade(
  novaTurma: TurmaDados,
  salas: Sala[]
): Conflito | null {
  const sala = salas.find(s => s.id === novaTurma.sala_id);
  
  if (!sala) return null;

  const numAlunos = novaTurma.alunos?.length || 0;
  
  if (numAlunos > sala.capacidade_maxima) {
    return {
      tipo: 'capacidade',
      severidade: 'erro',
      mensagem: `Capacidade excedida: ${numAlunos}/${sala.capacidade_maxima} alunos`,
      detalhes: `A sala ${sala.nome} comporta no máximo ${sala.capacidade_maxima} alunos`
    };
  }

  // Aviso se estiver próximo da capacidade (80%+)
  if (numAlunos >= sala.capacidade_maxima * 0.8) {
    return {
      tipo: 'capacidade',
      severidade: 'aviso',
      mensagem: `Sala quase cheia: ${numAlunos}/${sala.capacidade_maxima} alunos`,
      detalhes: `A sala ${sala.nome} está com ${Math.round((numAlunos / sala.capacidade_maxima) * 100)}% da capacidade`
    };
  }

  return null;
}

/**
 * Agrupa conflitos por severidade
 */
export function agruparConflitosPorSeveridade(conflitos: Conflito[]): {
  erros: Conflito[];
  avisos: Conflito[];
} {
  return {
    erros: conflitos.filter(c => c.severidade === 'erro'),
    avisos: conflitos.filter(c => c.severidade === 'aviso')
  };
}

/**
 * Verifica se há conflitos bloqueantes (erros)
 */
export function temConflitosBloqueantes(conflitos: Conflito[]): boolean {
  return conflitos.some(c => c.severidade === 'erro');
}

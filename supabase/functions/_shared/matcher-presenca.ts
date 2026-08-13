// Matcher de aluno local do sync de presenca (2026-08-13).
//
// Problema que resolve: alunos sao MATRICULAS, nao pessoas — a mesma pessoa
// pode ter varias matriculas ativas simultaneas no Emusys (ex.: Vinicius Lopa,
// Campo Grande: 3 Power Kids, cada uma com dia/horario proprio). O matcher
// antigo resolvia por emusys_student_id (ambiguo), por nome+nascimento+curso
// (ambiguo quando mesmo curso) e caia num fallback por nome que era
// "ultimo vence" no mapa — instavel entre execucoes. Resultado: presenca
// gravada para o aluno_id errado, 2-3 cards do mesmo aluno na chamada da
// Agenda e roster com curso trocado.
//
// Nova ordem de resolucao:
//   1. CONTRATO DA AULA: aula.matricula_disciplina_id > 0 -> jornada
//      (contrato -> aluno). O contrato tem dono unico: desempata sem depender
//      de nome. NAO usa o id_aluno do payload como chave de validacao de
//      proposito (o contrato ja basta).
//   2. emusys_student_id unico (comportamento antigo preservado).
//   3. composto nome+nascimento+curso unico (comportamento antigo preservado).
//   4. DIA/HORARIO: entre as matriculas da pessoa, so uma tem grade no dia e
//      hora da aula (reagendada usa o horario original). Desempata a linha
//      container (tipo=turma, sem contrato).
//   5. Fallback por nome (ultima instancia, como antes).

const DIAS_SEMANA_BRT = [
  'domingo',
  'segunda',
  'terca',
  'quarta',
  'quinta',
  'sexta',
  'sabado',
] as const;

// Normalizar nome para matching (mesmo padrao do parseEmusysFile.ts)
export function normalizarNomeMatcher(nome: string): string {
  return nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// 'Terça-feira' -> 'terca' (sem acento, sem sufixo -feira)
export function normalizarDiaSemana(dia: string | null | undefined): string | null {
  if (!dia) return null;
  const norm = dia
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const base = norm.split('-')[0].trim();
  return base || null;
}

// Dia da semana (normalizado) de um data_hora_inicio do Emusys ("YYYY-MM-DD HH:mm").
// A data vem em BRT; -03:00 fixo e o mesmo padrao do parse do sync.
export function diaSemanaDeDataHora(dataHoraInicio: string | null): string | null {
  if (!dataHoraInicio) return null;
  const s = dataHoraInicio.trim();
  // Guarda de formato: o parser do V8 e leniente e aceita lixo (ex.:
  // "invalida:00-03:00" vira data valida) — sem isso lixo vira dia da semana.
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s)) return null;
  try {
    const iso = s.replace(' ', 'T') + ':00-03:00';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return DIAS_SEMANA_BRT[d.getUTCDay()];
  } catch {
    return null;
  }
}

// "2026-08-04 17:00" -> "17:00" (HH:MM)
export function horarioDeDataHora(dataHoraInicio: string | null): string | null {
  if (!dataHoraInicio) return null;
  const hhmm = dataHoraInicio.trim().split(' ')[1]?.slice(0, 5);
  return hhmm && /^\d{2}:\d{2}$/.test(hhmm) ? hhmm : null;
}

// "17:00" ou "17:00:00" -> "17:00"
export function horarioHHMM(horario: string | null | undefined): string | null {
  if (!horario) return null;
  const hhmm = horario.trim().slice(0, 5);
  return /^\d{2}:\d{2}$/.test(hhmm) ? hhmm : null;
}

export interface JornadaContrato {
  alunoId: number;
  diaSemana: string | null;
  horario: string | null;
}

export interface ContextoAulaMatcher {
  // id do contrato (matricula_disciplina) da propria aula. Linhas tipo=turma
  // (container) vem com 0/null: para elas o desempate e por dia/horario.
  matriculaDisciplinaId: number | null;
  dataHoraInicio: string | null;
  dataHoraInicioOriginal: string | null;
}

export interface AlunoParaMatcher {
  id_aluno?: number | null;
  nome_aluno?: string | null;
  data_nascimento_aluno?: string | null;
}

export function resolverAlunoLocal(
  aluno: AlunoParaMatcher,
  cursoIdAula: number | null,
  contexto: ContextoAulaMatcher,
  mapaAlunosEmusys: Map<string, number[]>,
  mapaAlunosComposto: Map<string, number[]>,
  mapaAlunos: Map<string, number>,
  mapaContratos: Map<number, JornadaContrato>,
  mapaJornadaPorAluno: Map<number, JornadaContrato[]>
): number | undefined {
  // 1. CONTRATO DA AULA: matricula_disciplina_id > 0 aponta para o contrato
  // exato no Emusys, e a jornada mapeia contrato -> aluno. Resolve sem
  // ambiguidade mesmo quando a pessoa tem varias matriculas ativas.
  if (contexto.matriculaDisciplinaId != null && contexto.matriculaDisciplinaId > 0) {
    const contrato = mapaContratos.get(contexto.matriculaDisciplinaId);
    if (contrato) return contrato.alunoId;
  }

  const nomeNorm = normalizarNomeMatcher(aluno.nome_aluno || '');

  let pool: number[] = [];
  if (aluno.id_aluno != null && aluno.id_aluno > 0) {
    const candidatosEmusys = mapaAlunosEmusys.get(String(aluno.id_aluno)) ?? [];
    if (candidatosEmusys.length === 1) return candidatosEmusys[0];
    pool = candidatosEmusys;
  }

  if (cursoIdAula != null) {
    const chave = `${nomeNorm}|${aluno.data_nascimento_aluno ?? ''}|${cursoIdAula}`;
    const candidatos = mapaAlunosComposto.get(chave) ?? [];
    if (candidatos.length === 1) return candidatos[0];
    if (pool.length === 0) pool = candidatos;
  }

  // 2. DIA/HORARIO: entre as varias matriculas da pessoa, so uma tem grade no
  // dia e hora desta aula. Reagendada usa o horario original (a jornada
  // reflete a grade regular do contrato).
  if (pool.length > 1) {
    const dataHoraReferencia = contexto.dataHoraInicioOriginal ?? contexto.dataHoraInicio;
    const diaAula = diaSemanaDeDataHora(dataHoraReferencia);
    const horaAula = horarioDeDataHora(dataHoraReferencia);
    if (diaAula && horaAula) {
      const noHorario = pool.filter((id) =>
        (mapaJornadaPorAluno.get(id) ?? []).some(
          (j) => j.diaSemana === diaAula && j.horario === horaAula
        )
      );
      if (noHorario.length === 1) return noHorario[0];
    }
  }

  return mapaAlunos.get(nomeNorm);
}

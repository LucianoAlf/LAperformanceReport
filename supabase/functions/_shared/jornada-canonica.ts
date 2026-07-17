type SupabaseClientLike = {
  from: (table: string) => any;
};

export interface JornadaDisciplinaInput {
  matriculaDisciplinaId: number | null;
  disciplinaId: number | null;
  nome: string | null;
  nomeProfessor: string | null;
  professorEmusysId: number | null;
  nrAulasContratadas: number | null;
  nrAulasPassadas: number | null;
  nrAulasFuturas: number | null;
  dataHoraPrimeiraAula: string | null;
  dataHoraUltimaAula: string | null;
  diaSemana: string | null;
  horario: string | null;
  raw: any;
}

export interface JornadaMatriculaInput {
  unidadeId: string;
  fonte: string;
  statusMatricula: string | null;
  emusysAlunoId: number | null;
  emusysMatriculaId: number | null;
  nomeAluno: string | null;
  dataNascimentoAluno: string | null;
  qtdContratos: number | null;
  disciplinas: JornadaDisciplinaInput[];
  raw: any;
}

export interface JornadaReferenciaMaps {
  alunoIdPorMatriculaEmusys?: Map<number, number>;
  alunoIdPorAlunoEmusys?: Map<number, number>;
  cursoIdPorDisciplinaEmusys?: Map<number, number | null>;
  professorIdPorProfessorEmusys?: Map<number, number>;
}

export interface TransicaoProfessorJornadaAtual {
  aluno_id?: number | null;
  curso_id?: number | null;
  professor_id?: number | null;
  emusys_professor_id?: number | null;
}

export interface TransicaoProfessorResolvida {
  cursoNovoId: number | null;
  professorNovoId: number | null;
  dataTransicao: string;
  tipoTransicao: string;
  descricaoEmusys: string | null;
  automacaoLogId: number | null;
  fonte: string;
}

export function buildTransicaoProfessorContextoSemPii(
  input: JornadaMatriculaInput,
  disciplina: JornadaDisciplinaInput,
  jornadaAtual: TransicaoProfessorJornadaAtual,
  resolvida: TransicaoProfessorResolvida,
): Record<string, unknown> {
  return {
    unidade_id: input.unidadeId,
    aluno_id: jornadaAtual.aluno_id ?? null,
    emusys_aluno_id: input.emusysAlunoId,
    emusys_matricula_id: input.emusysMatriculaId,
    emusys_matricula_disciplina_id: disciplina.matriculaDisciplinaId,
    emusys_disciplina_id: disciplina.disciplinaId,
    curso_id: resolvida.cursoNovoId,
    curso_anterior_id: jornadaAtual.curso_id ?? null,
    professor_anterior_id: jornadaAtual.professor_id ?? null,
    professor_novo_id: resolvida.professorNovoId,
    emusys_professor_anterior_id: jornadaAtual.emusys_professor_id ?? null,
    emusys_professor_novo_id: disciplina.professorEmusysId,
    data_transicao: resolvida.dataTransicao,
    tipo_transicao: resolvida.tipoTransicao,
    descricao_emusys: resolvida.descricaoEmusys,
    automacao_log_id: resolvida.automacaoLogId,
    fonte: resolvida.fonte,
  };
}

function numberOrNull(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function textOrNull(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function statusCanonico(status: string | null): string {
  const normalized = String(status || '').trim().toLowerCase();
  if ([
    'ativa',
    'ativo',
    'matriculada',
    'matriculado',
    'em andamento',
    'matricula_nova',
    'matricula_renovacao',
    'matricula_renovada',
    'matricula_alterada',
  ].includes(normalized)) return 'ativa';
  if (['trancada', 'trancado', 'matricula_trancamento'].includes(normalized)) return 'trancada';
  if ([
    'finalizada',
    'finalizado',
    'evadida',
    'evadido',
    'inativa',
    'inativo',
    'matricula_finalizacao',
  ].includes(normalized)) return 'finalizada';
  return 'desconhecido';
}

function parseDateTime(value: string | null): string | null {
  if (!value) return null;
  const iso = value.includes('T') ? value : value.replace(' ', 'T');
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function calcularProximaAula(passadas: number | null, futuras: number | null): number | null {
  if (passadas == null) return null;
  if ((futuras ?? 0) <= 0) return null;
  return passadas + 1;
}

function calcularPercentual(passadas: number | null, contratadas: number | null): number | null {
  if (passadas == null || contratadas == null || contratadas <= 0) return null;
  const percentual = Math.round((passadas / contratadas) * 10000) / 100;
  return Math.max(0, Math.min(100, percentual));
}

function primeiraAgenda(disciplina: any): { diaSemana: string | null; horario: string | null } {
  const agendamento = Array.isArray(disciplina?.agendamentos) ? disciplina.agendamentos[0] : null;
  return {
    diaSemana: textOrNull(agendamento?.dia_da_semana_nome ?? agendamento?.dia_da_semana),
    horario: textOrNull(agendamento?.horario),
  };
}

function extractDisciplina(disciplina: any): JornadaDisciplinaInput {
  const agenda = primeiraAgenda(disciplina);
  return {
    matriculaDisciplinaId: numberOrNull(disciplina?.matricula_disciplina_id ?? disciplina?.id),
    disciplinaId: numberOrNull(disciplina?.disciplina_id),
    nome: textOrNull(disciplina?.nome),
    nomeProfessor: textOrNull(disciplina?.nome_professor),
    professorEmusysId: numberOrNull(disciplina?.id_professor),
    nrAulasContratadas: numberOrNull(disciplina?.nr_aulas_contratadas),
    nrAulasPassadas: numberOrNull(disciplina?.nr_aulas_passadas),
    nrAulasFuturas: numberOrNull(disciplina?.nr_aulas_futuras),
    dataHoraPrimeiraAula: textOrNull(disciplina?.data_hora_primeira_aula),
    dataHoraUltimaAula: textOrNull(disciplina?.data_hora_ultima_aula),
    diaSemana: agenda.diaSemana,
    horario: agenda.horario,
    raw: disciplina,
  };
}

export function buildJornadaInputFromWebhook(
  body: any,
  unidadeId: string,
  fonte = 'webhook'
): JornadaMatriculaInput | null {
  const matricula = body?.matricula;
  if (!matricula) return null;

  const disciplinasRaw = Array.isArray(matricula.disciplinas) ? matricula.disciplinas : [];
  return {
    unidadeId,
    fonte,
    statusMatricula: textOrNull(matricula.status ?? body?.evento),
    emusysAlunoId: numberOrNull(matricula.aluno_id ?? matricula.id_aluno),
    emusysMatriculaId: numberOrNull(matricula.matricula_id ?? matricula.id),
    nomeAluno: textOrNull(matricula.nome_aluno),
    dataNascimentoAluno: textOrNull(matricula.data_nascimento_aluno),
    qtdContratos: numberOrNull(matricula.qtd_contratos),
    disciplinas: disciplinasRaw.map(extractDisciplina).filter((d) => d.matriculaDisciplinaId != null),
    raw: body,
  };
}

export function buildJornadaInputFromMatriculaApi(
  mat: any,
  unidadeId: string,
  fonte = 'sync-matriculas-emusys'
): JornadaMatriculaInput | null {
  if (!mat) return null;

  const contrato = mat.contrato_atual || {};
  const disciplinasRaw = Array.isArray(contrato.disciplinas) ? contrato.disciplinas : [];
  return {
    unidadeId,
    fonte,
    statusMatricula: textOrNull(mat.status ?? contrato.status),
    emusysAlunoId: numberOrNull(mat.aluno?.id ?? mat.aluno_id ?? mat.id_aluno),
    emusysMatriculaId: numberOrNull(mat.id ?? mat.matricula_id),
    nomeAluno: textOrNull(mat.aluno?.nome ?? mat.nome_aluno),
    dataNascimentoAluno: textOrNull(mat.aluno?.data_nascimento ?? mat.data_nascimento_aluno),
    qtdContratos: numberOrNull(mat.qtd_contratos),
    disciplinas: disciplinasRaw.map(extractDisciplina).filter((d) => d.matriculaDisciplinaId != null),
    raw: mat,
  };
}

async function resolveAlunoId(supabase: SupabaseClientLike, input: JornadaMatriculaInput): Promise<number | null> {
  if (input.emusysMatriculaId != null) {
    const { data } = await supabase
      .from('alunos')
      .select('id')
      .eq('unidade_id', input.unidadeId)
      .eq('emusys_matricula_id', String(input.emusysMatriculaId))
      .maybeSingle();
    if (data?.id) return data.id;
  }

  if (input.emusysAlunoId != null) {
    const { data } = await supabase
      .from('alunos')
      .select('id')
      .eq('unidade_id', input.unidadeId)
      .eq('emusys_student_id', String(input.emusysAlunoId))
      .maybeSingle();
    if (data?.id) return data.id;
  }

  return null;
}

async function resolveCursoId(
  supabase: SupabaseClientLike,
  unidadeId: string,
  disciplinaId: number | null
): Promise<number | null> {
  if (disciplinaId == null) return null;
  const { data } = await supabase
    .from('curso_emusys_depara')
    .select('curso_id')
    .eq('unidade_id', unidadeId)
    .eq('emusys_disciplina_id', disciplinaId)
    .maybeSingle();
  return data?.curso_id ?? null;
}

async function resolveProfessorId(
  supabase: SupabaseClientLike,
  unidadeId: string,
  professorEmusysId: number | null
): Promise<number | null> {
  if (professorEmusysId == null || professorEmusysId <= 0) return null;
  const { data: vinculo, error: vinculoError } = await supabase
    .from('professores_unidades')
    .select('professor_id, emusys_ativo, validacao_status, identidade_historica_valida')
    .eq('unidade_id', unidadeId)
    .eq('emusys_id', professorEmusysId)
    .maybeSingle();
  if (vinculoError) throw vinculoError;
  if (!vinculo?.professor_id) return null;
  if (vinculo.identidade_historica_valida === true) {
    return vinculo.professor_id;
  }
  if (vinculo.emusys_ativo !== true || vinculo.validacao_status === 'ignorado') return null;

  const { data: professor, error: professorError } = await supabase
    .from('professores')
    .select('id')
    .eq('id', vinculo.professor_id)
    .eq('ativo', true)
    .maybeSingle();
  if (professorError) throw professorError;
  return professor?.id ?? null;
}

function resolveAlunoIdFromRefs(input: JornadaMatriculaInput, refs: JornadaReferenciaMaps): number | null {
  if (input.emusysMatriculaId != null) {
    const alunoId = refs.alunoIdPorMatriculaEmusys?.get(input.emusysMatriculaId);
    if (alunoId != null) return alunoId;
  }

  if (input.emusysAlunoId != null) {
    const alunoId = refs.alunoIdPorAlunoEmusys?.get(input.emusysAlunoId);
    if (alunoId != null) return alunoId;
  }

  return null;
}

export function buildJornadaRowsForUpsert(
  input: JornadaMatriculaInput,
  refs: JornadaReferenciaMaps = {}
): { rows: any[]; skipped: number } {
  if (input.disciplinas.length === 0) return { rows: [], skipped: 0 };

  const alunoId = resolveAlunoIdFromRefs(input, refs);
  const rows: any[] = [];
  let skipped = 0;

  for (const disciplina of input.disciplinas) {
    if (disciplina.matriculaDisciplinaId == null) {
      skipped += 1;
      continue;
    }

    const cursoId = disciplina.disciplinaId == null
      ? null
      : refs.cursoIdPorDisciplinaEmusys?.get(disciplina.disciplinaId) ?? null;
    const professorId = disciplina.professorEmusysId == null
      ? null
      : refs.professorIdPorProfessorEmusys?.get(disciplina.professorEmusysId) ?? null;

    rows.push({
      unidade_id: input.unidadeId,
      aluno_id: alunoId,
      emusys_aluno_id: input.emusysAlunoId,
      emusys_matricula_id: input.emusysMatriculaId,
      emusys_matricula_disciplina_id: disciplina.matriculaDisciplinaId,
      emusys_disciplina_id: disciplina.disciplinaId,
      curso_id: cursoId,
      curso_nome_emusys: disciplina.nome,
      professor_id: professorId,
      emusys_professor_id: disciplina.professorEmusysId,
      professor_nome_emusys: disciplina.nomeProfessor,
      status_matricula: statusCanonico(input.statusMatricula),
      qtd_contratos: input.qtdContratos,
      nr_aulas_contratadas: disciplina.nrAulasContratadas,
      nr_aulas_passadas: disciplina.nrAulasPassadas,
      nr_aulas_futuras: disciplina.nrAulasFuturas,
      proxima_aula_numero: calcularProximaAula(disciplina.nrAulasPassadas, disciplina.nrAulasFuturas),
      percentual_jornada: calcularPercentual(disciplina.nrAulasPassadas, disciplina.nrAulasContratadas),
      data_primeira_aula: parseDateTime(disciplina.dataHoraPrimeiraAula),
      data_ultima_aula: parseDateTime(disciplina.dataHoraUltimaAula),
      dia_semana: disciplina.diaSemana,
      horario: disciplina.horario,
      fonte_ultima_atualizacao: input.fonte,
      ultima_sincronizacao_emusys: new Date().toISOString(),
      payload_snapshot: {
        matricula: {
          id: input.emusysMatriculaId,
          aluno_id: input.emusysAlunoId,
          nome_aluno: input.nomeAluno,
          status: input.statusMatricula,
          qtd_contratos: input.qtdContratos,
        },
        disciplina: disciplina.raw,
      },
    });
  }

  return { rows, skipped };
}

export async function upsertJornadaMatriculaDisciplina(
  supabase: SupabaseClientLike,
  input: JornadaMatriculaInput
): Promise<{ updated: number; skipped: number; errors: string[] }> {
  const result = { updated: 0, skipped: 0, errors: [] as string[] };
  if (input.disciplinas.length === 0) return result;

  const alunoId = await resolveAlunoId(supabase, input);
  const rows: any[] = [];

  for (const disciplina of input.disciplinas) {
    if (disciplina.matriculaDisciplinaId == null) {
      result.skipped += 1;
      continue;
    }

    const [cursoId, professorId] = await Promise.all([
      resolveCursoId(supabase, input.unidadeId, disciplina.disciplinaId),
      resolveProfessorId(supabase, input.unidadeId, disciplina.professorEmusysId),
    ]);

    rows.push({
      unidade_id: input.unidadeId,
      aluno_id: alunoId,
      emusys_aluno_id: input.emusysAlunoId,
      emusys_matricula_id: input.emusysMatriculaId,
      emusys_matricula_disciplina_id: disciplina.matriculaDisciplinaId,
      emusys_disciplina_id: disciplina.disciplinaId,
      curso_id: cursoId,
      curso_nome_emusys: disciplina.nome,
      professor_id: professorId,
      emusys_professor_id: disciplina.professorEmusysId,
      professor_nome_emusys: disciplina.nomeProfessor,
      status_matricula: statusCanonico(input.statusMatricula),
      qtd_contratos: input.qtdContratos,
      nr_aulas_contratadas: disciplina.nrAulasContratadas,
      nr_aulas_passadas: disciplina.nrAulasPassadas,
      nr_aulas_futuras: disciplina.nrAulasFuturas,
      proxima_aula_numero: calcularProximaAula(disciplina.nrAulasPassadas, disciplina.nrAulasFuturas),
      percentual_jornada: calcularPercentual(disciplina.nrAulasPassadas, disciplina.nrAulasContratadas),
      data_primeira_aula: parseDateTime(disciplina.dataHoraPrimeiraAula),
      data_ultima_aula: parseDateTime(disciplina.dataHoraUltimaAula),
      dia_semana: disciplina.diaSemana,
      horario: disciplina.horario,
      fonte_ultima_atualizacao: input.fonte,
      ultima_sincronizacao_emusys: new Date().toISOString(),
      payload_snapshot: {
        matricula: {
          id: input.emusysMatriculaId,
          aluno_id: input.emusysAlunoId,
          status: input.statusMatricula,
          qtd_contratos: input.qtdContratos,
        },
        disciplina: disciplina.raw,
      },
    });
  }

  if (rows.length === 0) return result;

  const { error } = await supabase
    .from('aluno_jornada_matricula_disciplina')
    .upsert(rows, { onConflict: 'unidade_id,emusys_matricula_disciplina_id' });

  if (error) {
    result.errors.push(error.message);
    return result;
  }

  result.updated = rows.length;
  return result;
}

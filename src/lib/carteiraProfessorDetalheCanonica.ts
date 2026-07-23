import type { UnidadeId } from '@/components/ui/UnidadeFilter';

export interface JornadaCarteiraProfessor {
  unidade_id: string;
  unidade_nome: string | null;
  aluno_id: number;
  aluno_nome: string;
  emusys_aluno_id: number | string | null;
  curso_id: number | null;
  curso_nome: string | null;
  emusys_matricula_disciplina_id?: number | string | null;
  status_matricula: string;
  dia_semana: string | null;
  horario: string | null;
}

export interface AlunoOperacionalCarteira {
  id: number;
  nome: string;
  classificacao?: 'LAMK' | 'EMLA' | null;
  idade_atual?: number | null;
  valor_parcela?: number | null;
  tempo_permanencia_meses?: number | null;
  data_fim_contrato?: string | null;
  data_matricula?: string | null;
  status?: string | null;
  health_score?: 'verde' | 'amarelo' | 'vermelho' | null;
  telefone?: string | null;
  email?: string | null;
}

export interface AlunoCarteiraCanonico {
  id: number;
  pessoa_chave: string;
  nome: string;
  classificacao: 'LAMK' | 'EMLA';
  idade_atual: number | null;
  curso: string;
  cursos_lista: string[];
  cursos: { nome: string };
  dia_aula: string;
  horario_aula: string;
  valor_parcela: number;
  tempo_permanencia_meses: number;
  data_fim_contrato: string | null;
  status: string;
  health_score: 'verde' | 'amarelo' | 'vermelho' | null;
  telefone: string | null;
  email: string | null;
  unidade_id: string;
  unidade_nome: string;
  unidades: { nome: string };
}

export interface DistribuicaoCursoCanonica {
  curso: string;
  quantidade: number;
  percentual: number;
}

export interface OcupacaoTurmaCanonica {
  aluno_id: number;
  aluno_nome: string;
  aluno_status: string;
  turma_chave: string;
  turma_nome: string | null;
  curso_nome: string;
  sala_nome: string | null;
  dia_semana: string;
  horario_inicio: string;
}

interface ResultadoCarteiraProfessorCanonica {
  alunos: AlunoCarteiraCanonico[];
  distribuicaoCursos: DistribuicaoCursoCanonica[];
}

export interface ResumoClassificacaoCarteiraCanonica {
  total: number;
  lamk: number;
  emla: number;
  percentualLamk: number;
  percentualEmla: number;
}

const ORDEM_DIA: Record<string, number> = {
  Segunda: 1,
  'Segunda-feira': 1,
  Terça: 2,
  'Terça-feira': 2,
  Quarta: 3,
  'Quarta-feira': 3,
  Quinta: 4,
  'Quinta-feira': 4,
  Sexta: 5,
  'Sexta-feira': 5,
  Sábado: 6,
  Domingo: 7,
};

function chavePessoa(row: JornadaCarteiraProfessor): string {
  const identidade = row.emusys_aluno_id === null || row.emusys_aluno_id === undefined
    ? `local:${row.aluno_id}`
    : `emusys:${row.emusys_aluno_id}`;
  return `${row.unidade_id}:${identidade}`;
}

function valoresUnicos(valores: Array<string | null | undefined>): string[] {
  return [...new Set(valores.map((valor) => valor?.trim()).filter(Boolean) as string[])]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function horarioCurto(horario: string | null | undefined): string | null {
  if (!horario) return null;
  return horario.length >= 5 ? horario.substring(0, 5) : horario;
}

function calcularFimContrato(aluno?: AlunoOperacionalCarteira): string | null {
  if (aluno?.data_fim_contrato) return aluno.data_fim_contrato;
  if (!aluno?.data_matricula) return null;

  const dataMatricula = new Date(aluno.data_matricula);
  if (Number.isNaN(dataMatricula.getTime())) return null;

  const fimCalculado = new Date(dataMatricula);
  fimCalculado.setFullYear(fimCalculado.getFullYear() + 1);
  return fimCalculado.toISOString().split('T')[0];
}

function dataMaisProxima(datas: Array<string | null>): string | null {
  return datas
    .filter((data): data is string => Boolean(data))
    .sort((a, b) => a.localeCompare(b))[0] ?? null;
}

export function resumirClassificacaoCarteiraCanonica(
  alunos: AlunoCarteiraCanonico[],
): ResumoClassificacaoCarteiraCanonica {
  const total = alunos.length;
  const lamk = alunos.filter((aluno) => aluno.classificacao === 'LAMK').length;
  const emla = alunos.filter((aluno) => aluno.classificacao === 'EMLA').length;

  return {
    total,
    lamk,
    emla,
    percentualLamk: total > 0 ? (lamk / total) * 100 : 0,
    percentualEmla: total > 0 ? (emla / total) * 100 : 0,
  };
}

export function agruparCarteiraProfessorCanonica(
  jornadas: JornadaCarteiraProfessor[],
  alunosOperacionais: AlunoOperacionalCarteira[],
): ResultadoCarteiraProfessorCanonica {
  const alunosPorId = new Map(
    alunosOperacionais.map((aluno) => [Number(aluno.id), aluno]),
  );
  const jornadasPorPessoa = new Map<string, JornadaCarteiraProfessor[]>();

  jornadas
    .filter((jornada) => jornada.status_matricula === 'ativa')
    .forEach((jornada) => {
      const chave = chavePessoa(jornada);
      const atuais = jornadasPorPessoa.get(chave) || [];
      atuais.push(jornada);
      jornadasPorPessoa.set(chave, atuais);
    });

  const pessoas = new Map<string, AlunoCarteiraCanonico>();
  const pessoasPorCurso = new Map<string, Set<string>>();

  jornadasPorPessoa.forEach((jornadasPessoa, pessoaChave) => {
    const alunosPessoa = [...new Map(
      jornadasPessoa
        .map((jornada) => alunosPorId.get(Number(jornada.aluno_id)))
        .filter((aluno): aluno is AlunoOperacionalCarteira => Boolean(aluno))
        .map((aluno) => [Number(aluno.id), aluno]),
    ).values()];
    const principal = alunosPessoa.find((aluno) => aluno.status === 'ativo')
      ?? alunosPessoa[0];
    const primeiraJornada = jornadasPessoa[0];
    const cursos = valoresUnicos(jornadasPessoa.map((jornada) => jornada.curso_nome));
    const dias = valoresUnicos(jornadasPessoa.map((jornada) => jornada.dia_semana));
    const horarios = valoresUnicos(jornadasPessoa.map((jornada) => horarioCurto(jornada.horario)));

    cursos.forEach((curso) => {
      const chaves = pessoasPorCurso.get(curso) || new Set<string>();
      chaves.add(pessoaChave);
      pessoasPorCurso.set(curso, chaves);
    });

    const unidadeNome = primeiraJornada.unidade_nome || '-';
    const aluno: AlunoCarteiraCanonico = {
      id: Number(principal?.id ?? primeiraJornada.aluno_id),
      pessoa_chave: pessoaChave,
      nome: principal?.nome || primeiraJornada.aluno_nome,
      classificacao: principal?.classificacao || 'EMLA',
      idade_atual: principal?.idade_atual ?? null,
      curso: cursos.join(', ') || '-',
      cursos_lista: cursos,
      cursos: { nome: cursos.join(', ') || '-' },
      dia_aula: dias.join(', ') || '-',
      horario_aula: horarios.join(', ') || '-',
      // Financeiro e cadastro sao enriquecimentos; nunca definem a pessoa da carteira.
      valor_parcela: Math.max(0, ...alunosPessoa.map((item) => Number(item.valor_parcela) || 0)),
      tempo_permanencia_meses: Math.max(
        0,
        ...alunosPessoa.map((item) => Number(item.tempo_permanencia_meses) || 0),
      ),
      data_fim_contrato: dataMaisProxima(alunosPessoa.map(calcularFimContrato)),
      // A linha só existe aqui quando a jornada canônica está ativa. O status
      // cadastral local é enriquecimento e pode estar defasado/duplicado.
      status: 'ativo',
      health_score: principal?.health_score || null,
      telefone: alunosPessoa.find((item) => item.telefone)?.telefone || null,
      email: alunosPessoa.find((item) => item.email)?.email || null,
      unidade_id: primeiraJornada.unidade_id,
      unidade_nome: unidadeNome,
      unidades: { nome: unidadeNome },
    };

    pessoas.set(pessoaChave, aluno);
  });

  const alunos = [...pessoas.values()]
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const totalPessoas = alunos.length;
  const distribuicaoCursos = [...pessoasPorCurso.entries()]
    .map(([curso, chaves]) => ({
      curso,
      quantidade: chaves.size,
      percentual: totalPessoas > 0 ? (chaves.size / totalPessoas) * 100 : 0,
    }))
    .sort((a, b) => b.quantidade - a.quantidade || a.curso.localeCompare(b.curso, 'pt-BR'));

  return { alunos, distribuicaoCursos };
}

export function agruparOcupacoesTurmasProfessorCanonicas(
  jornadas: JornadaCarteiraProfessor[],
  cursosProjeto: Set<number>,
): OcupacaoTurmaCanonica[] {
  const ocupacoes = new Map<string, OcupacaoTurmaCanonica>();

  jornadas
    .filter((jornada) => jornada.status_matricula === 'ativa')
    .filter((jornada) => jornada.curso_id === null || !cursosProjeto.has(Number(jornada.curso_id)))
    .forEach((jornada) => {
      const cursoChave = jornada.curso_id === null
        ? (jornada.curso_nome || 'sem-curso').trim().toLocaleLowerCase('pt-BR')
        : String(jornada.curso_id);
      const horario = horarioCurto(jornada.horario) || '';
      const dia = jornada.dia_semana || '';
      const turmaChave = dia && horario
        ? `${cursoChave}:${dia}:${horario}`
        : `${cursoChave}:matricula:${jornada.emusys_matricula_disciplina_id ?? jornada.aluno_id}`;
      const pessoaChave = chavePessoa(jornada);
      const ocupacaoChave = `${pessoaChave}:${turmaChave}`;

      if (!ocupacoes.has(ocupacaoChave)) {
        ocupacoes.set(ocupacaoChave, {
          aluno_id: Number(jornada.aluno_id),
          aluno_nome: jornada.aluno_nome,
          aluno_status: 'ativo',
          turma_chave: turmaChave,
          turma_nome: null,
          curso_nome: jornada.curso_nome || 'Não informado',
          sala_nome: null,
          dia_semana: dia,
          horario_inicio: horario,
        });
      }
    });

  return [...ocupacoes.values()].sort((a, b) => (
    (ORDEM_DIA[a.dia_semana] ?? 9) - (ORDEM_DIA[b.dia_semana] ?? 9)
    || a.horario_inicio.localeCompare(b.horario_inicio)
    || a.aluno_nome.localeCompare(b.aluno_nome, 'pt-BR')
  ));
}

export async function buscarJornadasProfessorCanonicas({
  professorId,
  unidadeId,
}: {
  professorId: number;
  unidadeId: UnidadeId | string;
}): Promise<JornadaCarteiraProfessor[]> {
  const { supabase } = await import('@/lib/supabase');
  const { data, error } = await supabase
    .rpc('get_jornada_professor', { p_professor_id: professorId });

  if (error) throw error;

  return ((data || []) as JornadaCarteiraProfessor[])
    .filter((jornada) => unidadeId === 'todos' || jornada.unidade_id === unidadeId);
}

export async function buscarOcupacoesTurmasProfessorCanonicas({
  professorId,
  unidadeId,
}: {
  professorId: number;
  unidadeId: UnidadeId | string;
}): Promise<OcupacaoTurmaCanonica[]> {
  const jornadas = await buscarJornadasProfessorCanonicas({ professorId, unidadeId });
  const cursoIds = [...new Set(
    jornadas.map((jornada) => jornada.curso_id).filter((id): id is number => id !== null),
  )];
  const cursosProjeto = new Set<number>();

  if (cursoIds.length > 0) {
    const { supabase } = await import('@/lib/supabase');
    const { data, error } = await supabase
      .from('cursos')
      .select('id')
      .in('id', cursoIds)
      .eq('is_projeto_banda', true);
    if (error) throw error;
    (data || []).forEach((curso) => cursosProjeto.add(Number(curso.id)));
  }

  return agruparOcupacoesTurmasProfessorCanonicas(jornadas, cursosProjeto);
}

export async function buscarCarteiraProfessorDetalheCanonica({
  professorId,
  unidadeId,
}: {
  professorId: number;
  unidadeId: UnidadeId;
}): Promise<ResultadoCarteiraProfessorCanonica> {
  const jornadas = await buscarJornadasProfessorCanonicas({ professorId, unidadeId });
  const alunoIds = [...new Set(jornadas.map((jornada) => Number(jornada.aluno_id)))]
    .filter(Number.isFinite);

  if (alunoIds.length === 0) {
    return { alunos: [], distribuicaoCursos: [] };
  }

  const { supabase } = await import('@/lib/supabase');
  const { data: alunosData, error: alunosError } = await supabase
    .from('alunos')
    .select(`
      id, nome, classificacao, idade_atual, valor_parcela, tempo_permanencia_meses,
      data_fim_contrato, data_matricula, status, health_score, telefone, email
    `)
    .in('id', alunoIds);

  if (alunosError) throw alunosError;

  return agruparCarteiraProfessorCanonica(
    jornadas,
    (alunosData || []) as AlunoOperacionalCarteira[],
  );
}

/**
 * Regra ÚNICA de derivação dos campos operacionais do cadastro a partir do Emusys.
 *
 * POR QUE ESTE MÓDULO EXISTE
 * --------------------------
 * A partir de 2026-08-19 existem DUAS fontes de escrita para os mesmos campos de
 * `alunos`: o `sync-matriculas-emusys` (varredura diária de `GET /matriculas`) e o
 * webhook `matricula_alterada` (`processar-matricula-emusys`, tempo real).
 *
 * Duas fontes de escrita com regras diferentes para o mesmo campo já foi a causa-raiz
 * das duplicatas de renovação neste projeto: a competência era calculada de um jeito no
 * webhook e de outro no `FormRenovacao`, e nasciam duas linhas para a mesma renovação.
 * Para não repetir o erro, a derivação mora aqui e os dois lados chamam a MESMA função.
 *
 * ⚠️ Ao mudar qualquer regra abaixo, ela muda nos dois caminhos de uma vez — que é
 * exatamente a intenção. Nunca reimplementar do lado do chamador.
 *
 * ⚠️ As funções recebem a LISTA de disciplinas, não o objeto da matrícula: os dois
 * payloads têm formatos diferentes (`contrato_atual.disciplinas` na API,
 * `matricula.disciplinas` no webhook) e é o chamador quem sabe de onde tirar a lista.
 *
 * O QUE ESTE MÓDULO NÃO FAZ
 * -------------------------
 * Não deriva valor/desconto. A régua financeira (`analisarFinanceiroContrato`) depende
 * de `valor_mensalidade`, `desconto_fixo`, `desconto_condicional`, `nr_faturas` e do
 * flag de bolsa — campos que existem no contrato da API e **não** no payload do webhook,
 * que traz só um `valor` agregado de semântica ambígua. Derivar valor dali corromperia
 * MRR e ticket. Financeiro continua exclusivo do sync.
 */

/** Formato comum de disciplina — o mínimo que os dois payloads compartilham. */
export interface DisciplinaEmusys {
  disciplina_id?: number | string | null;
  nome_turma?: string | null;
  id_professor?: number | string | null;
}

export interface CamposDerivados {
  curso_id?: number;
  professor_atual_id?: number;
  dia_aula?: string;
  horario_aula?: string;
}

// ─── Normalização e comparação ──────────────────────────────────────────────

export function normalizarNomeParaComparacao(s: string): string {
  return (s || '').normalize('NFKD').replace(/[^\x00-\x7f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * "Quinta-feira", "Quinta feira", "Qui" e "Quinta" são o MESMO dia.
 * O Emusys manda a forma longa em `agendamentos.dia_da_semana_nome` e a abreviada
 * dentro de `nome_turma`; `alunos.dia_aula` guarda a forma curta.
 */
export function normalizarDiaParaComparacao(v: unknown): string {
  const s = normalizarNomeParaComparacao(String(v ?? ''));
  const semFeira = s.replace(/\s*-\s*feira$/, '').replace(/\s+feira$/, '');
  const mapa: Record<string, string> = {
    segunda: 'segunda', seg: 'segunda',
    terca: 'terca', ter: 'terca',
    quarta: 'quarta', qua: 'quarta',
    quinta: 'quinta', qui: 'quinta',
    sexta: 'sexta', sex: 'sexta',
    sabado: 'sabado', sab: 'sabado',
  };
  return mapa[semFeira] || semFeira;
}

/**
 * Igualdade POR CAMPO — não use `===` cru para comparar com o cadastro.
 *
 * ⚠️ `alunos.horario_aula` é `time` e volta do PostgREST como "16:00:00", enquanto o
 * Emusys manda "16:00". Comparar cru acusa divergência em 100% das linhas: medido em
 * 2026-08-19, 1.163 de 1.163 matrículas ativas "divergiam" no horário e 920 no dia;
 * normalizando, sobrava 1 e 52. É por isso que esta função existe.
 */
export function valoresIguaisParaCampo(campo: string, vNovo: unknown, vAtual: unknown): boolean {
  if (campo === 'dia_aula') {
    return normalizarDiaParaComparacao(vNovo) === normalizarDiaParaComparacao(vAtual);
  }
  if (campo === 'horario_aula') {
    return String(vNovo ?? '').slice(0, 5) === String(vAtual ?? '').slice(0, 5);
  }
  return String(vNovo) === String(vAtual ?? '');
}

// ─── Parsing do nome da turma ───────────────────────────────────────────────

/** "G_Ter_14" → "Terça". Devolve null quando o nome não segue o padrão. */
export function parseDiaDeTurma(nomeTurma: string): string | null {
  const partes = (nomeTurma || '').split('_');
  if (partes.length < 3) return null;
  const abrev = partes[partes.length - 2];
  const mapa: Record<string, string> = {
    Seg: 'Segunda', Ter: 'Terça', Qua: 'Quarta',
    Qui: 'Quinta', Sex: 'Sexta', Sab: 'Sábado',
  };
  return mapa[abrev] || null;
}

/** "G_Ter_14" → "14:00:00"; "X_Qua_1430" → "14:30:00". Null se não for horário. */
export function parseHorarioDeTurma(nomeTurma: string): string | null {
  const partes = (nomeTurma || '').split('_');
  if (partes.length < 3) return null;
  const ult = partes[partes.length - 1];
  if (!/^\d{1,4}$/.test(ult)) return null;
  let h: number, m = 0;
  if (ult.length <= 2) { h = parseInt(ult, 10); }
  else { h = parseInt(ult.slice(0, ult.length - 2), 10); m = parseInt(ult.slice(-2), 10); }
  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}

// ─── Curso e professor ──────────────────────────────────────────────────────

/**
 * Separa os cursos da matrícula em regulares e de banda, e sinaliza disciplina sem
 * de/para. Banda sai à parte porque `is_projeto_banda` exclui o curso de médias de
 * turma, carteira e score do professor — não pode virar o curso comercial do aluno.
 */
export function resolverCursoDasDisciplinas(
  disciplinas: DisciplinaEmusys[],
  depara: Map<number, number | null>,
  banda: Set<number>,
): { cursos: number[]; cursosBanda: number[]; naoMapeada: number | null } {
  const cursos: number[] = [];
  const cursosBanda: number[] = [];
  let naoMapeada: number | null = null;
  for (const d of (disciplinas || [])) {
    const did = Number(d.disciplina_id);
    if (!depara.has(did)) { naoMapeada = did; continue; }
    const cid = depara.get(did);
    if (cid == null) continue;
    if (banda.has(cid)) {
      if (!cursosBanda.includes(cid)) cursosBanda.push(cid);
      continue;
    }
    if (!cursos.includes(cid)) cursos.push(cid);
  }
  return { cursos, cursosBanda, naoMapeada };
}

export const CURSO_MUSICALIZACAO_PREPARATORIA_ID = 40;

/**
 * `/matriculas` expõe disciplinas/turmas internas. Em Musicalização Preparatória a
 * disciplina pode ser Teclado/Piano/Bateria, mas o curso comercial segue sendo MP —
 * sobrescrever trocaria o curso do aluno por um detalhe interno da grade.
 */
export function devePreservarCursoBase(cursoAtualAluno: unknown, cursoSugerido: number): boolean {
  return Number(cursoAtualAluno) === CURSO_MUSICALIZACAO_PREPARATORIA_ID
    && Number(cursoSugerido) !== CURSO_MUSICALIZACAO_PREPARATORIA_ID;
}

/** Primeiro vínculo de professor reconhecido, na ordem em que o Emusys mandou. */
export function resolverProfessorDasDisciplinas(
  disciplinas: DisciplinaEmusys[],
  profMap: Map<number, number>,
): number | null {
  for (const d of (disciplinas || [])) {
    const eid = Number(d.id_professor);
    if (profMap.has(eid)) return profMap.get(eid)!;
  }
  return null;
}

// ─── Derivação completa ─────────────────────────────────────────────────────

export interface EntradaDerivacao {
  disciplinas: DisciplinaEmusys[];
  /** disciplina_id do Emusys -> curso_id local */
  deparaCurso: Map<number, number | null>;
  /** curso_id local que é projeto/banda */
  cursosBanda: Set<number>;
  /** id do professor no Emusys -> professor_id local */
  professorPorEmusysId: Map<number, number>;
  /** curso atual do aluno; desempata a turma quando ele tem mais de uma disciplina */
  cursoAtualAluno?: number | null;
}

/**
 * Deriva curso, professor, dia e horário a partir das disciplinas do Emusys.
 *
 * ⚠️ Dia e horário saem do `nome_turma`, e NÃO de `agendamentos.horario` — mesmo o
 * webhook trazendo o horário pronto. O motivo é paridade: o sync só enxerga
 * `nome_turma` (a API não devolve agendamentos), então usar o campo direto no webhook
 * faria as duas fontes gravarem valores derivados de origens diferentes, que é
 * justamente o que este módulo existe para impedir.
 *
 * ⚠️ Só decide quando NÃO há ambiguidade: um único curso regular, um único dia, um
 * único horário. Vários cursos ou turmas divergentes não forçam nada — quem resolve
 * isso é a fila da Conciliação, com decisão humana.
 */
export function derivarCamposCadastro(entrada: EntradaDerivacao): CamposDerivados {
  const { disciplinas, deparaCurso, cursosBanda, professorPorEmusysId, cursoAtualAluno } = entrada;
  const derivados: CamposDerivados = {};
  const lista = Array.isArray(disciplinas) ? disciplinas : [];
  if (lista.length === 0) return derivados;

  const { cursos } = resolverCursoDasDisciplinas(lista, deparaCurso, cursosBanda);
  if (cursos.length === 1 && !devePreservarCursoBase(cursoAtualAluno, cursos[0])) {
    derivados.curso_id = cursos[0];
  }

  const profId = resolverProfessorDasDisciplinas(lista, professorPorEmusysId);
  if (profId != null) derivados.professor_atual_id = profId;

  // Dia/horário: prefere a turma da disciplina que casa com o curso do aluno
  // (aluno multi-curso tem várias disciplinas e só uma é a desta matrícula).
  let turmasAlvo = lista
    .filter((d) => cursoAtualAluno != null && deparaCurso.get(Number(d.disciplina_id)) === Number(cursoAtualAluno))
    .map((d) => d.nome_turma)
    .filter((t): t is string => Boolean(t));
  if (turmasAlvo.length === 0) {
    turmasAlvo = lista.map((d) => d.nome_turma).filter((t): t is string => Boolean(t));
  }

  const dias = new Set(turmasAlvo.map(parseDiaDeTurma).filter(Boolean));
  const horas = new Set(turmasAlvo.map(parseHorarioDeTurma).filter(Boolean));
  if (dias.size === 1) derivados.dia_aula = [...dias][0] as string;
  if (horas.size === 1) derivados.horario_aula = [...horas][0] as string;

  return derivados;
}

// ─── Carregamento dos mapas de apoio ────────────────────────────────────────

export interface MapasCadastro {
  /** curso_id local que é projeto/banda */
  banda: Set<number>;
  /** disciplina_id do Emusys -> curso_id local, por unidade */
  depara: Map<number, number | null>;
  /** professor do Emusys -> professor local, SÓ vínculos operacionais */
  profMap: Map<number, number>;
  /** idem, incluindo identidade histórica — para escrever jornada, não cadastro */
  profMapJornada: Map<number, number>;
}

/**
 * Carrega de/para de curso, cursos de banda e vínculos de professor de uma unidade.
 *
 * ⚠️ `profMap` (cadastro) exige vínculo **operacional**: `emusys_ativo`, validação não
 * ignorada e professor ativo. `profMapJornada` aceita também identidade histórica,
 * porque a jornada registra o passado — nunca use o de jornada para escrever
 * `alunos.professor_atual_id`, ou um professor desligado volta a ser o atual.
 */
export async function carregarMapasCadastro(supabase: any, unidadeId: string): Promise<MapasCadastro> {
  const [{ data: cursosBanda }, { data: dep }, { data: prof }] = await Promise.all([
    supabase.from('cursos').select('id').eq('is_projeto_banda', true),
    supabase.from('curso_emusys_depara').select('emusys_disciplina_id, curso_id').eq('unidade_id', unidadeId),
    supabase
      .from('professores_unidades')
      .select(`
        emusys_id,
        professor_id,
        emusys_ativo,
        validacao_status,
        identidade_historica_valida,
        professores:professor_id (ativo)
      `)
      .eq('unidade_id', unidadeId)
      .not('emusys_id', 'is', null),
  ]);

  const banda = new Set<number>((cursosBanda || []).map((c: any) => c.id));
  const depara = new Map<number, number | null>((dep || []).map((d: any) => [d.emusys_disciplina_id, d.curso_id]));

  const profMap = new Map<number, number>();
  const profMapJornada = new Map<number, number>();
  for (const vinculo of prof || []) {
    const emusysId = Number(vinculo?.emusys_id);
    if (!Number.isInteger(emusysId) || emusysId <= 0) continue;

    const relacaoProfessor = Array.isArray(vinculo?.professores) ? vinculo.professores[0] : vinculo?.professores;
    const historico = vinculo?.identidade_historica_valida === true;
    const operacional = vinculo?.emusys_ativo === true
      && vinculo?.validacao_status !== 'ignorado'
      && relacaoProfessor?.ativo === true;

    if (operacional) profMap.set(emusysId, vinculo.professor_id);
    if (operacional || historico) profMapJornada.set(emusysId, vinculo.professor_id);
  }

  return { banda, depara, profMap, profMapJornada };
}

/** Campos que uma decisão humana protegeu contra a fonte externa. */
export async function carregarCamposFixados(supabase: any, alunoId: number): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('matriculas_campos_fixados')
    .select('campo')
    .eq('aluno_id', alunoId);
  // Falha aqui NÃO pode virar "nenhum campo fixado": isso sobrescreveria decisão
  // humana. Propaga para o chamador abortar a escrita.
  if (error) throw error;
  return new Set<string>((data || []).map((linha: any) => linha.campo));
}

/**
 * Monta o patch final: só o que mudou de verdade e não está protegido por decisão
 * humana. Devolve `{}` quando não há nada a escrever — o chamador deve pular o UPDATE.
 *
 * ⚠️ `camposFixados` vem de `matriculas_campos_fixados`: se alguém clicou "Manter LA
 * Report" na Conciliação, o campo NUNCA pode ser sobrescrito por fonte externa.
 */
export function montarPatchCadastro(
  derivados: CamposDerivados,
  alunoAtual: Record<string, unknown>,
  camposFixados: Set<string>,
): { patch: Record<string, unknown>; diffs: Record<string, { de: unknown; para: unknown }> } {
  const patch: Record<string, unknown> = {};
  const diffs: Record<string, { de: unknown; para: unknown }> = {};

  for (const [campo, valorNovo] of Object.entries(derivados)) {
    if (valorNovo == null) continue;
    if (camposFixados.has(campo)) continue;
    const valorAtual = alunoAtual?.[campo];
    if (valoresIguaisParaCampo(campo, valorNovo, valorAtual)) continue;
    patch[campo] = valorNovo;
    diffs[campo] = { de: valorAtual ?? null, para: valorNovo };
  }

  return { patch, diffs };
}

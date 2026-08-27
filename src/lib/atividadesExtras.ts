type Relation<T> = T | T[] | null | undefined;

type CursoLike = {
  nome?: string | null;
  is_projeto_banda?: boolean | null;
  is_coral?: boolean | null;
};

function firstRelation<T>(value: Relation<T>): T | null {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function normalizarTexto(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function cursoDeLinha(row: any): CursoLike | null {
  const cursoDireto = firstRelation<CursoLike>(row?.cursos);
  if (cursoDireto) return cursoDireto;

  const aluno = firstRelation<any>(row?.alunos);
  const cursoAluno = firstRelation<CursoLike>(aluno?.cursos);
  if (cursoAluno) return cursoAluno;

  if (row?.curso_nome) return { nome: row.curso_nome };
  if (row?.curso) return { nome: row.curso };

  return null;
}

export function isAtividadeExtraAcademica(row: any): boolean {
  const curso = cursoDeLinha(row);
  const nome = normalizarTexto(curso?.nome);

  return (
    curso?.is_projeto_banda === true ||
    curso?.is_coral === true ||
    nome.includes('canto coral') ||
    nome.includes('power kids') ||
    nome.includes('minha banda') ||
    nome.includes('garageband') ||
    nome.includes('percussion kids')
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Bolsista e aluno de banda NÃO CONTAM EM NADA, exceto número de alunos ativos e
// de matrículas (regra do Alf, 27/08/2026).
//
// Ficam de fora de: financeiro (ticket/MRR/faturamento), evasão, churn, LTV,
// taxa de renovação, score do professor. "Senão isso infla o programa deles" —
// e inflava mesmo: as renovações de banda/bolsista levavam CG/jul-26 de 77,8%
// para 81,8%, cruzando a meta de 80% por cima.
//
// Base documental: REGRAS-DE-NEGOCIO §3.5 (atividade extra), §3.6 (a tabela de
// tipos_matricula marca "Churn ✘" para os três códigos) e §3.7 (bolsista).
//
// São DUAS portas de saída, e é preciso as duas:
//  1. o CURSO é atividade extra (banda/coral) — `isAtividadeExtraAcademica`;
//  2. o TIPO DE MATRÍCULA é bolsista/banda — `isBolsistaOuBandaMatricula`.
// A porta 2 é a que faltava: filtrar só por curso deixa passar bolsista em curso
// REGULAR (ex.: Musicalização para Bebês), que é a maioria dos casos.
//
// ⚠️ Espelha `public.movimentacao_conta_no_churn_v1` no banco (migrations
// 20260827120000 e 20260827160000). Mudou aqui, muda lá — duas fontes com regras
// próprias para o mesmo número foi a causa-raiz das duplicatas de renovação.
const TIPOS_MATRICULA_FORA_DOS_KPIS = new Set(['BOLSISTA_INT', 'BOLSISTA_PARC', 'BANDA']);
const TIPOS_MATRICULA_FORA_DOS_KPIS_IDS = new Set([3, 4, 5]);

export function isBolsistaOuBandaMatricula(row: any): boolean {
  const aluno = firstRelation<any>(row?.alunos) || row;

  const codigo = normalizarTexto(
    firstRelation<any>(aluno?.tipos_matricula)?.codigo ?? aluno?.tipo_matricula_codigo,
  ).toUpperCase();
  if (codigo) return TIPOS_MATRICULA_FORA_DOS_KPIS.has(codigo);

  const id = Number(aluno?.tipo_matricula_id);
  if (Number.isFinite(id) && id > 0) return TIPOS_MATRICULA_FORA_DOS_KPIS_IDS.has(id);

  // ⚠️ Fail-open de propósito: sem saber o tipo, a movimentação CONTA. Existe
  // movimentação sem vínculo de aluno (lançamento manual antigo, 40 linhas em
  // 2026) e sumir com retenção real em silêncio é pior do que o defeito que esta
  // regra corrige. A consulta que quiser precisão traz `tipo_matricula_id`.
  return false;
}

/** Esta movimentação entra em KPI de retenção/financeiro? */
export function contaNosKpis(row: any): boolean {
  return !isAtividadeExtraAcademica(row) && !isBolsistaOuBandaMatricula(row);
}

/**
 * Filtro canônico de retenção: vale para TODOS os tipos de movimentação
 * (renovação, não renovação, evasão, aviso prévio, trancamento).
 *
 * ⚠️ Até 27/08/2026 esta função filtrava só atividade extra, e havia um segundo
 * filtro para saídas. A separação caiu quando o Alf esclareceu que bolsista e
 * banda não contam em nada: com uma regra só, todo chamador fica correto de uma
 * vez — inclusive os que ninguém lembraria de atualizar.
 */
export function filtrarRetencaoCanonica<T extends any>(rows: T[] | null | undefined): T[] {
  return (rows || []).filter(row => contaNosKpis(row));
}

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

export function filtrarRetencaoCanonica<T extends any>(rows: T[] | null | undefined): T[] {
  return (rows || []).filter(row => !isAtividadeExtraAcademica(row));
}

// ─────────────────────────────────────────────────────────────────────────────
// Evasão / churn: além da atividade extra (acima), fica de fora BOLSISTA e BANDA
// pelo TIPO DE MATRÍCULA.
//
// Regra já estabelecida em docs/REGRAS-DE-NEGOCIO.md §3.6 (a tabela de
// tipos_matricula marca "Churn ✘" para BOLSISTA_INT, BOLSISTA_PARC e BANDA) e
// §3.7 ("bolsista integral não entra em ticket/MRR/LTV/churn").
//
// ⚠️ Não basta o filtro por CURSO: bolsista em curso REGULAR (ex.: Musicalização
// para Bebês) passava batido. E o churn ficava incoerente, porque o denominador
// é `alunos_pagantes`, de onde bolsista já sai por definição — numerador e
// denominador falavam de universos diferentes.
//
// ⚠️ Espelha `public.movimentacao_conta_no_churn_v1` no banco (migration
// 20260827120000). Mudou aqui, muda lá: duas fontes com regras próprias para o
// mesmo número é exatamente como nasceram as duplicatas de renovação.
//
// ⚠️ Isto NÃO se aplica a renovação. `filtrarRetencaoCanonica` continua sendo o
// filtro da taxa de renovação — bolsista que renova segue contando, porque a
// §5.4 não o exclui e mudar isso mexeria num indicador que ninguém pediu.
const TIPOS_MATRICULA_FORA_DO_CHURN = new Set(['BOLSISTA_INT', 'BOLSISTA_PARC', 'BANDA']);
const TIPOS_MATRICULA_FORA_DO_CHURN_IDS = new Set([3, 4, 5]);

export function isBolsistaOuBandaMatricula(row: any): boolean {
  const aluno = firstRelation<any>(row?.alunos) || row;

  const codigo = normalizarTexto(
    firstRelation<any>(aluno?.tipos_matricula)?.codigo ?? aluno?.tipo_matricula_codigo,
  ).toUpperCase();
  if (codigo) return TIPOS_MATRICULA_FORA_DO_CHURN.has(codigo);

  const id = Number(aluno?.tipo_matricula_id);
  if (Number.isFinite(id) && id > 0) return TIPOS_MATRICULA_FORA_DO_CHURN_IDS.has(id);

  // ⚠️ Fail-open de propósito: sem saber o tipo, a saída CONTA. Movimentação sem
  // vínculo de aluno existe (lançamento manual antigo) e sumir com evasão real em
  // silêncio é pior do que o defeito que esta regra corrige.
  return false;
}

/** A saída entra no KPI de evasão/churn? */
export function contaNoChurn(row: any): boolean {
  return !isAtividadeExtraAcademica(row) && !isBolsistaOuBandaMatricula(row);
}

export function filtrarEvasoesCanonicas<T extends any>(rows: T[] | null | undefined): T[] {
  return (rows || []).filter(row => contaNoChurn(row));
}

const TIPOS_DE_SAIDA = new Set(['evasao', 'nao_renovacao']);

/**
 * Filtro para uma lista MISTA de movimentações (renovação, evasão, aviso, …) que
 * vai alimentar KPI de retenção.
 *
 * Aplica as duas regras no escopo certo de cada uma, que é o motivo de existir:
 *  - atividade extra (banda/coral) sai de TODOS os tipos (§3.5);
 *  - bolsista/banda por tipo de matrícula sai só de `evasao`/`nao_renovacao`
 *    (§3.6/§3.7 falam de churn; a taxa de renovação da §5.4 não os exclui).
 *
 * Filtrar a lista inteira com `filtrarEvasoesCanonicas` tiraria bolsista também
 * das renovações e mexeria na taxa de renovação sem ninguém ter pedido.
 */
export function filtrarMovimentacoesRetencaoKpi<T extends any>(rows: T[] | null | undefined): T[] {
  return (rows || []).filter((row: any) => {
    if (isAtividadeExtraAcademica(row)) return false;
    if (TIPOS_DE_SAIDA.has(String(row?.tipo)) && isBolsistaOuBandaMatricula(row)) return false;
    return true;
  });
}

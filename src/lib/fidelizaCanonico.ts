import { fetchKPIsAlunosCanonicos } from '@/hooks/useKPIsAlunosCanonicos';
import { supabase } from '@/lib/supabase';
import {
  aplicarFallbacksRetencao,
  calcularReajusteMedioCanonico,
  calcularRetencaoOperacionalCanonica,
  pagantesMapFromKPIsCanonicos,
  unidadesFromKPIsCanonicos,
  type MovimentacaoRetencaoRow,
} from '@/lib/retencaoOperacionalCanonica';

interface FarmerFidelizaLike {
  unidade_id: string;
  unidade_nome: string;
  metricas: {
    churn_rate: number;
    inadimplencia_pct: number;
    taxa_renovacao: number;
    reajuste_medio: number;
    vendas_lojinha: number;
    churn_bruto?: {
      evasoes: number;
      alunos_base: number;
      meses?: Array<{ mes: number; evasoes: number; alunos: number; taxa: number }>;
    };
    renovacao_bruto?: { renovados: number; total_contratos: number };
  };
}

interface AplicarMetricasParams<T extends FarmerFidelizaLike> {
  farmers: T[];
  ano: number;
  trimestre: number;
  unidadeId?: string | null;
}

function inicioMes(ano: number, mes: number): string {
  return `${ano}-${String(mes).padStart(2, '0')}-01`;
}

function fimMes(ano: number, mes: number): string {
  const dia = new Date(ano, mes, 0).getDate();
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

function mesesDoTrimestre(trimestre: number) {
  const inicio = (trimestre - 1) * 3 + 1;
  return [inicio, inicio + 1, inicio + 2];
}

async function fetchMovimentacoesTrimestre(
  ano: number,
  trimestre: number,
  unidadeId?: string | null
): Promise<MovimentacaoRetencaoRow[]> {
  const meses = mesesDoTrimestre(trimestre);
  const inicio = inicioMes(ano, meses[0]);
  const fim = fimMes(ano, meses[2]);

  let query = supabase
    .from('movimentacoes_admin')
    .select(`
      id, aluno_id, aluno_nome, unidade_id, tipo, data, competencia_referencia,
      renovacao_primeira_aula_novo_ciclo, renovacao_status, renovacao_antecipada, mes_saida,
      valor_parcela_evasao, valor_parcela_anterior, valor_parcela_novo,
      tempo_permanencia_meses,
      forma_pagamento_id, agente_comercial,
      tipo_evasao, motivo, observacoes, professor_id, curso_id
    `)
    .in('tipo', ['renovacao', 'nao_renovacao', 'aviso_previo', 'evasao', 'trancamento'])
    .or(`and(data.gte.${inicio},data.lte.${fim}),and(competencia_referencia.gte.${inicio},competencia_referencia.lte.${fim})`)
    .order('data', { ascending: false });

  if (unidadeId) query = query.eq('unidade_id', unidadeId);

  const { data, error } = await query;
  if (error) throw error;

  const movimentacoes = (data || []) as MovimentacaoRetencaoRow[];
  const alunoIds = [...new Set(
    movimentacoes
      .map(mov => mov.aluno_id)
      .filter((id): id is number | string => id !== null && id !== undefined)
      .map(String)
  )];
  const cursoIds = [...new Set(
    movimentacoes
      .map(mov => mov.curso_id)
      .filter((id): id is number | string => id !== null && id !== undefined)
      .map(String)
  )];

  const [alunosResult, cursosResult] = await Promise.all([
    alunoIds.length > 0
      ? supabase
          .from('alunos')
          .select(`
            id, valor_parcela, data_matricula, data_saida,
            tipo_matricula_id, is_segundo_curso, classificacao,
            cursos:curso_id!left(nome, is_projeto_banda),
            tipos_matricula:tipo_matricula_id!left(codigo)
          `)
          .in('id', alunoIds)
      : Promise.resolve({ data: [], error: null }),
    cursoIds.length > 0
      ? supabase
          .from('cursos')
          .select('id, nome, is_projeto_banda')
          .in('id', cursoIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (alunosResult.error) throw alunosResult.error;
  if (cursosResult.error) throw cursosResult.error;

  const alunosMap = new Map((alunosResult.data || []).map((aluno: any) => [String(aluno.id), aluno]));
  const cursosMap = new Map((cursosResult.data || []).map((curso: any) => [String(curso.id), curso]));

  return movimentacoes.map(mov => {
    const aluno = mov.aluno_id !== null && mov.aluno_id !== undefined
      ? alunosMap.get(String(mov.aluno_id)) || null
      : null;
    const curso = mov.curso_id !== null && mov.curso_id !== undefined
      ? cursosMap.get(String(mov.curso_id)) || null
      : null;

    return aplicarFallbacksRetencao({
      ...mov,
      alunos: aluno,
      curso_nome: curso?.nome || null,
      cursos: curso ? { nome: curso.nome, is_projeto_banda: curso.is_projeto_banda } : null,
    });
  });
}

function media(values: number[]) {
  return values.length > 0 ? values.reduce((acc, value) => acc + value, 0) / values.length : 0;
}

export async function aplicarMetricasFidelizaCanonicas<T extends FarmerFidelizaLike>({
  farmers,
  ano,
  trimestre,
  unidadeId,
}: AplicarMetricasParams<T>): Promise<T[]> {
  if (farmers.length === 0) return farmers;

  const unidadeFiltro = unidadeId || null;
  const meses = mesesDoTrimestre(trimestre);
  const [kpisPorMes, movimentacoes] = await Promise.all([
    Promise.all(meses.map(mes => fetchKPIsAlunosCanonicos({
      unidadeId: unidadeFiltro || 'todos',
      ano,
      mes,
    }))),
    fetchMovimentacoesTrimestre(ano, trimestre, unidadeFiltro),
  ]);

  return farmers.map(farmer => {
    const unidadeRows = kpisPorMes
      .flatMap(kpis => kpis.porUnidade)
      .filter(row => row.unidade_id === farmer.unidade_id);

    const churnMeses = unidadeRows.map(row => row.churnRate);
    const inadimplenciaMeses = unidadeRows.map(row => row.inadimplencia);

    const retencaoMeses = meses.map(mes => {
      const kpisMes = kpisPorMes[meses.indexOf(mes)];
      const rowsUnidade = kpisMes.porUnidade.filter(row => row.unidade_id === farmer.unidade_id);

      return calcularRetencaoOperacionalCanonica({
        movimentacoes,
        unidades: unidadesFromKPIsCanonicos(rowsUnidade),
        alunosPagantesPorUnidade: pagantesMapFromKPIsCanonicos(rowsUnidade),
        ano,
        mes,
      })[0];
    }).filter(Boolean);

    const renovacoesRealizadas = retencaoMeses.reduce((acc, row) => acc + row.renovacoes_realizadas, 0);
    const renovacoesPrevistas = retencaoMeses.reduce((acc, row) => acc + row.renovacoes_previstas, 0);
    const totalEvasoes = retencaoMeses.reduce((acc, row) => acc + row.total_evasoes, 0);
    const baseAlunos = retencaoMeses.reduce((acc, row) => acc + row.base_alunos_pagantes, 0);
    const taxaRenovacao = renovacoesPrevistas > 0
      ? (renovacoesRealizadas / renovacoesPrevistas) * 100
      : 0;

    const movimentacoesUnidade = movimentacoes.filter(mov => String(mov.unidade_id || '') === farmer.unidade_id);
    const reajuste = calcularReajusteMedioCanonico(movimentacoesUnidade);

    return {
      ...farmer,
      metricas: {
        ...farmer.metricas,
        churn_rate: Number(media(churnMeses).toFixed(2)),
        inadimplencia_pct: Number(media(inadimplenciaMeses).toFixed(2)),
        taxa_renovacao: Number(taxaRenovacao.toFixed(2)),
        reajuste_medio: Number(reajuste.media.toFixed(2)),
        churn_bruto: {
          evasoes: totalEvasoes,
          alunos_base: Math.round(baseAlunos / Math.max(retencaoMeses.length, 1)),
          meses: retencaoMeses.map(row => ({
            mes: row.mes,
            evasoes: row.total_evasoes,
            alunos: row.base_alunos_pagantes,
            taxa: Number(row.taxa_evasao.toFixed(2)),
          })),
        },
        renovacao_bruto: {
          renovados: renovacoesRealizadas,
          total_contratos: renovacoesPrevistas,
        },
      },
    };
  });
}

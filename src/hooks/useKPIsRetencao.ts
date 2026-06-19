import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchKPIsAlunosCanonicos } from '@/hooks/useKPIsAlunosCanonicos';
import {
  aplicarFallbacksRetencao,
  calcularRetencaoOperacionalCanonica,
  consolidarRetencaoOperacional,
  pagantesMapFromKPIsCanonicos,
  unidadesFromKPIsCanonicos,
  type MovimentacaoRetencaoRow,
  type RetencaoOperacionalPorUnidade,
} from '@/lib/retencaoOperacionalCanonica';
import { filtrarRetencaoCanonica } from '@/lib/atividadesExtras';

export interface KPIsRetencao extends RetencaoOperacionalPorUnidade {}

export interface MotivoSaida {
  name: string;
  value: number;
}

export interface EvasaoPorProfessor {
  id: number;
  nome: string;
  valor: number;
}

interface UseKPIsRetencaoResult {
  data: KPIsRetencao | null;
  dataByUnidade: KPIsRetencao[];
  motivosSaida: MotivoSaida[];
  evasoesPorProfessor: EvasaoPorProfessor[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

function inicioMes(ano: number, mes: number): string {
  return `${ano}-${String(mes).padStart(2, '0')}-01`;
}

function fimMes(ano: number, mes: number): string {
  const dia = new Date(ano, mes, 0).getDate();
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

async function fetchMovimentacoesRetencao(
  unidadeId: string | 'todos',
  ano: number,
  mes: number
): Promise<MovimentacaoRetencaoRow[]> {
  const startDate = inicioMes(ano, mes);
  const endDate = fimMes(ano, mes);
  const avisoAno = mes === 12 ? ano + 1 : ano;
  const avisoMes = mes === 12 ? 1 : mes + 1;
  const avisoStartDate = inicioMes(avisoAno, avisoMes);
  const avisoEndDate = fimMes(avisoAno, avisoMes);

  const selectFields = `
    id, aluno_id, aluno_nome, unidade_id, tipo, data, competencia_referencia,
    renovacao_primeira_aula_novo_ciclo, renovacao_status, renovacao_antecipada, mes_saida,
    valor_parcela_evasao, valor_parcela_anterior, valor_parcela_novo,
    tempo_permanencia_meses,
    forma_pagamento_id, agente_comercial,
    tipo_evasao, motivo, observacoes, professor_id, curso_id,
    cursos:curso_id!left(nome, is_projeto_banda)
  `;

  let query = supabase
    .from('movimentacoes_admin')
    .select(selectFields)
    .in('tipo', ['renovacao', 'nao_renovacao', 'aviso_previo', 'evasao', 'trancamento'])
    .or(`and(data.gte.${startDate},data.lte.${endDate}),and(competencia_referencia.gte.${startDate},competencia_referencia.lte.${endDate})`)
    .order('data', { ascending: false });

  let avisosRetroativosQuery = supabase
    .from('movimentacoes_admin')
    .select(selectFields)
    .eq('tipo', 'aviso_previo')
    .gte('mes_saida', avisoStartDate)
    .lte('mes_saida', avisoEndDate)
    .order('data', { ascending: false });

  if (unidadeId !== 'todos') {
    query = query.eq('unidade_id', unidadeId);
    avisosRetroativosQuery = avisosRetroativosQuery.eq('unidade_id', unidadeId);
  }

  const [movResult, avisosResult] = await Promise.all([query, avisosRetroativosQuery]);
  if (movResult.error) throw movResult.error;
  if (avisosResult.error) throw avisosResult.error;

  const ids = new Set((movResult.data || []).map(row => row.id));
  const movimentacoes = [
    ...((movResult.data || []) as MovimentacaoRetencaoRow[]),
    ...((avisosResult.data || []) as MovimentacaoRetencaoRow[]).filter(row => !ids.has(row.id)),
  ];
  const alunoIds = Array.from(new Set(
    movimentacoes
      .map(row => row.aluno_id)
      .filter(Boolean)
      .map(String)
  ));
  let alunosMap = new Map<string, any>();

  if (alunoIds.length > 0) {
    const { data: alunosData, error: alunosError } = await supabase
      .from('alunos')
      .select('id, valor_parcela, data_matricula, data_saida, tipo_matricula_id, is_segundo_curso')
      .in('id', alunoIds);
    if (alunosError) throw alunosError;

    alunosMap = new Map((alunosData || []).map((aluno: any) => [String(aluno.id), aluno]));
  }

  const enriquecidas = movimentacoes.map(row => aplicarFallbacksRetencao({
    ...row,
    alunos: row.aluno_id ? alunosMap.get(String(row.aluno_id)) || null : null,
  }));

  return filtrarRetencaoCanonica(enriquecidas) as MovimentacaoRetencaoRow[];
}

function rowsFromSnapshot(canonical: Awaited<ReturnType<typeof fetchKPIsAlunosCanonicos>>): KPIsRetencao[] {
  return canonical.porUnidade.map(row => ({
    unidade_id: row.unidade_id,
    unidade_nome: row.unidade_nome,
    ano: row.ano,
    mes: row.mes,
    total_evasoes: row.evasoes,
    evasoes_interrompidas: row.evasoes,
    avisos_previos: 0,
    transferencias: 0,
    taxa_evasao: row.churnRate,
    mrr_perdido: 0,
    renovacoes_previstas: 0,
    renovacoes_realizadas: 0,
    nao_renovacoes: 0,
    renovacoes_pendentes: 0,
    renovacoes_atrasadas: 0,
    taxa_renovacao: 0,
    taxa_nao_renovacao: 0,
    evasoes_por_motivo: {},
    evasoes_por_professor: {},
    base_alunos_pagantes: row.alunosPagantes,
  }));
}

function motivosFromRetencao(data: KPIsRetencao): MotivoSaida[] {
  return Object.entries(data.evasoes_por_motivo || {})
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

function professoresFromRetencao(data: KPIsRetencao): EvasaoPorProfessor[] {
  return Object.entries(data.evasoes_por_professor || {})
    .map(([nome, valor], index) => ({ id: index, nome, valor }))
    .sort((a, b) => b.valor - a.valor);
}

export function useKPIsRetencao(
  unidadeId: string | 'todos' = 'todos',
  ano?: number,
  mes?: number
): UseKPIsRetencaoResult {
  const [data, setData] = useState<KPIsRetencao | null>(null);
  const [dataByUnidade, setDataByUnidade] = useState<KPIsRetencao[]>([]);
  const [motivosSaida, setMotivosSaida] = useState<MotivoSaida[]>([]);
  const [evasoesPorProfessor, setEvasoesPorProfessor] = useState<EvasaoPorProfessor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const currentYear = ano || new Date().getFullYear();
  const currentMonth = mes || new Date().getMonth() + 1;

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const canonical = await fetchKPIsAlunosCanonicos({
        unidadeId,
        ano: currentYear,
        mes: currentMonth,
      });

      const rows = canonical.fonte === 'vivo'
        ? calcularRetencaoOperacionalCanonica({
            movimentacoes: await fetchMovimentacoesRetencao(unidadeId, currentYear, currentMonth),
            unidades: unidadesFromKPIsCanonicos(canonical.porUnidade),
            alunosPagantesPorUnidade: pagantesMapFromKPIsCanonicos(canonical.porUnidade),
            ano: currentYear,
            mes: currentMonth,
          })
        : rowsFromSnapshot(canonical);

      const consolidado = consolidarRetencaoOperacional(rows, unidadeId, currentYear, currentMonth);

      setDataByUnidade(rows);
      setData(consolidado);
      setMotivosSaida(motivosFromRetencao(consolidado));
      setEvasoesPorProfessor(professoresFromRetencao(consolidado));
    } catch (err) {
      console.error('Erro ao buscar KPIs de Retencao:', err);
      setError(err as Error);
      setData(null);
      setDataByUnidade([]);
      setMotivosSaida([]);
      setEvasoesPorProfessor([]);
    } finally {
      setIsLoading(false);
    }
  }, [unidadeId, currentYear, currentMonth]);


  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, dataByUnidade, motivosSaida, evasoesPorProfessor, isLoading, error, refetch: fetchData };
}

export default useKPIsRetencao;

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export interface KPIsRetencao {
  unidade_id: string;
  unidade_nome: string;
  ano: number;
  mes: number;
  total_evasoes: number;
  evasoes_interrompidas: number;
  avisos_previos: number;
  transferencias: number;
  taxa_evasao: number;
  mrr_perdido: number;
  renovacoes_previstas: number;
  renovacoes_realizadas: number;
  nao_renovacoes: number;
  renovacoes_pendentes: number;
  renovacoes_atrasadas: number;
  taxa_renovacao: number;
  taxa_nao_renovacao: number;
  evasoes_por_motivo: Record<string, number>;
  evasoes_por_professor: Record<string, number>;
}

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
      // Tentar buscar da view primeiro (filtrar por ano/mes)
      let query = supabase
        .from('vw_kpis_retencao_mensal')
        .select('*')
        .eq('ano', currentYear)
        .eq('mes', currentMonth);

      if (unidadeId !== 'todos') {
        query = query.eq('unidade_id', unidadeId);
      }

      const { data: kpisData, error: kpisError } = await query;

      if (kpisError) {
        // Fallback: buscar dados diretamente das tabelas
        await fetchFromTables();
        return;
      }

      if (kpisData && kpisData.length > 0) {
        setDataByUnidade(kpisData);

        // Consolidar dados
        const consolidado: KPIsRetencao = {
          unidade_id: unidadeId === 'todos' ? 'todos' : kpisData[0].unidade_id,
          unidade_nome: unidadeId === 'todos' ? 'Consolidado' : kpisData[0].unidade_nome,
          ano: currentYear,
          mes: currentMonth,
          total_evasoes: kpisData.reduce((acc, k) => acc + (k.total_evasoes || 0), 0),
          evasoes_interrompidas: kpisData.reduce((acc, k) => acc + (k.evasoes_interrompidas || 0), 0),
          avisos_previos: kpisData.reduce((acc, k) => acc + (k.avisos_previos || 0), 0),
          transferencias: kpisData.reduce((acc, k) => acc + (k.transferencias || 0), 0),
          taxa_evasao: kpisData.reduce((acc, k) => acc + (k.taxa_evasao || 0), 0) / kpisData.length,
          mrr_perdido: kpisData.reduce((acc, k) => acc + (k.mrr_perdido || 0), 0),
          renovacoes_previstas: kpisData.reduce((acc, k) => acc + (k.renovacoes_previstas || 0), 0),
          renovacoes_realizadas: kpisData.reduce((acc, k) => acc + (k.renovacoes_realizadas || 0), 0),
          nao_renovacoes: kpisData.reduce((acc, k) => acc + (k.nao_renovacoes || 0), 0),
          renovacoes_pendentes: kpisData.reduce((acc, k) => acc + (k.renovacoes_pendentes || 0), 0),
          renovacoes_atrasadas: kpisData.reduce((acc, k) => acc + (k.renovacoes_atrasadas || 0), 0),
          taxa_renovacao: kpisData.reduce((acc, k) => acc + (k.taxa_renovacao || 0), 0) / kpisData.length,
          taxa_nao_renovacao: kpisData.reduce((acc, k) => acc + (k.taxa_nao_renovacao || 0), 0) / kpisData.length,
          evasoes_por_motivo: {},
          evasoes_por_professor: {},
        };

        // Consolidar evasões por motivo
        const motivosMap = new Map<string, number>();
        kpisData.forEach(k => {
          if (k.evasoes_por_motivo) {
            Object.entries(k.evasoes_por_motivo).forEach(([motivo, count]) => {
              motivosMap.set(motivo, (motivosMap.get(motivo) || 0) + (count as number));
            });
          }
        });
        consolidado.evasoes_por_motivo = Object.fromEntries(motivosMap);

        // Consolidar evasões por professor
        const profsMap = new Map<string, number>();
        kpisData.forEach(k => {
          if (k.evasoes_por_professor) {
            Object.entries(k.evasoes_por_professor).forEach(([prof, count]) => {
              profsMap.set(prof, (profsMap.get(prof) || 0) + (count as number));
            });
          }
        });
        consolidado.evasoes_por_professor = Object.fromEntries(profsMap);

        setData(consolidado);

        // Formatar dados para gráficos
        setMotivosSaida(
          Array.from(motivosMap.entries())
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
        );

        setEvasoesPorProfessor(
          Array.from(profsMap.entries())
            .map(([nome, valor], index) => ({ id: index, nome, valor }))
            .sort((a, b) => b.valor - a.valor)
        );
      } else {
        await fetchFromTables();
      }

    } catch (err) {
      console.error('Erro ao buscar KPIs de Retenção:', err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [unidadeId, currentYear, currentMonth]);

  // Fallback: buscar dados diretamente das tabelas
  const fetchFromTables = async () => {
    try {
      const startDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
      const endDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-31`;

      // Buscar evasões - query simplificada
      let evasoesQuery = supabase
        .from('evasoes_v2')
        .select('*')
        .gte('data_evasao', startDate)
        .lte('data_evasao', endDate);

      if (unidadeId !== 'todos') {
        evasoesQuery = evasoesQuery.eq('unidade_id', unidadeId);
      }

      const { data: evasoesData } = await evasoesQuery;

      // Buscar renovações
      let renovacoesQuery = supabase
        .from('renovacoes')
        .select('*')
        .gte('data_vencimento', startDate)
        .lte('data_vencimento', endDate);

      if (unidadeId !== 'todos') {
        renovacoesQuery = renovacoesQuery.eq('unidade_id', unidadeId);
      }

      const { data: renovacoesData } = await renovacoesQuery;

      // Buscar total de alunos ativos (inclui trancados — consistente com aba Alunos e Dashboard)
      let alunosQuery = supabase
        .from('alunos')
        .select('*', { count: 'exact', head: true })
        .in('status', ['ativo', 'trancado']);

      if (unidadeId !== 'todos') {
        alunosQuery = alunosQuery.eq('unidade_id', unidadeId);
      }

      const { count: totalAlunos } = await alunosQuery;

      const evasoes = evasoesData || [];
      const renovacoes = renovacoesData || [];

      const totalEvasoes = evasoes.length;
      // Simplificado - sem joins, usar tipo_saida_id diretamente
      const evasoesInterrompidas = evasoes.filter((e: any) => e.tipo_saida_id === 1).length;
      const avisosPrevios = evasoes.filter((e: any) => e.tipo_saida_id === 2).length;
      const transferencias = evasoes.filter((e: any) => e.tipo_saida_id === 3).length;
      const mrrPerdido = evasoes.reduce((acc: number, e: any) => acc + (e.valor_parcela || 0), 0);

      const renovacoesRealizadas = renovacoes.filter(r => r.status === 'realizada').length;
      const naoRenovacoes = renovacoes.filter(r => r.status === 'nao_renovada').length;
      const renovacoesPendentes = renovacoes.filter(r => r.status === 'pendente').length;
      const renovacoesAtrasadas = renovacoes.filter(r => r.status === 'pendente' && new Date(r.data_vencimento) < new Date()).length;

      const consolidado: KPIsRetencao = {
        unidade_id: unidadeId === 'todos' ? 'todos' : unidadeId,
        unidade_nome: unidadeId === 'todos' ? 'Consolidado' : '',
        ano: currentYear,
        mes: currentMonth,
        total_evasoes: totalEvasoes,
        evasoes_interrompidas: evasoesInterrompidas,
        avisos_previos: avisosPrevios,
        transferencias: transferencias,
        taxa_evasao: totalAlunos && totalAlunos > 0 ? ((totalEvasoes - transferencias) / totalAlunos) * 100 : 0,
        mrr_perdido: mrrPerdido,
        renovacoes_previstas: renovacoes.length,
        renovacoes_realizadas: renovacoesRealizadas,
        nao_renovacoes: naoRenovacoes,
        renovacoes_pendentes: renovacoesPendentes,
        renovacoes_atrasadas: renovacoesAtrasadas,
        taxa_renovacao: renovacoes.length > 0 ? (renovacoesRealizadas / renovacoes.length) * 100 : 0,
        taxa_nao_renovacao: renovacoes.length > 0 ? (naoRenovacoes / renovacoes.length) * 100 : 0,
        evasoes_por_motivo: {},
        evasoes_por_professor: {},
      };

      // Agrupar evasões por motivo (usando ID por enquanto)
      const motivosMap = new Map<string, number>();
      evasoes.forEach((e: any) => {
        const motivo = `Motivo ${e.motivo_saida_id || 'N/A'}`;
        motivosMap.set(motivo, (motivosMap.get(motivo) || 0) + 1);
      });
      consolidado.evasoes_por_motivo = Object.fromEntries(motivosMap);

      // Agrupar evasões por professor (usando ID por enquanto)
      const profsMap = new Map<string, number>();
      evasoes.forEach((e: any) => {
        const prof = `Professor ${e.professor_id || 'N/A'}`;
        profsMap.set(prof, (profsMap.get(prof) || 0) + 1);
      });
      consolidado.evasoes_por_professor = Object.fromEntries(profsMap);

      setData(consolidado);

      setMotivosSaida(
        Array.from(motivosMap.entries())
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value)
      );

      setEvasoesPorProfessor(
        Array.from(profsMap.entries())
          .map(([nome, valor], index) => ({ id: index, nome, valor }))
          .sort((a, b) => b.valor - a.valor)
      );

    } catch (err) {
      console.error('Erro no fallback de KPIs Retenção:', err);
    }
  };

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, dataByUnidade, motivosSaida, evasoesPorProfessor, isLoading, error, refetch: fetchData };
}

export default useKPIsRetencao;

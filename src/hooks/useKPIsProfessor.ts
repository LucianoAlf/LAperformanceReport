import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export interface KPIsProfessor {
  id: number;
  nome: string;
  unidade_id: string | null;
  unidade_nome: string | null;
  carteira_alunos: number;
  ticket_medio: number;
  media_presenca: number;
  taxa_faltas: number;
  experimentais: number;
  matriculas: number;
  taxa_conversao: number;
  evasoes: number;
  mrr_perdido: number;
  renovacoes: number;
  nao_renovacoes: number;
  taxa_renovacao: number;
  taxa_nao_renovacao: number;
  taxa_cancelamento: number;
  ranking_matriculador: number;
  ranking_renovador: number;
  ranking_churn: number;
  nps_medio: number | null;
  media_alunos_turma: number | null;
}

export interface RankingProfessor {
  id: number;
  nome: string;
  valor: number;
  subvalor?: string;
}

interface UseKPIsProfessorResult {
  data: KPIsProfessor[];
  totais: {
    totalProfessores: number;
    carteiraMedia: number;
    ticketMedioGeral: number;
    mediaPresenca: number;
    taxaFaltas: number;
    taxaConversaoMedia: number;
    taxaRenovacaoMedia: number;
    npsGeral: number;
    mediaAlunosTurma: number;
  };
  rankingMatriculadores: RankingProfessor[];
  rankingRenovadores: RankingProfessor[];
  rankingChurn: RankingProfessor[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useKPIsProfessor(
  unidadeId: string | 'todos' = 'todos',
  professorId?: number
): UseKPIsProfessorResult {
  const [data, setData] = useState<KPIsProfessor[]>([]);
  const [totais, setTotais] = useState({
    totalProfessores: 0,
    carteiraMedia: 0,
    ticketMedioGeral: 0,
    mediaPresenca: 0,
    taxaFaltas: 0,
    taxaConversaoMedia: 0,
    taxaRenovacaoMedia: 0,
    npsGeral: 0,
    mediaAlunosTurma: 0,
  });
  const [rankingMatriculadores, setRankingMatriculadores] = useState<RankingProfessor[]>([]);
  const [rankingRenovadores, setRankingRenovadores] = useState<RankingProfessor[]>([]);
  const [rankingChurn, setRankingChurn] = useState<RankingProfessor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      let query = supabase
        .from('vw_kpis_professor_completo')
        .select('*')
        .order('carteira_alunos', { ascending: false });

      if (unidadeId !== 'todos') {
        query = query.eq('unidade_id', unidadeId);
      }

      if (professorId) {
        query = query.eq('id', professorId);
      }

      const { data: professoresData, error: professoresError } = await query;

      if (professoresError) throw professoresError;

      if (professoresData && professoresData.length > 0) {
        setData(professoresData);

        // Calcular totais
        const total = professoresData.length;
        const carteiraMedia = total > 0 
          ? professoresData.reduce((acc, p) => acc + (p.carteira_alunos || 0), 0) / total 
          : 0;
        const ticketMedioGeral = total > 0 
          ? professoresData.reduce((acc, p) => acc + (Number(p.ticket_medio) || 0), 0) / total 
          : 0;
        const mediaPresenca = total > 0 
          ? professoresData.reduce((acc, p) => acc + (Number(p.media_presenca) || 0), 0) / total 
          : 0;
        const taxaFaltas = total > 0 
          ? professoresData.reduce((acc, p) => acc + (Number(p.taxa_faltas) || 0), 0) / total 
          : 0;
        const taxaConversaoMedia = total > 0 
          ? professoresData.reduce((acc, p) => acc + (Number(p.taxa_conversao) || 0), 0) / total 
          : 0;
        const taxaRenovacaoMedia = total > 0 
          ? professoresData.reduce((acc, p) => acc + (Number(p.taxa_renovacao) || 0), 0) / total 
          : 0;
        const profsComNps = professoresData.filter(p => p.nps_medio !== null);
        const npsGeral = profsComNps.length > 0 
          ? profsComNps.reduce((acc, p) => acc + (p.nps_medio || 0), 0) / profsComNps.length 
          : 0;
        const profsComTurma = professoresData.filter(p => p.media_alunos_turma !== null);
        const mediaAlunosTurma = profsComTurma.length > 0 
          ? profsComTurma.reduce((acc, p) => acc + (p.media_alunos_turma || 0), 0) / profsComTurma.length 
          : 0;

        setTotais({
          totalProfessores: total,
          carteiraMedia,
          ticketMedioGeral,
          mediaPresenca,
          taxaFaltas,
          taxaConversaoMedia,
          taxaRenovacaoMedia,
          npsGeral,
          mediaAlunosTurma,
        });

        // Preparar rankings
        setRankingMatriculadores(
          [...professoresData]
            .sort((a, b) => a.ranking_matriculador - b.ranking_matriculador)
            .map(p => ({
              id: p.id,
              nome: p.nome,
              valor: Number(p.taxa_conversao) || 0,
              subvalor: `${p.matriculas || 0} matrículas`,
            }))
        );

        setRankingRenovadores(
          [...professoresData]
            .sort((a, b) => a.ranking_renovador - b.ranking_renovador)
            .map(p => ({
              id: p.id,
              nome: p.nome,
              valor: Number(p.taxa_renovacao) || 0,
              subvalor: `${p.renovacoes || 0} renovações`,
            }))
        );

        setRankingChurn(
          [...professoresData]
            .sort((a, b) => a.ranking_churn - b.ranking_churn)
            .map(p => ({
              id: p.id,
              nome: p.nome,
              valor: p.evasoes || 0,
              subvalor: `R$ ${(Number(p.mrr_perdido) || 0).toFixed(0)} perdido`,
            }))
        );
      }

    } catch (err) {
      console.error('Erro ao buscar KPIs de Professores:', err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [unidadeId, professorId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { 
    data, 
    totais, 
    rankingMatriculadores, 
    rankingRenovadores, 
    rankingChurn, 
    isLoading, 
    error, 
    refetch: fetchData 
  };
}

export default useKPIsProfessor;

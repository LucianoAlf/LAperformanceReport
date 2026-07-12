import { useState, useEffect, useCallback } from 'react';
import {
  buscarKpisProfessoresCanonicos,
  calcularTotaisKpisProfessoresCanonicos,
  consolidarKpisProfessoresCanonicos,
} from '@/lib/professoresKpisCanonicos';

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
      const agora = new Date();
      const linhas = await buscarKpisProfessoresCanonicos({
        ano: agora.getFullYear(),
        mes: agora.getMonth() + 1,
        unidadeId,
      });
      const consolidados = consolidarKpisProfessoresCanonicos(linhas)
        .filter((kpi) => !professorId || kpi.professor_id === professorId)
        .sort((a, b) => b.carteira_alunos - a.carteira_alunos);
      const professoresData: KPIsProfessor[] = consolidados.map((kpi, index) => ({
        id: kpi.professor_id,
        nome: kpi.professor_nome,
        unidade_id: kpi.unidade_id,
        unidade_nome: null,
        carteira_alunos: kpi.carteira_alunos,
        ticket_medio: kpi.ticket_medio,
        media_presenca: kpi.media_presenca,
        taxa_faltas: kpi.taxa_faltas,
        experimentais: kpi.experimentais,
        matriculas: kpi.matriculas_pos_exp,
        taxa_conversao: kpi.taxa_conversao,
        evasoes: kpi.evasoes,
        mrr_perdido: kpi.mrr_perdido,
        renovacoes: kpi.renovacoes,
        nao_renovacoes: kpi.nao_renovacoes,
        taxa_renovacao: kpi.taxa_renovacao,
        taxa_nao_renovacao: 100 - kpi.taxa_renovacao,
        taxa_cancelamento: kpi.taxa_cancelamento,
        ranking_matriculador: index + 1,
        ranking_renovador: index + 1,
        ranking_churn: index + 1,
        nps_medio: kpi.nps_medio,
        media_alunos_turma: kpi.media_alunos_turma,
      }));

      if (professoresData && professoresData.length > 0) {
        setData(professoresData);

        const totaisCanonicos = calcularTotaisKpisProfessoresCanonicos(
          linhas.filter((kpi) => !professorId || kpi.professor_id === professorId)
        );
        const total = professoresData.length;
        const carteiraMedia = total > 0 
          ? professoresData.reduce((acc, p) => acc + (p.carteira_alunos || 0), 0) / total 
          : 0;
        const carteiraTicketTotal = professoresData.reduce((acc, p) => acc + (Number(p.carteira_alunos) || 0), 0);
        const ticketMedioGeral = carteiraTicketTotal > 0
          ? professoresData.reduce((acc, p) => acc + ((Number(p.ticket_medio) || 0) * (Number(p.carteira_alunos) || 0)), 0) / carteiraTicketTotal
          : 0;
        const mediaPresenca = total > 0 
          ? professoresData.reduce((acc, p) => acc + (Number(p.media_presenca) || 0), 0) / total 
          : 0;
        const taxaFaltas = total > 0 
          ? professoresData.reduce((acc, p) => acc + (Number(p.taxa_faltas) || 0), 0) / total 
          : 0;
        const taxaConversaoMedia = totaisCanonicos.taxaConversao;
        const taxaRenovacaoMedia = totaisCanonicos.taxaRenovacao;
        const profsComNps = professoresData.filter(p => p.nps_medio !== null);
        const npsGeral = profsComNps.length > 0 
          ? profsComNps.reduce((acc, p) => acc + (p.nps_medio || 0), 0) / profsComNps.length 
          : 0;
        const mediaAlunosTurma = totaisCanonicos.mediaAlunosTurma;

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
            .filter(p => (p.matriculas || 0) > 0)
            .sort((a, b) => (b.matriculas || 0) - (a.matriculas || 0))
            .map(p => ({
              id: p.id,
              nome: p.nome,
              valor: p.matriculas || 0,
              subvalor: `Exp -> Mat ${(Number(p.taxa_conversao) || 0).toFixed(0)}%`,
            }))
        );

        setRankingRenovadores(
          [...professoresData]
            .sort((a, b) => b.taxa_renovacao - a.taxa_renovacao || b.renovacoes - a.renovacoes)
            .map(p => ({
              id: p.id,
              nome: p.nome,
              valor: Number(p.taxa_renovacao) || 0,
              subvalor: `${p.renovacoes || 0} renovações`,
            }))
        );

        setRankingChurn(
          [...professoresData]
            .sort((a, b) => a.evasoes - b.evasoes || a.mrr_perdido - b.mrr_perdido)
            .map(p => ({
              id: p.id,
              nome: p.nome,
              valor: p.evasoes || 0,
              subvalor: `R$ ${(Number(p.mrr_perdido) || 0).toFixed(0)} perdido`,
            }))
        );
      } else {
        setData([]);
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

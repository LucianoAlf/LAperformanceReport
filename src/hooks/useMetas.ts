import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export interface Meta {
  id: number;
  ano: number;
  mes: number;
  unidade_id: string;
  tipo: string;
  valor: number;
}

export interface ProgressoMeta {
  tipo: string;
  label: string;
  meta: number;
  realizado: number;
  percentual: number;
  projecao: number;
  status: 'atingida' | 'em_andamento' | 'atrasada' | 'critica';
}

export interface AlertaMeta {
  tipo: 'warning' | 'error' | 'success';
  titulo: string;
  mensagem: string;
}

interface UseMetasResult {
  metas: Meta[];
  progresso: ProgressoMeta[];
  alertas: AlertaMeta[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

const TIPOS_META_LABELS: Record<string, string> = {
  matriculas: 'Matrículas',
  leads: 'Leads',
  experimentais: 'Experimentais',
  renovacoes: 'Renovações',
  evasoes_max: 'Evasões (máx)',
  faturamento: 'Faturamento',
  ticket_medio: 'Ticket Médio',
  taxa_conversao: 'Taxa Conversão',
  taxa_renovacao: 'Taxa Renovação',
};

export function useMetas(
  unidadeId: string | 'todos' = 'todos',
  ano?: number,
  mes?: number
): UseMetasResult {
  const [metas, setMetas] = useState<Meta[]>([]);
  const [progresso, setProgresso] = useState<ProgressoMeta[]>([]);
  const [alertas, setAlertas] = useState<AlertaMeta[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const currentYear = ano || new Date().getFullYear();
  const currentMonth = mes || new Date().getMonth() + 1;
  const currentDay = new Date().getDate();
  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Buscar metas
      let metasQuery = supabase
        .from('metas')
        .select('*')
        .eq('ano', currentYear)
        .eq('mes', currentMonth);

      if (unidadeId !== 'todos') {
        metasQuery = metasQuery.eq('unidade_id', unidadeId);
      }

      const { data: metasData, error: metasError } = await metasQuery;

      if (metasError) throw metasError;

      // Consolidar metas por tipo
      const metasConsolidadas = new Map<string, number>();
      (metasData || []).forEach(m => {
        metasConsolidadas.set(m.tipo, (metasConsolidadas.get(m.tipo) || 0) + m.valor);
      });

      setMetas(metasData || []);

      // Buscar dados realizados
      const startDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
      const endDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-31`;

      // Matrículas realizadas
      let matriculasQuery = supabase
        .from('alunos')
        .select('*', { count: 'exact', head: true })
        .gte('data_matricula', startDate)
        .lte('data_matricula', endDate);

      if (unidadeId !== 'todos') {
        matriculasQuery = matriculasQuery.eq('unidade_id', unidadeId);
      }

      const { count: matriculasRealizadas } = await matriculasQuery;

      // Leads realizados
      let leadsQuery = supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .gte('data_contato', startDate)
        .lte('data_contato', endDate);

      if (unidadeId !== 'todos') {
        leadsQuery = leadsQuery.eq('unidade_id', unidadeId);
      }

      const { count: leadsRealizados } = await leadsQuery;

      // Experimentais realizadas
      let expQuery = supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .gte('data_contato', startDate)
        .lte('data_contato', endDate)
        .in('status', ['experimental_realizada', 'matriculado']);

      if (unidadeId !== 'todos') {
        expQuery = expQuery.eq('unidade_id', unidadeId);
      }

      const { count: experimentaisRealizadas } = await expQuery;

      // Renovações realizadas
      let renovacoesQuery = supabase
        .from('renovacoes')
        .select('*', { count: 'exact', head: true })
        .gte('data_vencimento', startDate)
        .lte('data_vencimento', endDate)
        .eq('status', 'realizada');

      if (unidadeId !== 'todos') {
        renovacoesQuery = renovacoesQuery.eq('unidade_id', unidadeId);
      }

      const { count: renovacoesRealizadas } = await renovacoesQuery;

      // Evasões
      let evasoesQuery = supabase
        .from('evasoes_v2')
        .select('*', { count: 'exact', head: true })
        .gte('data_evasao', startDate)
        .lte('data_evasao', endDate);

      if (unidadeId !== 'todos') {
        evasoesQuery = evasoesQuery.eq('unidade_id', unidadeId);
      }

      const { count: evasoesRealizadas } = await evasoesQuery;

      // Montar progresso
      const realizados: Record<string, number> = {
        matriculas: matriculasRealizadas || 0,
        leads: leadsRealizados || 0,
        experimentais: experimentaisRealizadas || 0,
        renovacoes: renovacoesRealizadas || 0,
        evasoes_max: evasoesRealizadas || 0,
      };

      const progressoList: ProgressoMeta[] = [];
      const alertasList: AlertaMeta[] = [];

      metasConsolidadas.forEach((metaValor, tipo) => {
        if (metaValor <= 0) return;

        const realizado = realizados[tipo] || 0;
        const percentual = (realizado / metaValor) * 100;
        
        // Projeção: (realizado / dias passados) * dias do mês
        const projecao = currentDay > 0 ? (realizado / currentDay) * daysInMonth : 0;
        
        // Status baseado no percentual esperado para o dia atual
        const percentualEsperado = (currentDay / daysInMonth) * 100;
        let status: ProgressoMeta['status'] = 'em_andamento';
        
        if (tipo === 'evasoes_max') {
          // Para evasões, menos é melhor
          if (realizado >= metaValor) {
            status = 'critica';
          } else if (realizado >= metaValor * 0.8) {
            status = 'atrasada';
          } else {
            status = 'atingida';
          }
        } else {
          if (percentual >= 100) {
            status = 'atingida';
          } else if (percentual >= percentualEsperado * 0.8) {
            status = 'em_andamento';
          } else if (percentual >= percentualEsperado * 0.5) {
            status = 'atrasada';
          } else {
            status = 'critica';
          }
        }

        progressoList.push({
          tipo,
          label: TIPOS_META_LABELS[tipo] || tipo,
          meta: metaValor,
          realizado,
          percentual,
          projecao,
          status,
        });

        // Gerar alertas
        if (status === 'critica') {
          alertasList.push({
            tipo: 'error',
            titulo: `Meta de ${TIPOS_META_LABELS[tipo]} em risco`,
            mensagem: `Apenas ${percentual.toFixed(0)}% da meta atingida. Projeção: ${projecao.toFixed(0)} de ${metaValor}`,
          });
        } else if (status === 'atrasada') {
          alertasList.push({
            tipo: 'warning',
            titulo: `Meta de ${TIPOS_META_LABELS[tipo]} atrasada`,
            mensagem: `${percentual.toFixed(0)}% da meta. Acelere para atingir ${metaValor}`,
          });
        } else if (status === 'atingida') {
          alertasList.push({
            tipo: 'success',
            titulo: `Meta de ${TIPOS_META_LABELS[tipo]} atingida!`,
            mensagem: `Parabéns! ${realizado} de ${metaValor} (${percentual.toFixed(0)}%)`,
          });
        }
      });

      setProgresso(progressoList);
      setAlertas(alertasList);

    } catch (err) {
      console.error('Erro ao buscar metas:', err);
      setError(err as Error);
    } finally {
      setIsLoading(false);
    }
  }, [unidadeId, currentYear, currentMonth, currentDay, daysInMonth]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { metas, progresso, alertas, isLoading, error, refetch: fetchData };
}

export default useMetas;

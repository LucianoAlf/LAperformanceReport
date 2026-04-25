import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Visita } from '../types';

interface UseVisitasProps {
  unidadeId: string;
  ano: number;
  mes: number;
}

interface UseVisitasReturn {
  visitas: Visita[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

// Lê visitas da tabela `visitas` (fonte de verdade do sistema de visitas).
// Filtra por unidade (unidade da visita, não do lead) e por range de datas da visita.
// Faz LEFT JOIN em leads pra trazer info do lead vinculado (pode ser null).
export function useVisitas({ unidadeId, ano, mes }: UseVisitasProps): UseVisitasReturn {
  const [visitas, setVisitas] = useState<Visita[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVisitas = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const startDate = `${ano}-${String(mes).padStart(2, '0')}-01`;
      const ultimoDia = new Date(ano, mes, 0).getDate();
      const endDate = `${ano}-${String(mes).padStart(2, '0')}-${ultimoDia}`;

      let query = supabase
        .from('visitas')
        .select(`
          *,
          lead:lead_id(
            id,
            nome,
            telefone,
            whatsapp,
            email,
            unidade_id,
            curso_interesse_id,
            canal_origem_id,
            etapa_pipeline_id,
            data_contato,
            data_experimental,
            horario_experimental,
            experimental_agendada,
            experimental_realizada,
            faltou_experimental,
            tipo_agendamento,
            observacoes,
            canais_origem(nome),
            cursos:curso_interesse_id(nome),
            unidades:unidade_id(nome, codigo),
            crm_pipeline_etapas:etapa_pipeline_id(id, nome, slug, cor, icone, ordem)
          )
        `)
        .neq('status', 'cancelada')
        .gte('data', startDate)
        .lte('data', endDate)
        .order('data', { ascending: true });

      if (unidadeId && unidadeId !== 'todos') {
        query = query.eq('unidade_id', unidadeId);
      }

      const { data, error: queryError } = await query;

      if (queryError) throw queryError;

      setVisitas((data || []) as Visita[]);
    } catch (err) {
      console.error('Erro ao carregar visitas:', err);
      setError('Erro ao carregar visitas');
    } finally {
      setLoading(false);
    }
  }, [unidadeId, ano, mes]);

  useEffect(() => {
    fetchVisitas();
  }, [fetchVisitas]);

  return {
    visitas,
    loading,
    error,
    refetch: fetchVisitas,
  };
}

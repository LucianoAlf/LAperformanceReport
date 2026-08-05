import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { FichaColaborador } from '@/components/App/Time/types';

interface UseFichaColaboradorResult {
  ficha: FichaColaborador | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useFichaColaborador(colaboradorId: number | null): UseFichaColaboradorResult {
  const [ficha, setFicha] = useState<FichaColaborador | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (colaboradorId === null) {
      setFicha(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      // 1. Dados do colaborador + nome da unidade
      const { data: colab, error: colabErr } = await supabase
        .from('colaboradores')
        .select(`
          id, nome, apelido, foto_url, bio, cargo, tipo, situacao,
          unidade_id, temperamento_codinome, valorizacao_codinome,
          unidades!left ( nome )
        `)
        .eq('id', colaboradorId)
        .maybeSingle();

      if (colabErr) throw colabErr;
      if (!colab) {
        setFicha(null);
        return;
      }

      const unidadeNome = Array.isArray(colab.unidades)
        ? colab.unidades[0]?.nome
        : colab.unidades?.nome ?? null;

      // 2. Dados do teste (professor_perfil_testes, contexto COLAB)
      const { data: teste } = await supabase
        .from('professor_perfil_testes')
        .select('temperamento_contagem, valorizacao_contagem, concluido_em')
        .eq('colaborador_id', colaboradorId)
        .eq('contexto', 'COLAB')
        .order('concluido_em', { ascending: false })
        .limit(1)
        .maybeSingle();

      // 3. Rider (colaborador_rider — versao mais recente)
      const { data: rider } = await supabase
        .from('colaborador_rider')
        .select('respostas, updated_at')
        .eq('colaborador_id', colaboradorId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      setFicha({
        ...colab,
        unidade_nome: unidadeNome,
        temperamento_contagem: teste?.temperamento_contagem ?? null,
        valorizacao_contagem: teste?.valorizacao_contagem ?? null,
        concluido_em: teste?.concluido_em ?? null,
        rider_respostas: rider?.respostas ?? null,
        rider_updated_at: rider?.updated_at ?? null,
      });
    } catch (err) {
      console.error('Erro ao carregar ficha do colaborador:', err);
      setError(err as Error);
      setFicha(null);
    } finally {
      setIsLoading(false);
    }
  }, [colaboradorId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { ficha, isLoading, error, refetch: fetchData };
}

export default useFichaColaborador;

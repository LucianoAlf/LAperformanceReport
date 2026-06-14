import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface OrigemCanalRPC {
  canal: string;
  leads: number;
}

interface KPIsComercialCanonicosV2Payload {
  origem_canal?: OrigemCanalRPC[];
}

interface UnidadeRow {
  id: string;
  nome: string;
}

interface OrigemRanking {
  canal: string;
  leads: number;
  percentual: number;
}

function normalizarUnidade(valor: string): string {
  return valor.trim().toLocaleLowerCase('pt-BR');
}

function calcularRanking(canaisPorMes: OrigemCanalRPC[][]): OrigemRanking[] {
  const ranking = new Map<string, OrigemRanking>();
  let totalGeral = 0;

  canaisPorMes.flat().forEach((item) => {
    const canal = item.canal || 'Sem canal';
    const leads = Number(item.leads || 0);
    const atual = ranking.get(canal) || { canal, leads: 0, percentual: 0 };

    atual.leads += leads;
    totalGeral += leads;
    ranking.set(canal, atual);
  });

  return Array.from(ranking.values())
    .map((item) => ({
      ...item,
      percentual: totalGeral > 0 ? (item.leads / totalGeral) * 100 : 0,
    }))
    .sort((a, b) => b.leads - a.leads);
}

export function useOrigemData(ano: number = 2025, unidade: string = 'Consolidado') {
  const [origem, setOrigem] = useState<OrigemRanking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const resolverUnidadeId = useCallback(async (): Promise<string | null> => {
    if (unidade === 'Consolidado') {
      return null;
    }

    const { data, error: unidadesError } = await supabase
      .from('unidades')
      .select('id, nome')
      .eq('ativo', true);

    if (unidadesError) {
      throw unidadesError;
    }

    const unidadeEncontrada = (data as UnidadeRow[] | null)?.find(
      (row) => normalizarUnidade(row.nome) === normalizarUnidade(unidade),
    );

    if (!unidadeEncontrada) {
      throw new Error(`Unidade comercial nao encontrada: ${unidade}`);
    }

    return unidadeEncontrada.id;
  }, [unidade]);

  const fetchOrigem = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const unidadeId = await resolverUnidadeId();
      const meses = Array.from({ length: 12 }, (_, index) => index + 1);

      const canaisPorMes: OrigemCanalRPC[][] = [];

      for (const mes of meses) {
        const { data, error: rpcError } = await supabase.rpc('get_kpis_comercial_canonicos_v2', {
          p_unidade_id: unidadeId,
          p_ano: ano,
          p_mes: mes,
          p_periodo: 'mensal',
          p_data: null,
        });

        if (rpcError) {
          throw new Error(`Erro ao buscar origem/canal v2 ${ano}-${String(mes).padStart(2, '0')}: ${rpcError.message}`);
        }

        const payload = data as KPIsComercialCanonicosV2Payload | null;
        canaisPorMes.push(Array.isArray(payload?.origem_canal) ? payload.origem_canal : []);
      }

      setOrigem(calcularRanking(canaisPorMes));
    } catch (err: any) {
      setOrigem([]);
      setError(err?.message || 'Erro ao buscar origem/canal v2');
      console.error('Erro ao buscar origem/canal v2:', err);
    } finally {
      setLoading(false);
    }
  }, [ano, resolverUnidadeId]);

  useEffect(() => {
    fetchOrigem();
  }, [fetchOrigem]);

  return { origem, loading, error };
}

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface OrigemDB {
  competencia: string;
  unidade: string;
  canal: string;
  tipo: string;
  quantidade: number;
}

interface OrigemRanking {
  canal: string;
  leads: number;
  percentual: number;
}

export function useOrigemData(ano: number = 2025, unidade: string = 'Consolidado') {
  const [origem, setOrigem] = useState<OrigemRanking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOrigem();
  }, [ano, unidade]);

  const fetchOrigem = async () => {
    setLoading(true);
    
    let query = supabase
      .from('origem_leads')
      .select('*')
      .gte('competencia', `${ano}-01-01`)
      .lte('competencia', `${ano}-12-31`);

    if (unidade !== 'Consolidado') {
      query = query.eq('unidade', unidade);
    }

    const { data } = await query;

    if (data) {
      // Agrupar por canal
      const ranking: { [key: string]: OrigemRanking } = {};
      let totalGeral = 0;
      
      (data as OrigemDB[]).forEach((d) => {
        if (d.tipo === 'lead') {
          if (!ranking[d.canal]) {
            ranking[d.canal] = {
              canal: d.canal,
              leads: 0,
              percentual: 0,
            };
          }
          ranking[d.canal].leads += d.quantidade;
          totalGeral += d.quantidade;
        }
      });

      // Calcular percentual
      Object.values(ranking).forEach((r) => {
        r.percentual = totalGeral > 0 ? (r.leads / totalGeral) * 100 : 0;
      });

      const sorted = Object.values(ranking).sort((a, b) => b.leads - a.leads);
      setOrigem(sorted);
    }

    setLoading(false);
  };

  return { origem, loading };
}

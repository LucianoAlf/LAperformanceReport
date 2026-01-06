import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface ProfessorDB {
  competencia: string;
  unidade: string;
  professor: string;
  quantidade: number;
}

interface ProfessorRanking {
  professor: string;
  total: number;
  unidades: { [key: string]: number };
}

export function useProfessoresData(ano: number = 2025, unidade: string = 'Consolidado') {
  const [professores, setProfessores] = useState<ProfessorRanking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProfessores();
  }, [ano, unidade]);

  const fetchProfessores = async () => {
    setLoading(true);
    
    let query = supabase
      .from('professores_experimentais')
      .select('*')
      .gte('competencia', `${ano}-01-01`)
      .lte('competencia', `${ano}-12-31`);

    if (unidade !== 'Consolidado') {
      query = query.eq('unidade', unidade);
    }

    const { data } = await query;

    if (data) {
      // Agrupar por professor
      const ranking: { [key: string]: ProfessorRanking } = {};
      
      (data as ProfessorDB[]).forEach((d) => {
        if (!ranking[d.professor]) {
          ranking[d.professor] = {
            professor: d.professor,
            total: 0,
            unidades: {},
          };
        }
        ranking[d.professor].total += d.quantidade;
        ranking[d.professor].unidades[d.unidade] = 
          (ranking[d.professor].unidades[d.unidade] || 0) + d.quantidade;
      });

      const sorted = Object.values(ranking)
        .filter(p => p.professor !== 'Não teve' && p.professor !== 'Sem experimental')
        .sort((a, b) => b.total - a.total);
      
      setProfessores(sorted);
    }

    setLoading(false);
  };

  return { professores, loading };
}

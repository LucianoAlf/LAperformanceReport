import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface CursoDB {
  competencia: string;
  unidade: string;
  curso: string;
  quantidade: number;
}

interface CursoRanking {
  curso: string;
  total: number;
  unidades: { [key: string]: number };
}

export function useCursosData(ano: number = 2025, unidade: string = 'Consolidado') {
  const [cursos, setCursos] = useState<CursoRanking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCursos();
  }, [ano, unidade]);

  const fetchCursos = async () => {
    setLoading(true);
    
    let query = supabase
      .from('cursos_matriculados')
      .select('*')
      .gte('competencia', `${ano}-01-01`)
      .lte('competencia', `${ano}-12-31`);

    if (unidade !== 'Consolidado') {
      query = query.eq('unidade', unidade);
    }

    const { data } = await query;

    if (data) {
      // Agrupar por curso
      const ranking: { [key: string]: CursoRanking } = {};
      
      (data as CursoDB[]).forEach((d) => {
        if (!ranking[d.curso]) {
          ranking[d.curso] = {
            curso: d.curso,
            total: 0,
            unidades: {},
          };
        }
        ranking[d.curso].total += d.quantidade;
        ranking[d.curso].unidades[d.unidade] = 
          (ranking[d.curso].unidades[d.unidade] || 0) + d.quantidade;
      });

      const sorted = Object.values(ranking).sort((a, b) => b.total - a.total);
      setCursos(sorted);
    }

    setLoading(false);
  };

  return { cursos, loading };
}

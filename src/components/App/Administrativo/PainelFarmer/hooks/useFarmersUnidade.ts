import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface Farmer {
  id: string;
  nome: string;
  apelido: string | null;
  unidade_id: string;
}

export function useFarmersUnidade(unidadeId: string) {
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchFarmers() {
      try {
        setLoading(true);
        
        let query = supabase
          .from('colaboradores')
          .select('id, nome, apelido, unidade_id')
          .eq('tipo', 'farmer')
          .eq('ativo', true)
          .order('nome');

        // Se não for "todos", filtra por unidade
        if (unidadeId && unidadeId !== 'todos') {
          query = query.eq('unidade_id', unidadeId);
        }

        const { data, error } = await query;

        if (error) {
          console.error('Erro ao buscar farmers:', error);
          return;
        }

        setFarmers(data || []);
      } catch (err) {
        console.error('Erro ao buscar farmers:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchFarmers();
  }, [unidadeId]);

  return { farmers, loading };
}

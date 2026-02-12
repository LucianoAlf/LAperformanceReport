import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { Colaborador } from '../types';

export function useColaboradorAtual(unidadeId?: string) {
  const [colaborador, setColaborador] = useState<Colaborador | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchColaborador() {
      try {
        setLoading(true);
        
        // Buscar usuário logado
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          // Usuário não logado - usar primeiro farmer como fallback para desenvolvimento
          // Respeitar o filtro global de unidade
          let query = supabase
            .from('colaboradores')
            .select('*')
            .eq('tipo', 'farmer')
            .eq('ativo', true);
          
          // Filtrar por unidade se não for "todos"
          if (unidadeId && unidadeId !== 'todos') {
            query = query.eq('unidade_id', unidadeId);
          }
          
          const { data: fallbackColaborador } = await query.limit(1).maybeSingle();
          
          if (fallbackColaborador) {
            setColaborador(fallbackColaborador);
          }
          return;
        }

        // Buscar colaborador vinculado ao usuário
        const { data, error: fetchError } = await supabase
          .from('colaboradores')
          .select('*')
          .eq('usuario_id', user.id)
          .eq('ativo', true)
          .maybeSingle();

        if (fetchError || !data) {
          // Se não encontrou por usuario_id, tentar fallback por email
          const { data: fallbackByEmail } = await supabase
            .from('colaboradores')
            .select('*')
            .eq('email', user.email)
            .eq('ativo', true)
            .maybeSingle();

          if (fallbackByEmail) {
            setColaborador(fallbackByEmail);
            return;
          }

          // Último fallback: primeiro farmer ativo da unidade selecionada
          let query = supabase
            .from('colaboradores')
            .select('*')
            .eq('tipo', 'farmer')
            .eq('ativo', true);
          
          // Filtrar por unidade se não for "todos"
          if (unidadeId && unidadeId !== 'todos') {
            query = query.eq('unidade_id', unidadeId);
          }
          
          const { data: fallbackColaborador } = await query.limit(1).maybeSingle();

          if (fallbackColaborador) {
            setColaborador(fallbackColaborador);
          } else {
            setError('Nenhum colaborador encontrado');
          }
          return;
        }

        setColaborador(data);
      } catch (err) {
        console.error('Erro ao buscar colaborador:', err);
        setError('Erro ao carregar dados do colaborador');
      } finally {
        setLoading(false);
      }
    }

    fetchColaborador();
  }, [unidadeId]);

  return { colaborador, loading, error };
}

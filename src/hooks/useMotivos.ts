import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export interface MotivoSaida {
  id: number;
  nome: string;
  categoria: string;
}

export interface MotivoTrancamento {
  id: number;
  nome: string;
  categoria: string;
}

export function useMotivos() {
  const [motivosSaida, setMotivosSaida] = useState<MotivoSaida[]>([]);
  const [motivosTrancamento, setMotivosTrancamento] = useState<MotivoTrancamento[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadMotivos() {
      setLoading(true);
      try {
        const [saidaRes, trancamentoRes] = await Promise.all([
          supabase
            .from('motivos_saida')
            .select('id, nome, categoria')
            .eq('ativo', true)
            .order('nome'),
          supabase
            .from('motivos_trancamento')
            .select('id, nome, categoria')
            .eq('ativo', true)
            .order('nome'),
        ]);

        setMotivosSaida(saidaRes.data || []);
        setMotivosTrancamento(trancamentoRes.data || []);
      } catch (error) {
        console.error('Erro ao carregar motivos:', error);
      } finally {
        setLoading(false);
      }
    }

    loadMotivos();
  }, []);

  return { motivosSaida, motivosTrancamento, loading };
}

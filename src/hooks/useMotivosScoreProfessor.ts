import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

interface MotivoSaida {
  id: number;
  nome: string;
  categoria: string | null;
  conta_score_professor: boolean;
}

interface UseMotivosScoreProfessorReturn {
  motivos: MotivoSaida[];
  loading: boolean;
  toggleMotivo: (id: number, valor: boolean) => Promise<void>;
  idsQueContam: number[];
}

export function useMotivosScoreProfessor(): UseMotivosScoreProfessorReturn {
  const [motivos, setMotivos] = useState<MotivoSaida[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMotivos = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('motivos_saida')
        .select('id, nome, categoria, conta_score_professor')
        .eq('ativo', true)
        .order('nome');

      if (error) {
        console.error('Erro ao buscar motivos_saida:', error);
      } else {
        setMotivos(data || []);
      }
      setLoading(false);
    };
    fetchMotivos();
  }, []);

  const toggleMotivo = useCallback(async (id: number, valor: boolean) => {
    const { error } = await supabase
      .from('motivos_saida')
      .update({ conta_score_professor: valor })
      .eq('id', id);

    if (error) {
      toast.error('Erro ao atualizar motivo');
      console.error('Erro ao atualizar motivo:', error);
      return;
    }

    setMotivos(prev => prev.map(m => m.id === id ? { ...m, conta_score_professor: valor } : m));
    toast.success(`${valor ? 'Conta' : 'Não conta'} no score do professor`);
  }, []);

  const idsQueContam = motivos.filter(m => m.conta_score_professor).map(m => m.id);

  return { motivos, loading, toggleMotivo, idsQueContam };
}

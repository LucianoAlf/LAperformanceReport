import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export interface AlunoCritico {
  id: number;
  nome: string;
  curso_nome: string | null;
  professor_nome: string | null;
  unidade_nome: string | null;
  health_score: number;
  health_status: 'critico' | 'atencao' | 'saudavel';
  percentual_presenca: number;
  status_pagamento: string;
  telefone_responsavel: string | null;
}

interface UseSucessoAlunoAlertasResult {
  alunosCriticos: AlunoCritico[];
  totalCriticos: number;
  loading: boolean;
  error: Error | null;
}

export function useSucessoAlunoAlertas(unidadeId: string): UseSucessoAlunoAlertasResult {
  const [alunosCriticos, setAlunosCriticos] = useState<AlunoCritico[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchAlunosCriticos() {
      try {
        setLoading(true);
        
        // Buscar alunos ativos com health score crítico
        let query = supabase
          .from('alunos')
          .select(`
            id,
            nome,
            health_score_numerico,
            health_status,
            percentual_presenca,
            status_pagamento,
            telefone_responsavel,
            curso:cursos(nome),
            professor:professores(nome),
            unidade:unidades(nome)
          `)
          .eq('status', 'ativo')
          .eq('health_status', 'critico')
          .order('health_score_numerico', { ascending: true });
        
        // Filtrar por unidade se não for consolidado
        if (unidadeId !== 'todos') {
          query = query.eq('unidade_id', unidadeId);
        }
        
        const { data, error: supabaseError } = await query;
        
        if (supabaseError) {
          throw supabaseError;
        }
        
        const formatted: AlunoCritico[] = (data || []).map((a: any) => ({
          id: a.id,
          nome: a.nome,
          curso_nome: a.curso?.nome || null,
          professor_nome: a.professor?.nome || null,
          unidade_nome: a.unidade?.nome || null,
          health_score: a.health_score_numerico || 0,
          health_status: a.health_status || 'critico',
          percentual_presenca: a.percentual_presenca || 0,
          status_pagamento: a.status_pagamento || 'em_dia',
          telefone_responsavel: a.telefone_responsavel,
        }));
        
        setAlunosCriticos(formatted);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Erro ao buscar alunos críticos'));
      } finally {
        setLoading(false);
      }
    }
    
    fetchAlunosCriticos();
  }, [unidadeId]);
  
  return {
    alunosCriticos,
    totalCriticos: alunosCriticos.length,
    loading,
    error,
  };
}

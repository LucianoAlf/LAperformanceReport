import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';

export interface ProfessorFeedbackPendente {
  professor_id: number;
  professor_nome: string;
  unidade_nome: string;
  total_alunos: number;
  telefone_whatsapp: string | null;
}

interface UseFeedbackPendenteResult {
  professoresPendentes: ProfessorFeedbackPendente[];
  totalPendentes: number;
  loading: boolean;
  error: Error | null;
}

export function useFeedbackPendente(unidadeId: string): UseFeedbackPendenteResult {
  const [professoresPendentes, setProfessoresPendentes] = useState<ProfessorFeedbackPendente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchProfessoresPendentes() {
      try {
        setLoading(true);
        
        const competenciaAtual = format(new Date(), 'yyyy-MM') + '-01';
        
        // Buscar professores ativos com alunos na unidade
        let query = supabase
          .from('professores')
          .select(`
            id,
            nome,
            telefone_whatsapp,
            unidade_id,
            unidades(nome)
          `)
          .eq('ativo', true);
        
        if (unidadeId !== 'todos') {
          // Filtrar por unidade específica
          query = query.eq('unidade_id', unidadeId);
        }
        
        const { data: professores, error: profError } = await query;
        
        if (profError) {
          throw profError;
        }
        
        // Buscar feedbacks já respondidos no mês atual
        const { data: feedbacksRespondidos, error: feedbackError } = await supabase
          .from('aluno_feedback_professor')
          .select('professor_id')
          .gte('respondido_em', competenciaAtual)
          .not('professor_id', 'is', null);
        
        if (feedbackError) {
          throw feedbackError;
        }
        
        // Criar set de professores que já responderam
        const professoresRespondidos = new Set(
          (feedbacksRespondidos || []).map(f => f.professor_id)
        );
        
        // Buscar total de alunos por professor
        const professorIds = (professores || []).map(p => p.id);
        
        let alunosQuery = supabase
          .from('alunos')
          .select('professor_atual_id, count', { count: 'exact', head: false })
          .eq('status', 'ativo')
          .in('professor_atual_id', professorIds);
        
        if (unidadeId !== 'todos') {
          alunosQuery = alunosQuery.eq('unidade_id', unidadeId);
        }
        
        const { data: alunosPorProfessor, error: alunosError } = await alunosQuery
          .order('professor_atual_id');
        
        // Agrupar contagem de alunos por professor
        const alunosCountMap: Record<number, number> = {};
        if (alunosPorProfessor) {
          alunosPorProfessor.forEach((a: any) => {
            alunosCountMap[a.professor_atual_id] = (alunosCountMap[a.professor_atual_id] || 0) + 1;
          });
        }
        
        // Filtrar professores que NÃO responderam e têm alunos
        const pendentes: ProfessorFeedbackPendente[] = (professores || [])
          .filter(p => !professoresRespondidos.has(p.id))
          .filter(p => (alunosCountMap[p.id] || 0) > 0)
          .map(p => ({
            professor_id: p.id,
            professor_nome: p.nome,
            unidade_nome: p.unidades?.[0]?.nome || '',
            total_alunos: alunosCountMap[p.id] || 0,
            telefone_whatsapp: p.telefone_whatsapp,
          }));
        
        setProfessoresPendentes(pendentes);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Erro ao buscar feedback pendente'));
      } finally {
        setLoading(false);
      }
    }
    
    fetchProfessoresPendentes();
  }, [unidadeId]);
  
  return {
    professoresPendentes,
    totalPendentes: professoresPendentes.length,
    loading,
    error,
  };
}

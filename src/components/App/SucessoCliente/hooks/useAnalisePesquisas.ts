import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import type { UnidadeId } from '@/components/ui/UnidadeFilter';

export interface AnalisePesquisas {
  kpis: {
    enviadas: number;
    respondidas: number;
    taxa_resposta: number;
    nota_media: number;
    distribuicao: Record<string, number>;
  };
  por_professor: { professor_nome: string; qtd: number; nota_media: number }[];
  por_unidade: { unidade_nome: string; qtd: number; nota_media: number }[];
  por_curso: { curso_nome: string; qtd: number; nota_media: number }[];
  evolucao: { periodo: string; qtd: number; nota_media: number }[];
}

export interface RespostaPesquisa {
  pesquisa_id: string;
  aluno_id: number;
  nome: string;
  nota: number;
  curso_nome: string | null;
  professor_nome: string | null;
  unidade_nome: string | null;
  whatsapp_jid: string | null;
  enviado_em: string | null;
  respondido_em: string | null;
}

export function useAnalisePesquisas(unidadeAtual: UnidadeId, dataInicio: string, dataFim: string) {
  const [analise, setAnalise] = useState<AnalisePesquisas | null>(null);
  const [respostas, setRespostas] = useState<RespostaPesquisa[]>([]);
  const [loading, setLoading] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const unidadeParam = unidadeAtual === 'todos' ? null : unidadeAtual;
      const [analiseRes, respostasRes] = await Promise.all([
        supabase.rpc('get_analise_pesquisas', {
          p_unidade_id: unidadeParam,
          p_data_inicio: dataInicio,
          p_data_fim: dataFim,
        }),
        supabase.rpc('get_respostas_pesquisa', {
          p_unidade_id: unidadeParam,
          p_data_inicio: dataInicio,
          p_data_fim: dataFim,
        }),
      ]);
      if (analiseRes.error) throw analiseRes.error;
      if (respostasRes.error) throw respostasRes.error;
      setAnalise((analiseRes.data as AnalisePesquisas) ?? null);
      setRespostas((respostasRes.data as RespostaPesquisa[]) || []);
    } catch (err: any) {
      toast.error('Erro ao carregar análise: ' + (err.message || 'desconhecido'));
      setAnalise(null);
      setRespostas([]);
    } finally {
      setLoading(false);
    }
  }, [unidadeAtual, dataInicio, dataFim]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  return { analise, respostas, loading, recarregar: carregar };
}

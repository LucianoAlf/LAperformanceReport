import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { ConversaCRM, FiltroInbox } from '../types';

interface UseConversasParams {
  unidadeId?: string;
  filtro?: FiltroInbox;
  busca?: string;
}

export function useConversas({ unidadeId, filtro = 'todas', busca }: UseConversasParams = {}) {
  const [conversas, setConversas] = useState<ConversaCRM[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalNaoLidas, setTotalNaoLidas] = useState(0);

  const fetchConversas = useCallback(async () => {
    try {
      setError(null);

      let query = supabase
        .from('crm_conversas')
        .select(`
          *,
          lead:lead_id(
            id, nome, telefone, whatsapp, email, idade, unidade_id,
            curso_interesse_id, canal_origem_id, data_contato,
            data_primeiro_contato, data_ultimo_contato, status,
            observacoes, etapa_pipeline_id, temperatura, faixa_etaria,
            qtd_tentativas_sem_resposta, qtd_mensagens_mila,
            data_passagem_mila, motivo_passagem_mila, sabia_preco,
            experimental_agendada, data_experimental, horario_experimental,
            professor_experimental_id, experimental_realizada,
            faltou_experimental, converteu, data_conversao, arquivado,
            canais_origem(nome),
            cursos:curso_interesse_id(nome),
            unidades:unidade_id(nome, codigo),
            crm_pipeline_etapas:etapa_pipeline_id(id, nome, slug, cor, icone, ordem)
          ),
          caixa:caixa_id(id, nome, numero)
        `)
        .order('ultima_mensagem_at', { ascending: false, nullsFirst: false });

      // Filtro por unidade
      if (unidadeId && unidadeId !== 'todos') {
        query = query.eq('unidade_id', unidadeId);
      }

      // Filtros do inbox
      if (filtro === 'nao_lidas') {
        query = query.gt('nao_lidas', 0);
      } else if (filtro === 'mila') {
        query = query.eq('atribuido_a', 'mila');
      } else if (filtro === 'minhas') {
        query = query.eq('atribuido_a', 'andreza');
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      let resultado = (data || []) as ConversaCRM[];

      // Filtro de busca local (nome ou telefone do lead)
      if (busca && busca.trim()) {
        const termo = busca.toLowerCase().trim();
        resultado = resultado.filter(c => {
          const lead = c.lead as any;
          if (!lead) return false;
          const nome = (lead.nome || '').toLowerCase();
          const telefone = (lead.telefone || '');
          return nome.includes(termo) || telefone.includes(termo);
        });
      }

      setConversas(resultado);

      // Calcular total de não lidas (sem filtro)
      const total = (data || []).reduce((acc: number, c: any) => acc + (c.nao_lidas || 0), 0);
      setTotalNaoLidas(total);
    } catch (err) {
      console.error('[useConversas] Erro:', err);
      setError(err instanceof Error ? err.message : 'Erro ao buscar conversas');
    } finally {
      setLoading(false);
    }
  }, [unidadeId, filtro, busca]);

  // Fetch inicial
  useEffect(() => {
    fetchConversas();
  }, [fetchConversas]);

  // Realtime: escutar mudanças em crm_conversas
  useEffect(() => {
    const channel = supabase
      .channel('crm_conversas_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'crm_conversas' },
        () => {
          // Re-fetch quando qualquer conversa mudar
          fetchConversas();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchConversas]);

  // Marcar conversa como lida
  const marcarComoLida = useCallback(async (conversaId: string) => {
    try {
      await supabase.rpc('marcar_conversa_lida', { p_conversa_id: conversaId });
      // Atualizar estado local imediatamente
      setConversas(prev =>
        prev.map(c => c.id === conversaId ? { ...c, nao_lidas: 0 } : c)
      );
    } catch (err) {
      console.error('[useConversas] Erro ao marcar como lida:', err);
    }
  }, []);

  return {
    conversas,
    loading,
    error,
    totalNaoLidas,
    refetch: fetchConversas,
    marcarComoLida,
  };
}

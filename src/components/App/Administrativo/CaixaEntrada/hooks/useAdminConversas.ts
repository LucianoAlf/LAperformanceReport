import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { AdminConversa, FiltroAdminInbox } from '../types';

interface UseAdminConversasParams {
  unidadeId?: string | null;
  filtro?: FiltroAdminInbox;
  busca?: string;
}

export function useAdminConversas({ unidadeId, filtro = 'todas', busca }: UseAdminConversasParams = {}) {
  const [conversas, setConversas] = useState<AdminConversa[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalNaoLidas, setTotalNaoLidas] = useState(0);

  const fetchConversas = useCallback(async () => {
    if (!unidadeId || unidadeId === 'todos') {
      setConversas([]);
      setLoading(false);
      return;
    }

    try {
      setError(null);

      let query = supabase
        .from('admin_conversas')
        .select(`
          *,
          aluno:aluno_id(
            id, nome, telefone, whatsapp, email,
            curso_id, professor_atual_id, unidade_id,
            status, classificacao, status_pagamento,
            cursos:curso_id(nome),
            professores:professor_atual_id(nome),
            unidades:unidade_id(nome, codigo)
          ),
          caixa:caixa_id(id, nome, numero)
        `)
        .eq('unidade_id', unidadeId)
        .eq('status', 'aberta')
        .order('ultima_mensagem_at', { ascending: false, nullsFirst: false });

      if (filtro === 'nao_lidas') {
        query = query.gt('nao_lidas', 0);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      let resultado = (data || []) as AdminConversa[];

      // Filtro de busca local (nome/telefone do aluno ou contato externo)
      if (busca && busca.trim()) {
        const termo = busca.toLowerCase().trim();
        resultado = resultado.filter(c => {
          const aluno = c.aluno as any;
          if (aluno) {
            const nome = (aluno.nome || '').toLowerCase();
            const telefone = (aluno.telefone || '');
            return nome.includes(termo) || telefone.includes(termo);
          }
          // Contato externo
          const nomeExt = (c.nome_externo || '').toLowerCase();
          const telExt = (c.telefone_externo || '');
          return nomeExt.includes(termo) || telExt.includes(termo);
        });
      }

      setConversas(resultado);

      const total = (data || []).reduce((acc: number, c: any) => acc + (c.nao_lidas || 0), 0);
      setTotalNaoLidas(total);
    } catch (err) {
      console.error('[useAdminConversas] Erro:', err);
      setError(err instanceof Error ? err.message : 'Erro ao buscar conversas');
    } finally {
      setLoading(false);
    }
  }, [unidadeId, filtro, busca]);

  useEffect(() => {
    fetchConversas();
  }, [fetchConversas]);

  // Realtime — targeted updates (sem refetch completo)
  useEffect(() => {
    const channel = supabase
      .channel('admin_conversas_changes')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'admin_conversas' },
        (payload) => {
          const updated = payload.new as any;
          setConversas(prev => {
            const idx = prev.findIndex(c => c.id === updated.id);
            if (idx === -1) return prev;
            const merged = { ...prev[idx], ...updated };
            const next = [...prev];
            next[idx] = merged;
            // Re-ordenar por ultima_mensagem_at (mais recente primeiro)
            next.sort((a, b) => {
              const ta = a.ultima_mensagem_at || a.created_at || '';
              const tb = b.ultima_mensagem_at || b.created_at || '';
              return tb.localeCompare(ta);
            });
            return next;
          });
          // Recalcular total nao lidas
          setTotalNaoLidas(prev => {
            const old = conversas.find(c => c.id === updated.id);
            const diff = (updated.nao_lidas || 0) - (old?.nao_lidas || 0);
            return Math.max(0, prev + diff);
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'admin_conversas' },
        () => fetchConversas() // Nova conversa: refetch completo (raro)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchConversas, conversas]);

  // Marcar como lida
  const marcarComoLida = useCallback(async (conversaId: string) => {
    try {
      await supabase
        .from('admin_conversas')
        .update({ nao_lidas: 0 })
        .eq('id', conversaId);

      setConversas(prev =>
        prev.map(c => c.id === conversaId ? { ...c, nao_lidas: 0 } : c)
      );
    } catch (err) {
      console.error('[useAdminConversas] Erro ao marcar como lida:', err);
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

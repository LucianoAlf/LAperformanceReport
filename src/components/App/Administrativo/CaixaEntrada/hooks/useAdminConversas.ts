import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { AdminConversa, FiltroAdminInbox } from '../types';

interface UseAdminConversasParams {
  unidadeId?: string | null;
  departamento?: string;
  filtro?: FiltroAdminInbox;
  busca?: string;
}

export function useAdminConversas({ unidadeId, departamento = 'administrativo', filtro = 'todas', busca }: UseAdminConversasParams = {}) {
  const [conversas, setConversas] = useState<AdminConversa[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalNaoLidas, setTotalNaoLidas] = useState(0);

  const fetchConversas = useCallback(async () => {
    // null = sem seleção ainda. 'todos' = inbox unificada (todas as unidades; RLS restringe a admin).
    if (!unidadeId) {
      setConversas([]);
      setLoading(false);
      return;
    }

    const todasUnidades = unidadeId === 'todos';

    try {
      setError(null);

      let query = supabase
        .from('admin_conversas')
        .select(`
          *,
          aluno:aluno_id(
            id, nome, responsavel_nome, telefone, whatsapp, email,
            curso_id, professor_atual_id, unidade_id,
            status, classificacao, status_pagamento,
            cursos:curso_id(nome),
            professores:professor_atual_id(nome),
            unidades:unidade_id(nome, codigo)
          ),
          unidade:unidade_id(nome, codigo),
          caixa:caixa_id(id, nome, numero)
        `)
        .eq('status', 'aberta')
        .eq('departamento', departamento)
        .order('ultima_mensagem_at', { ascending: false, nullsFirst: false });

      // Inbox unificada não filtra por unidade; modo unidade fixa filtra.
      if (!todasUnidades) {
        query = query.eq('unidade_id', unidadeId);
      }

      if (filtro === 'nao_lidas') {
        query = query.gt('nao_lidas', 0);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      let resultado = (data || []) as AdminConversa[];

      // Filtro de busca local (nome/telefone do aluno ou contato externo).
      // Também casa alunos que COMPARTILHAM o mesmo número (irmãos com o mesmo
      // responsável, ex.: Hugo/Vitor Rocha da Costa) — a conversa só existe no nome
      // de um deles (1 conversa por whatsapp_jid+departamento), então buscar pelo
      // nome do outro irmão precisa achar a mesma conversa.
      if (busca && busca.trim()) {
        const termo = busca.toLowerCase().trim();

        let alunosMatchQuery = supabase
          .from('alunos')
          .select('telefone, whatsapp')
          .or(`nome.ilike.%${termo}%,telefone.like.%${termo}%,whatsapp.like.%${termo}%`);
        if (!todasUnidades) alunosMatchQuery = alunosMatchQuery.eq('unidade_id', unidadeId);
        const { data: alunosMatch } = await alunosMatchQuery;

        const digitsCompartilhados = new Set<string>();
        (alunosMatch || []).forEach((a: any) => {
          [a.telefone, a.whatsapp].forEach((n: string | null) => {
            const d = (n || '').replace(/\D/g, '');
            if (d.length >= 10) digitsCompartilhados.add(d.slice(-11));
          });
        });

        resultado = resultado.filter(c => {
          const aluno = c.aluno as any;
          if (aluno) {
            const nome = (aluno.nome || '').toLowerCase();
            const telefone = (aluno.telefone || '');
            if (nome.includes(termo) || telefone.includes(termo)) return true;
          } else {
            // Contato externo
            const nomeExt = (c.nome_externo || '').toLowerCase();
            const telExt = (c.telefone_externo || '');
            if (nomeExt.includes(termo) || telExt.includes(termo)) return true;
          }
          const jidDigits = (c.whatsapp_jid || '').replace(/\D/g, '').slice(-11);
          return !!jidDigits && digitsCompartilhados.has(jidDigits);
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
  }, [unidadeId, departamento, filtro, busca]);

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

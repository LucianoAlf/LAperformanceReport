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
  // Mapa "irmãos por número" (últimos 11 dígitos do whatsapp_jid -> alunos que usam esse
  // mesmo número, ex.: mesmo responsável). Permite sinalizar no card da lista, sem esperar
  // o atendente abrir a conversa.
  const [irmaosPorNumero, setIrmaosPorNumero] = useState<Record<string, { id: number; nome: string }[]>>({});

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

      // Conjunto de alunos do escopo (mesma unidade, ou unidades das conversas visíveis no
      // modo consolidado) — usado tanto para achar irmãos por nome/telefone na busca quanto
      // para montar o selo "número compartilhado" nos cards. Comparação de telefone é feita
      // por DÍGITOS NORMALIZADOS em JS (não LIKE em texto cru): o campo `telefone` está
      // inconsistente no banco — alguns alunos têm só dígitos ("5521998979955"), outros com
      // formatação ("(21) 99897-9955") — e a pontuação quebra o match de um LIKE por dígitos
      // puros (caso real: Hugo/Vitor Rocha da Costa, mesmo responsável, mesmo número).
      let alunos: { id: number; nome: string; telefone: string | null; whatsapp: string | null }[] = [];
      if (resultado.length > 0) {
        const unidadesEnvolvidas = Array.from(new Set(resultado.map(c => c.unidade_id).filter(Boolean))) as string[];
        let alunosQuery = supabase.from('alunos').select('id, nome, telefone, whatsapp');
        if (!todasUnidades) {
          alunosQuery = alunosQuery.eq('unidade_id', unidadeId);
        } else if (unidadesEnvolvidas.length > 0) {
          alunosQuery = alunosQuery.in('unidade_id', unidadesEnvolvidas);
        }
        const { data: alunosEscopo } = await alunosQuery;
        alunos = (alunosEscopo || []) as typeof alunos;
      }

      const digitsDoAluno = (a: { telefone: string | null; whatsapp: string | null }): string[] =>
        [a.telefone, a.whatsapp]
          .map(n => (n || '').replace(/\D/g, '').slice(-11))
          .filter(d => d.length >= 10);

      // Filtro de busca local (nome/telefone do aluno ou contato externo). Também casa
      // alunos que COMPARTILHAM o mesmo número (irmãos com o mesmo responsável) — a
      // conversa só existe no nome de um deles (1 conversa por whatsapp_jid+departamento),
      // então buscar pelo nome do outro irmão precisa achar a mesma conversa.
      if (busca && busca.trim()) {
        const termo = busca.toLowerCase().trim();
        const termoDigits = termo.replace(/\D/g, '');

        const digitsCompartilhados = new Set<string>();
        alunos.forEach(a => {
          const nomeMatch = (a.nome || '').toLowerCase().includes(termo);
          const foneMatch = termoDigits.length >= 4 && digitsDoAluno(a).some(d => d.includes(termoDigits));
          if (nomeMatch || foneMatch) {
            digitsDoAluno(a).forEach(d => digitsCompartilhados.add(d));
          }
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

      // Monta o mapa de irmãos por número para os cards visíveis.
      const digitsVisiveis = new Set(
        resultado
          .filter(c => c.aluno_id && c.whatsapp_jid)
          .map(c => (c.whatsapp_jid || '').replace(/\D/g, '').slice(-11))
          .filter(d => d.length >= 10)
      );

      const novoMapa: Record<string, { id: number; nome: string }[]> = {};
      alunos.forEach(a => {
        digitsDoAluno(a).forEach(d => {
          if (digitsVisiveis.has(d)) {
            if (!novoMapa[d]) novoMapa[d] = [];
            if (!novoMapa[d].some(x => x.id === a.id)) {
              novoMapa[d].push({ id: a.id, nome: a.nome });
            }
          }
        });
      });
      setIrmaosPorNumero(novoMapa);
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
    irmaosPorNumero,
    refetch: fetchConversas,
    marcarComoLida,
  };
}

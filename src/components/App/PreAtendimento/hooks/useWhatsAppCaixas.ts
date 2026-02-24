import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { WhatsAppCaixa } from '../types';

interface UseWhatsAppCaixasParams {
  unidadeId?: string;
}

export function useWhatsAppCaixas({ unidadeId }: UseWhatsAppCaixasParams = {}) {
  const [caixas, setCaixas] = useState<WhatsAppCaixa[]>([]);
  const [caixaSelecionada, setCaixaSelecionada] = useState<WhatsAppCaixa | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchCaixas = useCallback(async () => {
    try {
      let query = supabase
        .from('whatsapp_caixas')
        .select('id, nome, numero, unidade_id, uazapi_url, uazapi_token, ativo, webhook_url, funcao, created_at')
        .eq('ativo', true)
        .order('nome');

      // Filtrar por unidade (se não for admin/todos)
      if (unidadeId && unidadeId !== 'todos') {
        query = query.eq('unidade_id', unidadeId);
      }

      const { data, error } = await query;

      if (error) throw error;

      const lista = (data || []) as WhatsAppCaixa[];
      setCaixas(lista);

      // Auto-selecionar a primeira caixa se nenhuma selecionada
      if (!caixaSelecionada && lista.length > 0) {
        setCaixaSelecionada(lista[0]);
      }
      // Se a caixa selecionada não está mais na lista (mudou unidade), resetar
      if (caixaSelecionada && !lista.find(c => c.id === caixaSelecionada.id)) {
        setCaixaSelecionada(lista.length > 0 ? lista[0] : null);
      }
    } catch (err) {
      console.error('[useWhatsAppCaixas] Erro:', err);
    } finally {
      setLoading(false);
    }
  }, [unidadeId]);

  useEffect(() => {
    fetchCaixas();
  }, [fetchCaixas]);

  const selecionarCaixa = useCallback((caixa: WhatsAppCaixa | null) => {
    setCaixaSelecionada(caixa);
  }, []);

  return {
    caixas,
    caixaSelecionada,
    selecionarCaixa,
    loading,
    refetch: fetchCaixas,
  };
}

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
      const { data, error } = await supabase.rpc(
        'listar_whatsapp_caixas_seguras',
        {
          p_unidade_id:
            unidadeId && unidadeId !== 'todos' ? unidadeId : null,
          p_incluir_globais: false,
        },
      );

      if (error) throw error;

      const lista = (data || []).map((caixa) => ({
        id: caixa.id,
        nome: caixa.nome,
        numero: caixa.numero_mascarado,
        unidade_id: caixa.unidade_id,
        ativo: caixa.ativo,
        funcao: caixa.funcao,
        departamento: caixa.departamento,
        provedor: caixa.provedor,
      })) as WhatsAppCaixa[];
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
